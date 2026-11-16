"use client"

import { useTransition } from "react"
import { setLang } from "@/lib/actions"

export function LangToggle({ lang, label }: { lang: "ar" | "en"; label: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      className="lang"
      type="button"
      disabled={pending}
      onClick={() => start(() => setLang(lang === "ar" ? "en" : "ar"))}
    >
      {label}
    </button>
  )
}
