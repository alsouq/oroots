"use client"

import { useState } from "react"

const WA = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "201036004753"

/** Builds the enquiry into a WhatsApp message the customer sends to PlantX. */
export function ContactForm({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar"
  const [name, setName] = useState("")
  const [subject, setSubject] = useState(ar ? "مشروع جديد" : "New project")
  const [message, setMessage] = useState("")
  const text = `${ar ? "الاسم" : "Name"}: ${name}\n${ar ? "الموضوع" : "Subject"}: ${subject}\n${message}`
  const href = `https://wa.me/${WA}?text=${encodeURIComponent(text)}`
  const subjects = ar
    ? ["مشروع جديد", "مشكلة فنية", "برنامج تغذية", "طلب منتجات"]
    : ["New project", "Technical problem", "Nutrition program", "Product order"]
  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <h3>{ar ? "ابعتلنا رسالة على واتساب" : "Message us on WhatsApp"}</h3>
      <div>
        <label htmlFor="c-name">{ar ? "الاسم" : "Name"}</label>
        <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="c-subject">{ar ? "الموضوع" : "Subject"}</label>
        <select id="c-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="full">
        <label htmlFor="c-msg">{ar ? "رسالتك" : "Message"}</label>
        <textarea id="c-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="full">
        <a className={`btn btn-primary${name && message ? "" : " disabled"}`} href={name && message ? href : undefined} target="_blank" rel="noopener" aria-disabled={!(name && message)}>
          {ar ? "إرسال على واتساب" : "Send on WhatsApp"}
        </a>
      </div>
    </form>
  )
}
