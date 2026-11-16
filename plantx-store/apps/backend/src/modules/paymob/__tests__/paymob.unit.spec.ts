import crypto from "crypto"
import { PaymentActions } from "@medusajs/framework/utils"
import { computeTransactionHmac, isValidTransactionHmac } from "../hmac"
import PaymobProviderService from "../service"

const SECRET = "test-hmac-secret"

const tx = {
  amount_cents: 21999,
  created_at: "2026-11-16T10:00:00.000000",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 192036465,
  integration_id: 4097558,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 217503754, merchant_order_id: "payses_01TEST" },
  owner: 302852,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
}

const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as any

function provider() {
  return new PaymobProviderService({ logger }, {
    secretKey: "sk",
    publicKey: "pk",
    apiKey: "ak",
    hmacSecret: SECRET,
    integrationIds: "1,2",
    backendUrl: "http://localhost:9000",
    redirectUrl: "http://localhost:8000/checkout/paymob-return",
  })
}

describe("Paymob HMAC", () => {
  it("signs the documented fields in order", () => {
    const message =
      "21999" + "2026-11-16T10:00:00.000000" + "EGP" + "false" + "false" + "192036465" +
      "4097558" + "true" + "false" + "false" + "false" + "true" + "false" + "217503754" +
      "302852" + "false" + "2346" + "MasterCard" + "card" + "true"
    const expected = crypto.createHmac("sha512", SECRET).update(message).digest("hex")
    expect(computeTransactionHmac(tx, SECRET)).toBe(expected)
  })

  it("rejects a tampered amount", () => {
    const hmac = computeTransactionHmac(tx, SECRET)
    expect(isValidTransactionHmac(tx, hmac, SECRET)).toBe(true)
    expect(isValidTransactionHmac({ ...tx, amount_cents: 1 }, hmac, SECRET)).toBe(false)
    expect(isValidTransactionHmac(tx, undefined, SECRET)).toBe(false)
  })
})

describe("Paymob webhook mapping", () => {
  const payload = (obj: Record<string, unknown>, hmac?: string) =>
    ({ data: { type: "TRANSACTION", obj, hmac }, rawData: "", headers: {} }) as any

  it("marks a signed successful transaction as successful", async () => {
    const res = await provider().getWebhookActionAndData(
      payload(tx, computeTransactionHmac(tx, SECRET))
    )
    expect(res).toEqual({
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: "payses_01TEST", amount: 219.99 },
    })
  })

  it("ignores callbacks with a bad signature", async () => {
    const res = await provider().getWebhookActionAndData(payload(tx, "deadbeef"))
    expect(res.action).toBe(PaymentActions.NOT_SUPPORTED)
  })

  it("reports a failed transaction", async () => {
    const failed = { ...tx, success: false }
    const res = await provider().getWebhookActionAndData(
      payload(failed, computeTransactionHmac(failed, SECRET))
    )
    expect(res.action).toBe(PaymentActions.FAILED)
  })
})
