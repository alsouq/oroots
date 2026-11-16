"use client"

import Link from "next/link"
import { useState } from "react"

type Item = { href: string; label: string }

export function NavMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ul className={`links${open ? " open" : ""}`}>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} onClick={() => setOpen(false)}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
      <button
        className="menu-btn"
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
      </button>
    </>
  )
}
