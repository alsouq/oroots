import Link from "next/link"
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"
import { listCollections, listProducts } from "@/lib/data"
import { dict, getLang } from "@/lib/i18n"

export const metadata: Metadata = { title: "Shop" }

export default async function Shop({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams
  const lang = await getLang()
  const t = dict[lang]
  const [products, collections] = await Promise.all([listProducts(c), listCollections()])
  const current = collections.find((x) => x.handle === c)
  const note = current?.metadata?.title_ar
  return (
    <div className="shop" style={{ paddingBottom: 96 }}>
      <div className="wrap">
        <div className="page-head">
          <span className="eyebrow">{t.shop}</span>
          <h1>{current ? current.title : t.shopTitle}</h1>
          <p className="lead">{lang === "ar" && typeof note === "string" ? note : t.shopLead}</p>
        </div>
        <div className="chips" style={{ marginBottom: 28 }}>
          <Link className="chip" aria-pressed={!c} href="/shop">{t.allProducts}</Link>
          {collections.map((col) => (
            <Link key={col.id} className="chip" aria-pressed={col.handle === c} href={`/shop?c=${col.handle}`}>
              {col.title.replace("PlantX ", "")}
            </Link>
          ))}
        </div>
        <div className="prod-grid">
          {products.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
        </div>
      </div>
    </div>
  )
}
