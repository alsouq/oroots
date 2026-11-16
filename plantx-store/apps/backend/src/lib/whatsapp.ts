/**
 * Builds wa.me links with a prefilled message. Phone numbers are normalised
 * to international format for Egypt (01xxxxxxxxx -> 201xxxxxxxxx).
 */
export function normalizeEgyptPhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "")
  if (digits.startsWith("20")) {
    return digits
  }
  if (digits.startsWith("0")) {
    return "2" + digits
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "20" + digits
  }
  return digits
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  return `https://wa.me/${normalizeEgyptPhone(phone)}?text=${encodeURIComponent(text)}`
}

type OrderLike = {
  display_id?: number | null
  total?: number | null
  currency_code?: string | null
  items?: { title?: string | null; product_title?: string | null; variant_title?: string | null; quantity?: number | null }[] | null
  shipping_address?: { first_name?: string | null; address_1?: string | null; city?: string | null } | null
}

const money = (n: number | null | undefined) =>
  `${Number(n ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`

export function orderConfirmationText(order: OrderLike): string {
  const name = order.shipping_address?.first_name || ""
  const lines = (order.items ?? [])
    .map((i) => `• ${i.product_title ?? i.title} (${i.variant_title ?? ""}) × ${i.quantity}`)
    .join("\n")
  return [
    `أهلاً ${name}، شكرًا لطلبك من PlantX`,
    `رقم الطلب: PX-${order.display_id}`,
    lines,
    `الإجمالي: ${money(order.total)}`,
    `العنوان: ${order.shipping_address?.address_1 ?? ""}، ${order.shipping_address?.city ?? ""}`,
    `من فضلك رد بكلمة "تأكيد" لتأكيد الطلب.`,
  ].join("\n")
}

export function orderShippedText(order: OrderLike, tracking?: string | null): string {
  return [
    `طلبك PX-${order.display_id} اتشحن`,
    tracking ? `رقم التتبع: ${tracking}` : "",
    `هيوصلك خلال أيام العمل القادمة. شكرًا لاختيارك PlantX.`,
  ]
    .filter(Boolean)
    .join("\n")
}
