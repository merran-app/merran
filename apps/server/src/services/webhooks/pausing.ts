import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  Webhook,
  WebhookDelivery,
  type PauseReason,
} from "../../database/entities/index.ts"
import { emailConfiguration, sendEmail } from "../../modules/email/sender.ts"
import { webhookPausedEmail } from "../../modules/email/templates.ts"
import { householdAdminEmails } from "../households/households.ts"
import type { JobDeps } from "../jobs/runner.ts"
import { cancelDeliveryJobs, requeueDelivery } from "./record.ts"
import { forgetWebhooks } from "./wanted.ts"

// A webhook pauses when a delivery runs out of tries, when its receiver
// answers 410 Gone, or when someone pauses it. Nothing new is queued for it
// then, and what was waiting stops, until someone resumes it.
//
// Both functions forget what the household's webhooks want as soon as their
// change is saved, before anything else that could fail, so a change being
// recorded meanwhile can't read the old state back into memory. Call them
// outside any transaction.

/** How far back Resume resends what didn't arrive. */
const RESEND_WITHIN_MS = 24 * 60 * 60_000

/**
 * Stops sending to a webhook, and stops what was waiting, with its jobs.
 * Unless someone paused it by hand, its household's owners and admins are
 * told by email, if the server can send it.
 *
 * Only an active webhook pauses, so two last tries finishing together pause
 * it once and send one email, and one paused by hand stays paused by hand.
 * Returns whether this paused it; either way, `webhook` is brought up to
 * date with how it is now.
 */
export async function pauseWebhook(
  em: EntityManager,
  deps: Pick<JobDeps, "settings" | "logger" | "config">,
  webhook: Webhook,
  reason: PauseReason
): Promise<boolean> {
  const paused = await em.nativeUpdate(
    Webhook,
    { id: webhook.id, state: "active" },
    { state: "paused", pausedReason: reason, pausedAt: new Date() }
  )
  forgetWebhooks(webhook.household.id)
  // The update went straight to the database, so what's in memory catches
  // up, for whatever shows the webhook next: paused by this, or as someone
  // else left it.
  await em.findOne(Webhook, { id: webhook.id }, { refresh: true })
  if (paused === 0) return false

  await stopWaiting(em, webhook)
  if (reason !== "by_hand") {
    await tellAdmins(em, deps, webhook, reason).catch((err: unknown) =>
      deps.logger.warn({ err }, "Couldn't email that a webhook paused")
    )
  }
  return true
}

/**
 * Stops a paused webhook's waiting deliveries, and cancels their jobs. One
 * delivered while this ran stays delivered.
 */
async function stopWaiting(em: EntityManager, webhook: Webhook) {
  const waiting = await em.find(
    WebhookDelivery,
    { webhook: webhook.id, state: "waiting" },
    { fields: ["id"] }
  )
  const ids = waiting.map((delivery) => delivery.id)
  if (ids.length === 0) return

  await em.nativeUpdate(
    WebhookDelivery,
    { id: { $in: ids }, state: "waiting" },
    { state: "stopped" }
  )
  await cancelDeliveryJobs(em, ids)
}

/**
 * Starts sending to a webhook again. With `resend`, what failed or was
 * stopped in the last day is tried again, from the start. Returns how many.
 */
export async function resumeWebhook(
  em: EntityManager,
  webhook: Webhook,
  options: { resend: boolean }
): Promise<number> {
  webhook.state = "active"
  webhook.pausedReason = null
  webhook.pausedAt = null
  webhook.failingSince = null
  webhook.lastError = null
  const resent = options.resend ? await lastDaysUndelivered(em, webhook) : []
  for (const delivery of resent) {
    delivery.state = "waiting"
    delivery.tries = 0
  }
  await em.flush()
  forgetWebhooks(webhook.household.id)

  for (const delivery of resent) {
    await requeueDelivery(em, {
      householdId: webhook.household.id,
      deliveryId: delivery.id,
    })
  }
  return resent.length
}

/**
 * The webhook's deliveries from the last day that never arrived. The one
 * that ran out of tries began about 27 hours ago, so one tried in the last
 * day counts too. Tests were only ever meant to be tried once.
 */
function lastDaysUndelivered(em: EntityManager, webhook: Webhook) {
  const since = new Date(Date.now() - RESEND_WITHIN_MS)
  return em.find(WebhookDelivery, {
    webhook: webhook.id,
    state: { $in: ["failed", "stopped"] },
    event: { type: { $ne: "webhook.test" } },
    $or: [{ createdAt: { $gte: since } }, { lastTriedAt: { $gte: since } }],
  })
}

/** Emails each of the household's owners and admins, if email is set up. */
async function tellAdmins(
  em: EntityManager,
  deps: Pick<JobDeps, "settings" | "logger" | "config">,
  webhook: Webhook,
  reason: "gave_up" | "gone"
) {
  if (!(await emailConfiguration(deps.settings)).on) return

  const household = await em.findOneOrFail(Household, {
    id: webhook.household.id,
  })
  // Names go in the subject, which is one line.
  const message = webhookPausedEmail({
    household: household.name.replace(/[\r\n]/g, " "),
    webhook: webhook.name.replace(/[\r\n]/g, " "),
    reason,
    link: deps.config.publicUrl
      ? `${deps.config.publicUrl}/settings/household#webhooks`
      : null,
  })
  for (const to of await householdAdminEmails(em, household.id)) {
    // One address the mail service refuses shouldn't keep the rest from hearing.
    await sendEmail(deps.settings, { to, ...message }).catch((err: unknown) =>
      deps.logger.warn({ err }, "Couldn't email that a webhook paused")
    )
  }
}
