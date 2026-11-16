import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { orderConfirmationText, orderShippedText, whatsappLink } from "../../lib/whatsapp"

const OrderWhatsappWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const phone = order.shipping_address?.phone || order.customer?.phone
  const tracking = order.fulfillments
    ?.flatMap((f) => (f as { labels?: { tracking_number?: string }[] }).labels ?? [])
    .map((l) => l.tracking_number)
    .find(Boolean)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">WhatsApp</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {phone ? phone : "No phone number on this order"}
        </Text>
      </div>
      {phone && (
        <div className="flex flex-col gap-2 px-6 py-4">
          <Button size="small" variant="secondary" asChild>
            <a href={whatsappLink(phone, orderConfirmationText(order))} target="_blank" rel="noreferrer">
              Send order confirmation
            </a>
          </Button>
          <Button size="small" variant="secondary" asChild>
            <a href={whatsappLink(phone, orderShippedText(order, tracking))} target="_blank" rel="noreferrer">
              Send shipping update
            </a>
          </Button>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderWhatsappWidget
