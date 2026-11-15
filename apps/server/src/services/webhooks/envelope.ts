/**
 * What a delivery sends: the type, when it happened and the data. It's made
 * once, and that exact text is what gets signed and sent.
 */
export function envelopeBody(event: {
  type: string
  payload: Record<string, unknown>
  createdAt: Date
}) {
  return JSON.stringify({
    type: event.type,
    timestamp: event.createdAt.toISOString(),
    data: event.payload,
  })
}

/** The `webhook-id` header: the same on every try, so a receiver can drop repeats. */
export function messageId(event: { id: string }) {
  return `msg_${event.id}`
}
