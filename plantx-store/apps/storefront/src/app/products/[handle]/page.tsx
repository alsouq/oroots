import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AddToCart } from "@/components/add-to-cart"
import { Gallery } from "@/components/gallery"
import { WhatsappIcon } from "@/components/icons"
import { getProduct } from "@/lib/data"
import { dict, getLang, optionTitle, optionValue, productTitle } from "@/lib/i18n"

type Params = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await getProduct((await params).handle)
  return p ? { title: p.title ?? undefined, description: p.description?.slice(0, 160) } : {}
}

export default async function ProductPage({ params }: Params) {
  const { handle } = await params
  const [product, lang] = await Promise.all([getProduct(handle), getLang()])
  if (!product) {
    notFound()
  }
  const t = dict[lang]
  const title = productTitle(product, lang)
  const descAr = product.metadata?.description_ar
  const description = lang === "ar" && typeof descAr === "string" && descAr ? descAr : product.description
  const values = Object.fromEntries(
    (product.options ?? []).flatMap((o) => (o.values ?? []).map((v) => [v.value, optionValue(v.value, lang)]))
  )
  const optionLabels = Object.fromEntries((product.options ?? []).map((o) => [o.title, optionTitle(o.title, lang)]))
  const images = (product.images ?? []).map((i) => i.url)
  const wa = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "201036004753"}?text=${encodeURIComponent(`${title}\n`)}`

  return (
    <div className="wrap pdp">
      <Gallery images={images.length ? images : product.thumbnail ? [product.thumbnail] : []} alt={title} />
      <div className="pdp-info">
        <span className="eyebrow">{product.collection?.title}</span>
        <h1>{title}</h1>
        <AddToCart
          product={product}
          lang={lang}
          labels={{ addToCart: t.addToCart, adding: t.adding, added: t.added, outOfStock: t.outOfStock }}
          optionLabels={optionLabels}
          valueLabels={values}
        />
        <div className="wa-hint"><WhatsappIcon /><span>{t.freeConsult} <a href={wa} target="_blank" rel="noopener">WhatsApp</a></span></div>
        {description && (
          <div className="desc" dir={description === product.description ? "ltr" : undefined}>
            <h3 style={{ marginBottom: 8, color: "var(--ink)" }}>{t.description}</h3>
            {description}
          </div>
        )}
      </div>
    </div>
  )
}
