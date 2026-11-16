import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { getRegionId, sdk } from "./medusa"

export const CART_COOKIE = "px_cart"

const PRODUCT_FIELDS =
  "id,title,handle,description,thumbnail,metadata,collection_id,*collection,*images,*options,*options.values,*variants,*variants.options,*variants.calculated_price,+variants.inventory_quantity"

export async function listProducts(collectionHandle?: string) {
  const region_id = await getRegionId()
  let collection_id: string[] | undefined
  if (collectionHandle) {
    const { collections } = await sdk.store.collection.list({ handle: collectionHandle })
    collection_id = collections.map((c) => c.id)
  }
  const { products } = await sdk.store.product.list(
    { region_id, fields: PRODUCT_FIELDS, limit: 100, collection_id },
    { next: { revalidate: 60 } } as never
  )
  return products
}

export async function getProduct(handle: string) {
  const region_id = await getRegionId()
  const { products } = await sdk.store.product.list({
    region_id,
    handle,
    fields: PRODUCT_FIELDS,
    limit: 1,
  })
  return products[0] as HttpTypes.StoreProduct | undefined
}

export async function listCollections() {
  const { collections } = await sdk.store.collection.list({
    fields: "id,title,handle,metadata",
    limit: 20,
  })
  return collections
}

const CART_FIELDS =
  "id,email,total,subtotal,shipping_total,item_total,currency_code,metadata,*items,*items.variant,*items.variant.options,*items.product,*shipping_address,*shipping_methods,*payment_collection,*payment_collection.payment_sessions"

export async function getCart(): Promise<HttpTypes.StoreCart | null> {
  const id = (await cookies()).get(CART_COOKIE)?.value
  if (!id) {
    return null
  }
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: CART_FIELDS })
    return cart.completed_at ? null : cart
  } catch {
    return null
  }
}

/** Lowest current price of a product and its regular price, for listings. */
export function priceRange(p: HttpTypes.StoreProduct) {
  const prices = (p.variants ?? [])
    .map((v) => v.calculated_price)
    .filter((c): c is NonNullable<typeof c> => !!c && c.calculated_amount != null)
  if (!prices.length) {
    return null
  }
  const min = prices.reduce((a, b) => (Number(b.calculated_amount) < Number(a.calculated_amount) ? b : a))
  return {
    amount: Number(min.calculated_amount),
    original: Number(min.original_amount),
    onSale: Number(min.original_amount) > Number(min.calculated_amount),
  }
}

export async function getShippingRates(): Promise<Record<string, { amount: number; days?: string }>> {
  const res = await sdk.client.fetch<{ rates: Record<string, { amount: number; days?: string }> }>(
    "/store/shipping-rates"
  )
  return res.rates
}
