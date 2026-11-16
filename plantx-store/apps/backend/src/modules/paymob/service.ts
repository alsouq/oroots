import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { isValidTransactionHmac } from "./hmac"

export type PaymobOptions = {
  /** Secret key from Paymob dashboard (Settings > Account info). */
  secretKey: string
  /** Public key used to open the unified checkout page. */
  publicKey: string
  /** Legacy API key, used to query transaction status. */
  apiKey: string
  /** HMAC secret used to verify callbacks. */
  hmacSecret: string
  /** Comma separated integration ids (card, wallet, ...). */
  integrationIds: string
  /** Public URL of this backend, used for the server-to-server callback. */
  backendUrl: string
  /** Storefront page Paymob redirects the customer to after paying. */
  redirectUrl: string
  baseUrl?: string
}

type InjectedDependencies = { logger: Logger }

type BillingInput = {
  first_name?: string
  last_name?: string
  email?: string
  phone_number?: string
  city?: string
  street?: string
}

const toCents = (amount: unknown) => Math.round(Number(amount) * 100)

class PaymobProviderService extends AbstractPaymentProvider<PaymobOptions> {
  static identifier = "paymob"

  protected logger_: Logger
  protected options_: PaymobOptions

  static validateOptions(options: Record<string, unknown>) {
    for (const key of ["secretKey", "publicKey", "hmacSecret", "integrationIds"]) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Paymob option "${key}" is required`
        )
      }
    }
  }

  constructor(container: InjectedDependencies, options: PaymobOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
  }

  private get base() {
    return (this.options_.baseUrl || "https://accept.paymob.com").replace(/\/$/, "")
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    })
    const text = await res.text()
    if (!res.ok) {
      this.logger_.error(`Paymob ${path} failed (${res.status}): ${text.slice(0, 500)}`)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Paymob request failed with status ${res.status}`
      )
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  private async authToken(): Promise<string> {
    const res = await this.request<{ token: string }>("/api/auth/tokens", {
      method: "POST",
      body: JSON.stringify({ api_key: this.options_.apiKey }),
    })
    return res.token
  }

  /** Builds the hosted checkout URL the storefront redirects the customer to. */
  private checkoutUrl(clientSecret: string) {
    const q = new URLSearchParams({
      publicKey: this.options_.publicKey,
      clientSecret,
    })
    return `${this.base}/unifiedcheckout/?${q.toString()}`
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = String(input.data?.session_id ?? "")
    // Billing details come from the storefront. They are only used to prefill
    // Paymob's form; the amount always comes from Medusa, never from the client.
    const client = (input.data?.client ?? {}) as { billing?: BillingInput }
    const billing = client.billing ?? {}
    const customer = input.context?.customer
    const amountCents = toCents(input.amount)

    const body = {
      amount: amountCents,
      currency: input.currency_code.toUpperCase(),
      payment_methods: this.options_.integrationIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter(Boolean),
      items: [],
      billing_data: {
        first_name: billing.first_name || customer?.first_name || "NA",
        last_name: billing.last_name || customer?.last_name || "NA",
        email: billing.email || customer?.email || "na@plantx-egypt.com",
        phone_number: billing.phone_number || customer?.phone || "+200000000000",
        city: billing.city || "NA",
        street: billing.street || "NA",
        building: "NA",
        floor: "NA",
        apartment: "NA",
        country: "EG",
      },
      special_reference: sessionId,
      notification_url: `${this.options_.backendUrl.replace(/\/$/, "")}/hooks/paymob`,
      redirection_url: this.options_.redirectUrl,
    }

    const intention = await this.request<{
      id: string
      client_secret: string
      intention_order_id?: number
    }>("/v1/intention/", {
      method: "POST",
      headers: { Authorization: `Token ${this.options_.secretKey}` },
      body: JSON.stringify(body),
    })

    return {
      id: intention.id,
      status: PaymentSessionStatus.PENDING,
      data: {
        session_id: sessionId,
        intention_id: intention.id,
        paymob_order_id: intention.intention_order_id,
        amount_cents: amountCents,
        checkout_url: this.checkoutUrl(intention.client_secret),
      },
    }
  }

  /** Looks the order up on Paymob and maps its latest transaction to a status. */
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const orderId = input.data?.paymob_order_id
    if (!orderId || !this.options_.apiKey) {
      return { status: PaymentSessionStatus.PENDING, data: input.data }
    }
    const token = await this.authToken()
    const tx = await this.request<Record<string, unknown>>(
      "/api/ecommerce/orders/transaction_inquiry",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId }),
      }
    )
    const expected = Number(input.data?.amount_cents)
    if (tx.success === true && tx.pending === false) {
      if (expected && Number(tx.amount_cents) !== expected) {
        this.logger_.warn(`Paymob amount mismatch for order ${orderId}`)
        return { status: PaymentSessionStatus.ERROR, data: input.data }
      }
      return {
        status: PaymentSessionStatus.CAPTURED,
        data: { ...input.data, transaction_id: tx.id },
      }
    }
    if (tx.pending === true) {
      return { status: PaymentSessionStatus.PENDING, data: input.data }
    }
    return { status: PaymentSessionStatus.ERROR, data: input.data }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    if (input.data?.transaction_id && input.data?.paid === true) {
      return { status: PaymentSessionStatus.CAPTURED, data: input.data }
    }
    return this.getPaymentStatus(input)
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Paymob card and wallet integrations settle immediately ("sale"), so the
    // money is already captured when the order is placed.
    return { data: input.data }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const transactionId = input.data?.transaction_id
    if (!transactionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This Paymob payment has no transaction id to refund"
      )
    }
    await this.request("/api/acceptance/void_refund/refund", {
      method: "POST",
      headers: { Authorization: `Token ${this.options_.secretKey}` },
      body: JSON.stringify({
        transaction_id: transactionId,
        amount_cents: toCents(input.amount),
      }),
    })
    return { data: input.data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // The amount changed (cart edited): start a fresh intention.
    const res = await this.initiatePayment({
      amount: input.amount,
      currency_code: input.currency_code,
      data: input.data,
      context: input.context,
    })
    return { status: res.status, data: res.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // The /hooks/paymob route copies the "hmac" query parameter into the body.
    const body = (payload.data ?? {}) as {
      type?: string
      obj?: Record<string, unknown>
      hmac?: string
    }
    const headers = payload.headers as Record<string, string | undefined>
    const hmac = body.hmac || headers?.["hmac"]
    const tx = body.obj

    if (body.type !== "TRANSACTION" || !tx) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }
    if (!isValidTransactionHmac(tx, hmac, this.options_.hmacSecret)) {
      this.logger_.warn("Rejected Paymob callback with an invalid HMAC")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const order = (tx.order ?? {}) as Record<string, unknown>
    const sessionId = String(order.merchant_order_id ?? tx.special_reference ?? "")
    if (!sessionId.startsWith("payses_")) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }
    const amount = Number(tx.amount_cents) / 100

    if (tx.success === true && tx.pending === false && tx.is_refunded !== true) {
      return { action: PaymentActions.SUCCESSFUL, data: { session_id: sessionId, amount } }
    }
    if (tx.pending === true) {
      return { action: PaymentActions.PENDING, data: { session_id: sessionId, amount } }
    }
    return { action: PaymentActions.FAILED, data: { session_id: sessionId, amount } }
  }
}

export default PaymobProviderService
