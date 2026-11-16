import crypto from "crypto"

/**
 * Field order Paymob uses to build the HMAC of a "processed transaction"
 * callback. The values are concatenated with no separator and signed with
 * HMAC-SHA512 using the merchant's HMAC secret.
 */
export const TRANSACTION_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const

function pick(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function asString(value: unknown): string {
  if (value === undefined || value === null) {
    return ""
  }
  return String(value)
}

export function computeTransactionHmac(
  transaction: Record<string, unknown>,
  secret: string
): string {
  const message = TRANSACTION_HMAC_FIELDS.map((f) =>
    asString(pick(transaction, f))
  ).join("")
  return crypto.createHmac("sha512", secret).update(message).digest("hex")
}

export function isValidTransactionHmac(
  transaction: Record<string, unknown>,
  received: string | undefined,
  secret: string
): boolean {
  if (!received || !secret) {
    return false
  }
  const expected = computeTransactionHmac(transaction, secret)
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(String(received).toLowerCase(), "utf8")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
