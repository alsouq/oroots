/** Egyptian governorates, codes match the shipping zones set up in the backend. */
export const GOVERNORATES: { code: string; ar: string; en: string }[] = [
  { code: "eg-c", ar: "القاهرة", en: "Cairo" },
  { code: "eg-gz", ar: "الجيزة", en: "Giza" },
  { code: "eg-kb", ar: "القليوبية", en: "Qalyubia" },
  { code: "eg-alx", ar: "الإسكندرية", en: "Alexandria" },
  { code: "eg-bh", ar: "البحيرة", en: "Beheira" },
  { code: "eg-dk", ar: "الدقهلية", en: "Dakahlia" },
  { code: "eg-gh", ar: "الغربية", en: "Gharbia" },
  { code: "eg-kfs", ar: "كفر الشيخ", en: "Kafr El Sheikh" },
  { code: "eg-mnf", ar: "المنوفية", en: "Monufia" },
  { code: "eg-shr", ar: "الشرقية", en: "Sharqia" },
  { code: "eg-dt", ar: "دمياط", en: "Damietta" },
  { code: "eg-pts", ar: "بورسعيد", en: "Port Said" },
  { code: "eg-is", ar: "الإسماعيلية", en: "Ismailia" },
  { code: "eg-suz", ar: "السويس", en: "Suez" },
  { code: "eg-fym", ar: "الفيوم", en: "Faiyum" },
  { code: "eg-bns", ar: "بني سويف", en: "Beni Suef" },
  { code: "eg-mn", ar: "المنيا", en: "Minya" },
  { code: "eg-ast", ar: "أسيوط", en: "Asyut" },
  { code: "eg-shg", ar: "سوهاج", en: "Sohag" },
  { code: "eg-kn", ar: "قنا", en: "Qena" },
  { code: "eg-lx", ar: "الأقصر", en: "Luxor" },
  { code: "eg-asn", ar: "أسوان", en: "Aswan" },
  { code: "eg-ba", ar: "البحر الأحمر", en: "Red Sea" },
  { code: "eg-mt", ar: "مطروح", en: "Matrouh" },
  { code: "eg-wad", ar: "الوادي الجديد", en: "New Valley" },
  { code: "eg-js", ar: "جنوب سيناء", en: "South Sinai" },
  { code: "eg-sin", ar: "شمال سيناء", en: "North Sinai" },
]

export function governorateName(code: string | null | undefined, lang: "ar" | "en") {
  const g = GOVERNORATES.find((x) => x.code === code)
  return g ? g[lang] : code || ""
}
