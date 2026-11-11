import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  WebhookDelivery,
  type PauseReason,
  type Webhook,
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
// Both functions save their change before forgetting what the household's
// webhooks want, so a change being recorded meanwhile can't read the old
// state back into memory. Call them outside any transaction.

/** How far back Resume resends what didn't arrive. */
const RESEND_WITHIN_MS = 24 * 60 * 60_000

/**
 * Stops sending to a webhook, and stops what was waiting, with its jobs.
 * Unless someone paused it by hand, its household's owners and admins are
 * told by email, if the server can send it.
 */
export async function pauseWebhook(
  em: EntityManager,
  deps: Pick<JobDeps, "settings" | "logger" | "config">,
  webhook: Webhook,
  reason: PauseReason
): Promise<void> {
  webhook.state = "paused"
  webhook.pausedReason = reason
  webhook.pausedAt = new Date()
  const stopped = await em.find(WebhookDelivery, {
    webhook: webhook.id,
    state: "waiting",
  })
  for (const delivery of stopped) {
    delivery.state = "stopped"
  }
  await em.flush()
  await cancelDeliveryJobs(
    em,
    stopped.map((delivery) => delivery.id)
  )
  forgetWebhooks(webhook.household.id)

  if (reason !== "by_hand") {
    await tellAdmins(em, deps, webhook, reason).catch((err: unknown) =>
      deps.logger.warn({ err }, "Couldn't email that a webhook paused")
    )
  }
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
  const resent = options.resend ? await lastDaysUndelivered(em, webhook) : []
  for (const delivery of resent) {
    delivery.state = "waiting"
    delivery.tries = 0
  }
  await em.flush()

  for (const delivery of resent) {
    await requeueDelivery(em, {
      householdId: webhook.household.id,
      deliveryId: delivery.id,
    })
  }
  forgetWebhooks(webhook.household.id)
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
