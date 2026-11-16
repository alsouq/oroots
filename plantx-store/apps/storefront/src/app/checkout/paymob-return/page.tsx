import Link from "next/link"
import { redirect } from "next/navigation"
import { completeAfterPaymob } from "@/lib/actions"
import { dict, getLang } from "@/lib/i18n"

export const dynamic = "force-dynamic"

export default async function PaymobReturn({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams
  const lang = await getLang()
  const t = dict[lang]
  if (success === "true") {
    const orderId = await completeAfterPaymob()
    if (orderId) {
      redirect(`/order/${orderId}`)
    }
  }
  return (
    <div className="wrap done">
      <h1>{t.paymentFailed}</h1>
      <p className="lead">{t.paymentFailedHint}</p>
      <div className="hero-cta">
        <Link className="btn btn-primary" href="/checkout">{t.tryAgain}</Link>
        <Link className="btn btn-line" href="/cart">{t.backToCart}</Link>
      </div>
    </div>
  )
}
