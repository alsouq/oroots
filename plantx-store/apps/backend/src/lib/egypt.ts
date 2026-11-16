/**
 * Egyptian governorates (ISO 3166-2:EG, lower-cased with the "eg-" prefix that
 * Medusa uses for province codes) grouped into shipping zones. Prices are the
 * starting rates in EGP and can be changed later in the admin under
 * Settings > Locations & Shipping.
 */
export type ShippingZone = {
  key: string
  name: string
  price: number
  days: string
  provinces: string[]
}

export const SHIPPING_ZONES: ShippingZone[] = [
  {
    key: "greater-cairo",
    name: "Cairo & Giza",
    price: 60,
    days: "1-2",
    provinces: ["eg-c", "eg-gz", "eg-kb"],
  },
  {
    key: "delta-canal",
    name: "Alexandria, Delta & Canal",
    price: 70,
    days: "2-3",
    provinces: [
      "eg-alx", "eg-bh", "eg-dk", "eg-gh", "eg-kfs", "eg-mnf",
      "eg-shr", "eg-dt", "eg-pts", "eg-is", "eg-suz",
    ],
  },
  {
    key: "upper-egypt",
    name: "Upper Egypt",
    price: 85,
    days: "3-5",
    provinces: ["eg-fym", "eg-bns", "eg-mn", "eg-ast", "eg-shg", "eg-kn", "eg-lx", "eg-asn"],
  },
  {
    key: "remote",
    name: "Remote governorates",
    price: 110,
    days: "4-7",
    provinces: ["eg-ba", "eg-mt", "eg-wad", "eg-js", "eg-sin"],
  },
]
