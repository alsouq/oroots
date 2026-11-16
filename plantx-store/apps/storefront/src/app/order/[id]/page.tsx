import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CheckIcon, WhatsappIcon } from "@/components/icons"
import { governorateName } from "@/lib/governorates"
import { dict, formatMoney, getLang, optionValue } from "@/lib/i18n"
import { sdk } from "@/lib/medusa"

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await getLang()
  const t = dict[lang]
  let order
  try {
    ;({ order } = await sdk.store.order.retrieve(id, {
      fields: "id,display_id,total,shipping_total,item_total,email,metadata,*items,*items.variant.options,*shipping_address",
    }))
  } catch {
    notFound()
  }
  const a = order.shipping_address
  const payment = order.metadata?.payment_method === "paymob" ? t.online : t.cod
  const text = [
    `${lang === "ar" ? "طلب جديد" : "New order"} PX-${order.display_id}`,
    ...(order.items ?? []).map((i) => `- ${i.product_title} (${(i.variant?.options ?? []).map((o) => o.value).join(" / ")}) x ${i.quantity}`),
    `${t.total}: ${formatMoney(Number(order.total), lang)}`,
    `${t.payment}: ${payment}`,
    `${a?.first_name ?? ""} ${a?.last_name ?? ""} - ${a?.phone ?? ""}`,
    `${a?.address_1 ?? ""}, ${a?.city ?? ""}, ${governorateName(a?.province, lang)}`,
  ].join("\n")
  const wa = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "201036004753"}?text=${encodeURIComponent(text)}`

  return (
    <div className="wrap done">
      <div className="tick"><CheckIcon size={30} /></div>
      <h1>{t.thanks}</h1>
      <p className="lead">{t.orderReceived}</p>
      <div className="box">
        <div className="summary" style={{ position: "static", background: "transparent", padding: 0 }}>
          <div className="row"><span>{t.orderNumber}</span><b>PX-{order.display_id}</b></div>
          {(order.items ?? []).map((i) => (
            <div className="row" key={i.id}>
              <span>{i.product_title} · {(i.variant?.options ?? []).map((o) => optionValue(o.value, lang)).join(" · ")} × {i.quantity}</span>
              <span>{formatMoney(Number(i.total), lang)}</span>
            </div>
          ))}
          <div className="row"><span>{t.shipping}</span><span>{formatMoney(Number(order.shipping_total), lang)}</span></div>
          <div className="row total"><span>{t.total}</span><span>{formatMoney(Number(order.total), lang)}</span></div>
          <div className="row"><span>{t.payment}</span><span>{payment}</span></div>
        </div>
      </div>
      <p>{t.confirmHint}</p>
      <a className="btn wa-btn" href={wa} target="_blank" rel="noopener"><WhatsappIcon /> {t.confirmWhatsapp}</a>
      <Link className="link-btn" href="/shop">{t.continueShopping}</Link>
    </div>
  )
}
