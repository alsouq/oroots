import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { DEFAULT_REGION_STORE_POLICIES } from "../lib/region-store-policies"
import { SHIPPING_ZONES } from "../lib/egypt"

/**
 * Sets up the PlantX store: Egypt region in EGP, cash on delivery plus any
 * configured online payment provider, one warehouse and shipping rates per
 * governorate zone. Products are added separately (src/scripts/seed-plantx.ts).
 */
export default async function initial_data_seed({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(ModuleRegistrationName.FULFILLMENT)
  const paymentModuleService = container.resolve(ModuleRegistrationName.PAYMENT)

  logger.info("Seeding PlantX store...")
  const {
    result: [salesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: { salesChannelsData: [{ name: "PlantX Website", description: "plantx-egypt.com" }] },
  })

  const {
    result: [publishableKey],
  } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "" }] },
  })
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableKey.id, add: [salesChannel.id] },
  })

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "PlantX Horticulture Solutions",
          supported_currencies: [{ currency_code: "egp", is_default: true }],
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  })

  const providers = await paymentModuleService.listPaymentProviders({ is_enabled: true })
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Egypt",
          currency_code: "egp",
          countries: ["eg"],
          payment_providers: providers.map((p) => p.id),
          metadata: {
            ...DEFAULT_REGION_STORE_POLICIES,
            return_window_days: 14,
            shipping_rate: SHIPPING_ZONES[0].price,
          },
        },
      ],
    },
  })
  const region = regions[0]

  // Prices already include VAT, so the tax region has no default rate.
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "eg", provider_id: "tp_system" }],
  })

  const { result: locations } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        { name: "PlantX Warehouse", address: { city: "Cairo", country_code: "EG", address_1: "" } },
      ],
    },
  })
  const location = locations[0]

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const shippingProfile = profiles[0]

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Egypt home delivery",
    type: "shipping",
    service_zones: SHIPPING_ZONES.map((zone) => ({
      name: zone.name,
      geo_zones: zone.provinces.map((province_code) => ({
        type: "province" as const,
        country_code: "eg",
        province_code,
      })),
    })),
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  await createShippingOptionsWorkflow(container).run({
    input: SHIPPING_ZONES.map((zone) => {
      const serviceZone = fulfillmentSet.service_zones.find((z) => z.name === zone.name)!
      return {
        name: `Home delivery - ${zone.name}`,
        price_type: "flat" as const,
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Home delivery",
          description: `${zone.days} business days`,
          code: `delivery-${zone.key}`,
        },
        prices: [
          { currency_code: "egp", amount: zone.price },
          { region_id: region.id, amount: zone.price },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
          { attribute: "is_return", value: "false", operator: "eq" as const },
        ],
      }
    }),
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: location.id, add: [salesChannel.id] },
  })

  logger.info(`PlantX store ready. Publishable key: ${publishableKey.token}`)
}
