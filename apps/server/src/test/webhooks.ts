import type { WebhookEventType } from "@merran/shared"
import { Job, WebhookEvent } from "../database/entities/index.ts"
import type { Database } from "../database/orm.ts"
import { forHousehold } from "../database/scope.ts"
import type { JobRunner } from "../services/jobs/runner.ts"
import { envelopeBody } from "../services/webhooks/envelope.ts"
import { WEBHOOK_GATHER_JOB } from "../services/webhooks/gathering/gathering.ts"
import { webhookEnvelopeSchema } from "../services/webhooks/payloads.ts"
import type { TestClient } from "./app.ts"

// For tests of the events Merran sends: a webhook that wants everything,
// and the events it would be sent. Nothing is delivered; what's recorded is
// what's read.

/** An event as a webhook gets it, which tests read without declaring its type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SentEvent = Record<string, any>

/**
 * Lets webhooks send to the home network, and adds one that wants every
 * event. Its address is never reached: nothing in tests is delivered.
 */
export async function listenToEverything(client: TestClient): Promise<void> {
  const allowed = await client.patch("/api/settings/server", {
    "webhooks.homeNetwork": "all",
  })
  if (allowed.status !== 200) {
    throw new Error(
      `Allowing the home network failed: ${allowed.status} ${await allowed.text()}`
    )
  }

  const added = await client.post("/api/households/current/webhooks", {
    name: "All",
    address: "http://127.0.0.1:9/h",
    events: [],
    everything: true,
    headers: [],
  })
  if (added.status !== 201) {
    throw new Error(
      `Adding a webhook failed: ${added.status} ${await added.text()}`
    )
  }
}

/**
 * The events sent so far, oldest first, as a webhook gets them: the type,
 * then the payload. Gathered changes are left out: what's sent is the
 * event they're merged into. Each is checked against its event's schema first, so every event test
 * also checks what it sends is what the API reference says.
 */
export async function sentEvents(
  database: Database,
  householdId: string,
  type?: string
): Promise<SentEvent[]> {
  const rows = await forHousehold(database.em, householdId).find(
    WebhookEvent,
    { gathered: false, ...(type ? { type } : {}) },
    { orderBy: { id: "asc" } }
  )
  return rows.map((row) => {
    const schema = webhookEnvelopeSchema(row.type as WebhookEventType)
    schema.parse(JSON.parse(envelopeBody(row)))
    return { type: row.type, ...row.payload }
  })
}

/** The events sent by doing something. */
export async function eventsFrom(
  database: Database,
  householdId: string,
  action: () => Promise<unknown>
) {
  const before = (await sentEvents(database, householdId)).length
  await action()
  return (await sentEvents(database, householdId)).slice(before)
}

/** Merges and sends the gathered changes now, rather than in 30 seconds. */
export async function gatherNow(
  database: Database,
  jobs: JobRunner
): Promise<void> {
  await database.em
    .fork()
    .nativeUpdate(
      Job,
      { kind: WEBHOOK_GATHER_JOB, status: "queued" },
      { runAt: new Date() }
    )
  await jobs.drain()
}
