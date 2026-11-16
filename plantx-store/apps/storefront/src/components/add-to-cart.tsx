"use client"

import { useMemo, useState, useTransition } from "react"
import type { HttpTypes } from "@medusajs/types"
import { addToCart } from "@/lib/actions"

type Labels = {
  addToCart: string
  adding: string
  added: string
  outOfStock: string
}

type Props = {
  product: HttpTypes.StoreProduct
  lang: "ar" | "en"
  labels: Labels
  optionLabels: Record<string, string>
  valueLabels: Record<string, string>
}

const fmt = (n: number, lang: "ar" | "en") =>
  `${new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)} ${lang === "ar" ? "ج.م" : "EGP"}`

export function AddToCart({ product, lang, labels, optionLabels, valueLabels }: Props) {
  const options = product.options ?? []
  const variants = product.variants ?? []
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const first = variants[0]
    return Object.fromEntries((first?.options ?? []).map((o) => [o.option_id!, o.value]))
  })
  const [qty, setQty] = useState(1)
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle")
  const [pending, start] = useTransition()

  const variant = useMemo(
    () =>
      variants.find((v) => (v.options ?? []).every((o) => selected[o.option_id!] === o.value)),
    [variants, selected]
  )
  const price = variant?.calculated_price
  const inStock =
    !!variant && (variant.manage_inventory === false || Number(variant.inventory_quantity ?? 0) > 0)

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {price && (
        <div className="pdp-price">
          <b>{fmt(Number(price.calculated_amount), lang)}</b>
          {Number(price.original_amount) > Number(price.calculated_amount) && (
            <s>{fmt(Number(price.original_amount), lang)}</s>
          )}
        </div>
      )}
      {options.map((o) => (
        <div className="opt-group" key={o.id}>
          <span>{optionLabels[o.title] ?? o.title}</span>
          <div className="chips">
            {(o.values ?? [])
              .filter((v) => variants.some((vr) => vr.options?.some((x) => x.value === v.value && x.option_id === o.id)))
              .map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="chip"
                  aria-pressed={selected[o.id] === v.value}
                  onClick={() => {
                    setSelected((s) => ({ ...s, [o.id]: v.value }))
                    setStatus("idle")
                  }}
                >
                  {valueLabels[v.value] ?? v.value}
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="buy-row">
        <div className="qty">
          <button type="button" aria-label="-" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <input aria-label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
          <button type="button" aria-label="+" onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!inStock || pending}
          onClick={() =>
            start(async () => {
              const res = await addToCart(variant!.id, qty)
              setStatus(res.ok ? "added" : "error")
            })
          }
        >
          {!inStock ? labels.outOfStock : pending ? labels.adding : labels.addToCart}
        </button>
      </div>
      {status === "added" && (
        <p className="note-ok">
          {labels.added} · <a href="/cart">{lang === "ar" ? "اعرض السلة" : "View cart"}</a>
        </p>
      )}
      {status === "error" && <p className="note-err">{lang === "ar" ? "حصلت مشكلة، حاول تاني." : "Something went wrong, please try again."}</p>}
    </div>
  )
}
