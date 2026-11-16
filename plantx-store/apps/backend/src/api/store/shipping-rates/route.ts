import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Delivery price per governorate, read from the shipping options managed in
 * the admin. The storefront uses it to show the delivery fee as soon as the
 * customer picks a governorate.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "type.description",
      "rules.attribute",
      "rules.value",
      "service_zone.geo_zones.province_code",
      "prices.amount",
      "prices.currency_code",
    ],
  })

  const rates: Record<string, { amount: number; days?: string }> = {}
  for (const option of options) {
    const rules = option.rules ?? []
    const isStore = rules.some((r) => r?.attribute === "enabled_in_store" && r?.value === "true")
    const isReturn = rules.some((r) => r?.attribute === "is_return" && r?.value === "true")
    if (!isStore || isReturn) {
      continue
    }
    const price = (option.prices ?? []).find((p) => p?.currency_code === "egp")
    if (!price) {
      continue
    }
    for (const zone of option.service_zone?.geo_zones ?? []) {
      if (zone?.province_code) {
        rates[zone.province_code] = {
          amount: Number(price.amount),
          days: option.type?.description ?? undefined,
        }
      }
    }
  }
  res.json({ rates })
}
