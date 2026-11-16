import { cookies } from "next/headers"

export type Lang = "ar" | "en"

export async function getLang(): Promise<Lang> {
  const c = await cookies()
  return c.get("lang")?.value === "en" ? "en" : "ar"
}

const ar = {
  home: "الرئيسية",
  about: "من نحن",
  services: "خدماتنا",
  projects: "مشاريعنا",
  shop: "المتجر",
  contact: "تواصل معنا",
  cart: "السلة",
  consult: "اطلب استشارة",
  addToCart: "أضف للسلة",
  adding: "جارٍ الإضافة...",
  added: "اتضاف للسلة",
  outOfStock: "غير متوفر حاليًا",
  size: "الحجم",
  stage: "مرحلة النمو",
  from: "من",
  sale: "عرض",
  allProducts: "كل المنتجات",
  shopTitle: "متجر PlantX",
  shopLead: "محاليل مغذية مصممة لكل محصول ولكل مرحلة نمو، بتوصيل لكل محافظات مصر.",
  emptyCart: "السلة فاضية.",
  continueShopping: "كمّل تسوق",
  subtotal: "المجموع الفرعي",
  shipping: "الشحن",
  total: "الإجمالي",
  checkout: "إتمام الطلب",
  remove: "حذف",
  qty: "الكمية",
  shippingCalc: "يتحسب في صفحة الدفع",
  contactInfo: "بيانات التواصل",
  delivery: "عنوان التوصيل",
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  phone: "رقم الموبايل",
  email: "البريد الإلكتروني",
  governorate: "المحافظة",
  chooseGov: "اختار المحافظة",
  city: "المدينة / المنطقة",
  address: "العنوان بالتفصيل",
  notes: "ملاحظات للتوصيل (اختياري)",
  payment: "طريقة الدفع",
  cod: "الدفع عند الاستلام",
  codHint: "ادفع كاش للمندوب وقت الاستلام.",
  online: "بطاقة بنكية أو محفظة إلكترونية",
  onlineHint: "فيزا، ماستركارد، فودافون كاش والمحافظ، عن طريق Paymob.",
  placeOrder: "تأكيد الطلب",
  placing: "جارٍ تأكيد الطلب...",
  orderSummary: "ملخص الطلب",
  thanks: "شكرًا لطلبك!",
  orderNumber: "رقم الطلب",
  orderReceived: "طلبك وصلنا وهنتواصل معاك لتأكيده.",
  confirmWhatsapp: "أكّد طلبك على واتساب",
  confirmHint: "اضغط الزرار علشان تبعتلنا تفاصيل الطلب على واتساب ونأكده بسرعة.",
  paymentFailed: "الدفع ماتمش",
  paymentFailedHint: "مفيش أي مبلغ اتخصم. ممكن تحاول تاني أو تختار الدفع عند الاستلام.",
  tryAgain: "حاول تاني",
  backToCart: "ارجع للسلة",
  egp: "ج.م",
  deliveryDays: "أيام عمل",
  freeConsult: "عندك سؤال عن برنامج التغذية المناسب؟ كلّمنا على واتساب.",
  description: "الوصف",
  rights: "© ٢٠٢٦ بلانت إكس لحلول البستنة. جميع الحقوق محفوظة.",
  langSwitch: "English",
}

const en: typeof ar = {
  home: "Home",
  about: "About us",
  services: "Services",
  projects: "Projects",
  shop: "Shop",
  contact: "Contact",
  cart: "Cart",
  consult: "Request a consultation",
  addToCart: "Add to cart",
  adding: "Adding...",
  added: "Added to cart",
  outOfStock: "Out of stock",
  size: "Size",
  stage: "Growth stage",
  from: "From",
  sale: "Sale",
  allProducts: "All products",
  shopTitle: "PlantX Shop",
  shopLead: "Nutrient solutions made for each crop and growth stage, delivered across Egypt.",
  emptyCart: "Your cart is empty.",
  continueShopping: "Continue shopping",
  subtotal: "Subtotal",
  shipping: "Shipping",
  total: "Total",
  checkout: "Checkout",
  remove: "Remove",
  qty: "Qty",
  shippingCalc: "Calculated at checkout",
  contactInfo: "Contact details",
  delivery: "Delivery address",
  firstName: "First name",
  lastName: "Last name",
  phone: "Mobile number",
  email: "Email",
  governorate: "Governorate",
  chooseGov: "Choose governorate",
  city: "City / area",
  address: "Street address",
  notes: "Delivery notes (optional)",
  payment: "Payment method",
  cod: "Cash on delivery",
  codHint: "Pay the courier in cash when your order arrives.",
  online: "Card or mobile wallet",
  onlineHint: "Visa, Mastercard, Vodafone Cash and wallets, via Paymob.",
  placeOrder: "Place order",
  placing: "Placing order...",
  orderSummary: "Order summary",
  thanks: "Thank you for your order!",
  orderNumber: "Order number",
  orderReceived: "We received your order and will contact you to confirm it.",
  confirmWhatsapp: "Confirm on WhatsApp",
  confirmHint: "Send us your order details on WhatsApp for a faster confirmation.",
  paymentFailed: "Payment was not completed",
  paymentFailedHint: "No money was taken. You can try again or choose cash on delivery.",
  tryAgain: "Try again",
  backToCart: "Back to cart",
  egp: "EGP",
  deliveryDays: "business days",
  freeConsult: "Not sure which feeding program fits your crop? Ask us on WhatsApp.",
  description: "Description",
  rights: "© 2026 PlantX Horticulture Solutions. All rights reserved.",
  langSwitch: "العربية",
}

export const dict = { ar, en }

export function formatMoney(amount: number | null | undefined, lang: Lang) {
  const n = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: Number(amount) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0))
  return `${n} ${dict[lang].egp}`
}

/** Arabic titles are kept in product metadata.title_ar by the admin. */
export function productTitle(
  p: { title?: string | null; metadata?: Record<string, unknown> | null },
  lang: Lang
) {
  const ar = p.metadata?.title_ar
  return lang === "ar" && typeof ar === "string" && ar ? ar : p.title || ""
}

const OPTION_VALUES_AR: Record<string, string> = {
  "250 ml": "٢٥٠ مل",
  "1 L": "١ لتر",
  "20L": "٢٠ لتر",
  "500 gm": "٥٠٠ جم",
  "5 KG": "٥ كجم",
  "25 KG": "٢٥ كجم",
  "Stage 1": "المرحلة ١",
  "Stage 2": "المرحلة ٢",
  "Stage 3": "المرحلة ٣",
}

export function optionValue(v: string, lang: Lang) {
  return lang === "ar" ? OPTION_VALUES_AR[v] || v : v
}

export function optionTitle(t: string, lang: Lang) {
  if (lang === "en") {
    return t
  }
  if (t === "Size") {
    return ar.size
  }
  if (t === "Plant stage") {
    return ar.stage
  }
  return t
}
