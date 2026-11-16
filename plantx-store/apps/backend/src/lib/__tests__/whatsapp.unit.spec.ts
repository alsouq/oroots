import { normalizeEgyptPhone, orderConfirmationText, whatsappLink } from "../whatsapp"

describe("whatsapp links", () => {
  it("normalises Egyptian numbers", () => {
    expect(normalizeEgyptPhone("01036004753")).toBe("201036004753")
    expect(normalizeEgyptPhone("+20 103 600 4753")).toBe("201036004753")
    expect(normalizeEgyptPhone("1036004753")).toBe("201036004753")
  })

  it("builds an encoded wa.me link", () => {
    const link = whatsappLink("01036004753", "تأكيد PX-1")
    expect(link.startsWith("https://wa.me/201036004753?text=")).toBe(true)
    expect(decodeURIComponent(link.split("text=")[1])).toBe("تأكيد PX-1")
  })

  it("lists the order items", () => {
    const text = orderConfirmationText({
      display_id: 12,
      total: 419.98,
      items: [{ product_title: "Lettuce", variant_title: "1 L", quantity: 2 }],
      shipping_address: { first_name: "Ali", address_1: "Street 9", city: "Giza" },
    })
    expect(text).toContain("PX-12")
    expect(text).toContain("Lettuce (1 L) × 2")
  })
})
