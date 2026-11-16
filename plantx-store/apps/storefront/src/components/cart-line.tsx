"use client"

import { useTransition } from "react"
import { updateLine } from "@/lib/actions"

export function LineQty({ id, quantity, removeLabel }: { id: string; quantity: number; removeLabel: string }) {
  const [pending, start] = useTransition()
  return (
    <>
      <div className="qty" style={{ opacity: pending ? 0.5 : 1 }}>
        <button type="button" aria-label="-" disabled={pending} onClick={() => start(() => updateLine(id, quantity - 1))}>−</button>
        <input aria-label="Quantity" value={quantity} readOnly />
        <button type="button" aria-label="+" disabled={pending} onClick={() => start(() => updateLine(id, quantity + 1))}>+</button>
      </div>
      <button type="button" className="link-btn" disabled={pending} onClick={() => start(() => updateLine(id, 0))}>
        {removeLabel}
      </button>
    </>
  )
}
