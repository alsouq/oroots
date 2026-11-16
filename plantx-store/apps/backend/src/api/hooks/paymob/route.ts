import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"

/**
 * Paymob sends the HMAC of its transaction callback as a query parameter,
 * which Medusa's generic payment webhook route drops. This route keeps it by
 * copying it into the payload, then hands the event to Medusa's standard
 * webhook processing (verification happens in the Paymob provider).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  const hmac = typeof req.query.hmac === "string" ? req.query.hmac : undefined
  const body = (req.body ?? {}) as Record<string, unknown>

  await eventBus.emit(
    {
      name: PaymentWebhookEvents.WebhookReceived,
      data: {
        provider: "paymob_paymob",
        payload: {
          data: { ...body, hmac },
          rawData: req.rawBody,
          headers: req.headers,
        },
      },
    },
    { delay: 3000, attempts: 3 }
  )
  res.sendStatus(200)
}
