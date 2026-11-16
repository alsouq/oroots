import Medusa from "@medusajs/js-sdk"

export const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

export const sdk = new Medusa({
  baseUrl: BACKEND_URL,
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  debug: false,
})

let regionId: string | undefined

/** The store sells in one region (Egypt, EGP). */
export async function getRegionId(): Promise<string> {
  if (regionId) {
    return regionId
  }
  const { regions } = await sdk.store.region.list({ limit: 1 })
  if (!regions.length) {
    throw new Error("No region configured in the Medusa admin")
  }
  regionId = regions[0].id
  return regionId
}
