"use client"

import { useActionState, useState } from "react"
import { placeOrder, type CheckoutState } from "@/lib/actions"
import { GOVERNORATES } from "@/lib/governorates"

type T = Record<string, string>

const ERRORS: Record<string, { ar: string; en: string }> = {
  missing: { ar: "من فضلك كمّل الاسم والعنوان والمدينة.", en: "Please fill in your name, address and city." },
  phone: { ar: "رقم الموبايل لازم يكون رقم مصري صحيح (مثال: 01012345678).", en: "Enter a valid Egyptian mobile number (e.g. 01012345678)." },
  governorate: { ar: "اختار المحافظة.", en: "Choose your governorate." },
  email: { ar: "البريد الإلكتروني مش صحيح.", en: "The email address is not valid." },
  shipping: { ar: "التوصيل مش متاح للمحافظة دي حاليًا.", en: "Delivery is not available to this governorate yet." },
  payment: { ar: "الدفع الإلكتروني مش متاح دلوقتي، جرّب الدفع عند الاستلام.", en: "Online payment is unavailable right now. Try cash on delivery." },
  complete: { ar: "ماقدرناش نأكد الطلب، حاول تاني.", en: "We could not place the order. Please try again." },
  empty: { ar: "السلة فاضية.", en: "Your cart is empty." },
}

export function CheckoutForm({
  t,
  lang,
  rates,
  subtotal,
  onlinePayment,
  summary,
}: {
  t: T
  lang: "ar" | "en"
  rates: Record<string, { amount: number; days?: string }>
  subtotal: number
  onlinePayment: boolean
  summary: React.ReactNode
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {})
  const [province, setProvince] = useState("")
  const fee = rates[province]?.amount
  const days = rates[province]?.days?.replace("business days", t.deliveryDays)
  const money = (n: number) =>
    `${new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)} ${t.egp}`

  return (
    <form action={action} className="co-grid">
      <div className="co-form">
        <fieldset>
          <legend>{t.contactInfo}</legend>
          <div><label htmlFor="first_name">{t.firstName}</label><input id="first_name" name="first_name" required autoComplete="given-name" /></div>
          <div><label htmlFor="last_name">{t.lastName}</label><input id="last_name" name="last_name" autoComplete="family-name" /></div>
          <div><label htmlFor="phone">{t.phone}</label><input id="phone" name="phone" required inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" /></div>
          <div><label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" required autoComplete="email" dir="ltr" /></div>
        </fieldset>
        <fieldset>
          <legend>{t.delivery}</legend>
          <div>
            <label htmlFor="province">{t.governorate}</label>
            <select id="province" name="province" required value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">{t.chooseGov}</option>
              {GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{g[lang]}</option>)}
            </select>
          </div>
          <div><label htmlFor="city">{t.city}</label><input id="city" name="city" required autoComplete="address-level2" /></div>
          <div className="full"><label htmlFor="address_1">{t.address}</label><input id="address_1" name="address_1" required autoComplete="street-address" /></div>
          <div className="full"><label htmlFor="notes">{t.notes}</label><textarea id="notes" name="notes" rows={2} /></div>
        </fieldset>
        <fieldset>
          <legend>{t.payment}</legend>
          <label className="pay-opt"><input type="radio" name="payment" value="cod" defaultChecked /><div><b>{t.cod}</b><span>{t.codHint}</span></div></label>
          {onlinePayment && (
            <label className="pay-opt"><input type="radio" name="payment" value="paymob" /><div><b>{t.online}</b><span>{t.onlineHint}</span></div></label>
          )}
        </fieldset>
      </div>
      <aside className="summary">
        <h3>{t.orderSummary}</h3>
        {summary}
        <div className="row"><span>{t.subtotal}</span><b>{money(subtotal)}</b></div>
        <div className="row">
          <span>{t.shipping}{days ? ` (${days})` : ""}</span>
          <span>{fee != null ? money(fee) : "—"}</span>
        </div>
        <div className="row total"><span>{t.total}</span><span>{money(subtotal + (fee ?? 0))}</span></div>
        {state.error && <p className="note-err" role="alert">{ERRORS[state.error]?.[lang] ?? ERRORS.complete[lang]}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? t.placing : t.placeOrder}</button>
      </aside>
    </form>
  )
}
