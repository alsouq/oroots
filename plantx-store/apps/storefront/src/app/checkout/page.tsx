import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CheckoutForm } from "@/components/checkout-form"
import { getCart, getShippingRates } from "@/lib/data"
import { dict, formatMoney, getLang, optionValue, productTitle } from "@/lib/i18n"
import { getRegionId, sdk } from "@/lib/medusa"

export const metadata: Metadata = { title: "Checkout" }
export const dynamic = "force-dynamic"

export default async function CheckoutPage() {
  const [cart, lang] = await Promise.all([getCart(), getLang()])
  if (!cart?.items?.length) {
    redirect("/cart")
  }
  const t = dict[lang]
  const [rates, { payment_providers }] = await Promise.all([
    getShippingRates(),
    sdk.store.payment.listPaymentProviders({ region_id: await getRegionId() }),
  ])
  const onlinePayment = payment_providers.some((p) => p.id === "pp_paymob_paymob")

  const summary = (
    <div style={{ display: "grid", gap: 10 }}>
      {cart.items.map((i) => (
        <div className="mini" key={i.id}>
          {i.thumbnail ? <img src={i.thumbnail} alt="" /> : <span />}
          <div>
            {i.product ? productTitle(i.product, lang) : i.product_title}
            <small style={{ display: "block", color: "var(--muted)" }}>
              {(i.variant?.options ?? []).map((o) => optionValue(o.value, lang)).join(" · ")} × {i.quantity}
            </small>
          </div>
          <b>{formatMoney(Number(i.total), lang)}</b>
        </div>
      ))}
    </div>
  )

  return (
    <div className="wrap">
      <div className="page-head"><h1>{t.checkout}</h1></div>
      <CheckoutForm t={t} lang={lang} rates={rates} subtotal={Number(cart.item_total)} onlinePayment={onlinePayment} summary={summary} />
    </div>
  )
}
