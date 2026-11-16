import Link from "next/link"
import type { Metadata } from "next"
import { LineQty } from "@/components/cart-line"
import { getCart } from "@/lib/data"
import { dict, formatMoney, getLang, optionValue, productTitle } from "@/lib/i18n"

export const metadata: Metadata = { title: "Cart" }
export const dynamic = "force-dynamic"

export default async function CartPage() {
  const [cart, lang] = await Promise.all([getCart(), getLang()])
  const t = dict[lang]
  const items = cart?.items ?? []
  return (
    <div className="wrap">
      <div className="page-head"><h1>{t.cart}</h1></div>
      {!items.length ? (
        <div style={{ paddingBottom: 96, display: "grid", gap: 16, justifyItems: "start" }}>
          <p className="lead">{t.emptyCart}</p>
          <Link className="btn btn-primary" href="/shop">{t.continueShopping}</Link>
        </div>
      ) : (
        <div className="cart-grid">
          <div className="lines">
            {items.map((i) => (
              <div className="line" key={i.id}>
                {i.thumbnail ? <img src={i.thumbnail} alt="" /> : <span />}
                <div>
                  <h3><Link href={`/products/${i.product_handle}`}>{i.product ? productTitle(i.product, lang) : i.product_title}</Link></h3>
                  <small>{(i.variant?.options ?? []).map((o) => optionValue(o.value, lang)).join(" · ")}</small>
                  <small>{formatMoney(Number(i.unit_price), lang)}</small>
                </div>
                <div className="end">
                  <b>{formatMoney(Number(i.total), lang)}</b>
                  <LineQty id={i.id} quantity={Number(i.quantity)} removeLabel={t.remove} />
                </div>
              </div>
            ))}
          </div>
          <aside className="summary">
            <div className="row"><span>{t.subtotal}</span><b>{formatMoney(Number(cart!.item_total), lang)}</b></div>
            <div className="row"><span>{t.shipping}</span><span>{t.shippingCalc}</span></div>
            <div className="row total"><span>{t.total}</span><span>{formatMoney(Number(cart!.item_total), lang)}</span></div>
            <Link className="btn btn-primary" href="/checkout">{t.checkout} <span className="arrow">→</span></Link>
            <Link className="link-btn" href="/shop" style={{ textAlign: "center" }}>{t.continueShopping}</Link>
          </aside>
        </div>
      )}
    </div>
  )
}
