import Link from "next/link"
import type { HttpTypes } from "@medusajs/types"
import { priceRange } from "@/lib/data"
import { dict, formatMoney, productTitle, type Lang } from "@/lib/i18n"

export function ProductCard({ product, lang }: { product: HttpTypes.StoreProduct; lang: Lang }) {
  const t = dict[lang]
  const price = priceRange(product)
  const sizes = product.options?.find((o) => o.title === "Size")?.values?.length ?? 0
  return (
    <Link className="prod" href={`/products/${product.handle}`}>
      <figure className="ph">
        {product.thumbnail && <img src={product.thumbnail} alt={product.title ?? ""} loading="lazy" />}
        {price?.onSale && <span className="badge">{t.sale}</span>}
      </figure>
      <div className="body">
        <span className="cat">{product.collection?.title}</span>
        <h3>{productTitle(product, lang)}</h3>
        {sizes > 1 && <span className="opts">{sizes} {lang === "ar" ? "أحجام" : "sizes"}</span>}
        {price && (
          <div className="price">
            <b>{t.from} {formatMoney(price.amount, lang)}</b>
            {price.onSale && <s>{formatMoney(price.original, lang)}</s>}
          </div>
        )}
      </div>
    </Link>
  )
}
