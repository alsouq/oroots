import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from "@medusajs/framework/types"

export type BostaOptions = {
  apiKey: string
  baseUrl?: string
  /** Default package size sent to Bosta: SMALL, MEDIUM or LARGE. */
  packageSize?: string
}

/** Governorate codes used by the storefront, mapped to Bosta city names. */
export const BOSTA_CITY: Record<string, string> = {
  "eg-c": "Cairo",
  "eg-gz": "Giza",
  "eg-alx": "Alexandria",
  "eg-kb": "Qalyubia",
  "eg-bh": "Behira",
  "eg-dk": "Dakahlia",
  "eg-gh": "Gharbia",
  "eg-kfs": "Kafr Alsheikh",
  "eg-mnf": "Menofia",
  "eg-shr": "Sharqia",
  "eg-dt": "Damietta",
  "eg-pts": "Port Said",
  "eg-is": "Ismailia",
  "eg-suz": "Suez",
  "eg-fym": "Fayoum",
  "eg-bns": "Bani Suif",
  "eg-mn": "Menya",
  "eg-ast": "Assuit",
  "eg-shg": "Sohag",
  "eg-kn": "Qena",
  "eg-lx": "Luxor",
  "eg-asn": "Aswan",
  "eg-ba": "Red Sea",
  "eg-mt": "Matrouh",
  "eg-wad": "New Valley",
  "eg-js": "South Sinai",
  "eg-sin": "North Sinai",
}

type InjectedDependencies = { logger: Logger }

class BostaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "bosta"

  protected logger_: Logger
  protected options_: BostaOptions

  constructor(container: InjectedDependencies, options: BostaOptions) {
    super()
    this.logger_ = container.logger
    this.options_ = options
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.apiKey) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bosta apiKey is required")
    }
  }

  private get base() {
    return (this.options_.baseUrl || "https://app.bosta.co/api/v2").replace(/\/$/, "")
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.options_.apiKey,
        ...(init.headers || {}),
      },
    })
    const text = await res.text()
    if (!res.ok) {
      this.logger_.error(`Bosta ${path} failed (${res.status}): ${text.slice(0, 500)}`)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Bosta request failed with status ${res.status}`
      )
    }
    const json = text ? JSON.parse(text) : {}
    return (json.data ?? json) as T
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "bosta-standard", name: "Bosta home delivery" }]
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return { ...optionData, ...data }
  }

  async validateOption(): Promise<boolean> {
    return true
  }

  async canCalculate(): Promise<boolean> {
    return false
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    const address = (fulfillment.delivery_address ?? order?.shipping_address ?? {}) as Record<
      string,
      string | undefined
    >
    const province = (address.province || "").toLowerCase()
    const city = BOSTA_CITY[province]
    if (!city) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown governorate "${address.province}" for Bosta`
      )
    }
    const meta = (order?.metadata ?? {}) as Record<string, unknown>
    const isCod = meta.payment_method === "cod"
    const itemsCount = items.reduce((n, i) => n + Number(i.quantity ?? 0), 0)

    const body = {
      type: 10,
      specs: {
        packageType: "Parcel",
        size: this.options_.packageSize || "SMALL",
        packageDetails: {
          itemsCount,
          description: items.map((i) => `${i.quantity} x ${i.title}`).join(", ").slice(0, 250),
        },
      },
      notes: String(meta.delivery_notes ?? "").slice(0, 250),
      cod: isCod ? Number(order?.total ?? 0) : 0,
      dropOffAddress: {
        city,
        firstLine: address.address_1 || "",
        secondLine: [address.address_2, address.city].filter(Boolean).join(" - "),
      },
      receiver: {
        firstName: address.first_name || "",
        lastName: address.last_name || "",
        phone: address.phone || "",
        email: order?.email || undefined,
      },
      businessReference: order?.display_id ? `PX-${order.display_id}` : order?.id,
      allowToOpenPackage: false,
    }

    const created = await this.request<{ _id?: string; trackingNumber?: string }>("/deliveries", {
      method: "POST",
      body: JSON.stringify(body),
    })

    return {
      data: { ...data, bosta_id: created._id, tracking_number: created.trackingNumber },
      labels: created.trackingNumber
        ? [
            {
              tracking_number: created.trackingNumber,
              tracking_url: `https://bosta.co/tracking-shipments?shipment-number=${created.trackingNumber}`,
              label_url: "",
            },
          ]
        : [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tracking = data.tracking_number
    if (tracking) {
      await this.request(`/deliveries/business/${tracking}/terminate`, { method: "DELETE" })
    }
    return {}
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }
}

export default BostaFulfillmentService
