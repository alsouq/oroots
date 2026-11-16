"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { CART_COOKIE, getCart } from "./data"
import { getRegionId, sdk } from "./medusa"
import { GOVERNORATES } from "./governorates"

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export async function setLang(lang: "ar" | "en") {
  ;(await cookies()).set("lang", lang, { ...COOKIE_OPTS, httpOnly: false })
  revalidatePath("/", "layout")
}

async function ensureCart() {
  const existing = await getCart()
  if (existing) {
    return existing
  }
  const region_id = await getRegionId()
  const { cart } = await sdk.store.cart.create({ region_id })
  ;(await cookies()).set(CART_COOKIE, cart.id, COOKIE_OPTS)
  return cart
}

export async function addToCart(variantId: string, quantity: number) {
  const qty = Math.max(1, Math.min(99, Math.floor(quantity)))
  const cart = await ensureCart()
  try {
    await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity: qty })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function updateLine(lineId: string, quantity: number) {
  const cart = await getCart()
  if (!cart) {
    return
  }
  if (quantity <= 0) {
    await sdk.store.cart.deleteLineItem(cart.id, lineId)
  } else {
    await sdk.store.cart.updateLineItem(cart.id, lineId, { quantity: Math.min(99, quantity) })
  }
  revalidatePath("/", "layout")
}

export type CheckoutState = { error?: string }

const clean = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max)

export async function placeOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const cart = await getCart()
  if (!cart || !cart.items?.length) {
    return { error: "empty" }
  }

  const phone = clean(form.get("phone"), 20).replace(/[^\d+]/g, "")
  const province = clean(form.get("province"), 10)
  const payment = clean(form.get("payment"), 20) === "paymob" ? "paymob" : "cod"
  const address = {
    first_name: clean(form.get("first_name"), 60),
    last_name: clean(form.get("last_name"), 60),
    phone,
    address_1: clean(form.get("address_1"), 250),
    city: clean(form.get("city"), 80),
    province,
    country_code: "eg",
  }
  const email = clean(form.get("email"), 120)

  if (!address.first_name || !address.address_1 || !address.city) {
    return { error: "missing" }
  }
  if (!/^(\+?20|0)?1[0125]\d{8}$/.test(phone)) {
    return { error: "phone" }
  }
  if (!GOVERNORATES.some((g) => g.code === province)) {
    return { error: "governorate" }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "email" }
  }

  await sdk.store.cart.update(cart.id, {
    email,
    shipping_address: address,
    billing_address: address,
    metadata: { payment_method: payment, delivery_notes: clean(form.get("notes"), 250) },
  })

  const { shipping_options } = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
  const option = shipping_options[0]
  if (!option) {
    return { error: "shipping" }
  }
  const { cart: updated } = await sdk.store.cart.addShippingMethod(cart.id, { option_id: option.id })

  const providerId = payment === "paymob" ? "pp_paymob_paymob" : "pp_system_default"
  const { payment_collection } = await sdk.store.payment.initiatePaymentSession(updated, {
    provider_id: providerId,
    data: {
      billing: {
        first_name: address.first_name,
        last_name: address.last_name || address.first_name,
        email,
        phone_number: phone,
        city: address.city,
        street: address.address_1,
      },
    },
  })

  if (payment === "paymob") {
    const session = payment_collection.payment_sessions?.find((s) => s.provider_id === providerId)
    const url = session?.data?.checkout_url
    if (typeof url !== "string") {
      return { error: "payment" }
    }
    redirect(url)
  }

  const result = await sdk.store.cart.complete(cart.id)
  if (result.type !== "order") {
    return { error: "complete" }
  }
  ;(await cookies()).delete(CART_COOKIE)
  redirect(`/order/${result.order.id}`)
}

/** Called when Paymob sends the customer back to the store. */
export async function completeAfterPaymob(): Promise<string | null> {
  const id = (await cookies()).get(CART_COOKIE)?.value
  if (!id) {
    return null
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await sdk.store.cart.complete(id)
      if (result.type === "order") {
        return result.order.id
      }
    } catch {
      // The webhook may still be processing; wait and retry.
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return null
}
