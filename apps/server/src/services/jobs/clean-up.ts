import { SqlitePlatform } from "@mikro-orm/sqlite"
import { Job } from "../../database/entities/index.ts"
import { clearExpiredInvitationTokens } from "../../modules/email/invitations.ts"
import { cleanUpPasswordResets } from "../../modules/email/password-resets.ts"
import { clearOldUploads } from "../transfer/read-export.ts"
import { clearExpiredSignIns } from "../auth/clean-up.ts"
import { clearOldCookingSessions } from "../cooking/clean-up.ts"
import { clearOldImports } from "../imports/imports.ts"
import { clearOldProposals } from "../proposals/clean-up.ts"
import { clearOldPrices } from "../stores/clean-up.ts"
import { clearOldWebhookEvents } from "../webhooks/clean-up.ts"
import type { JobHandler } from "./runner.ts"

/** How long finished jobs stay on the Jobs page. */
export const KEEP_FINISHED_DAYS = 30

/**
 * The daily job that clears out finished jobs, webhook events and cooking
 * sessions older than a month, imports' records older than 90 days, and
 * uploads an import left behind a week ago. Also store prices past the 90
 * days read, expired sign-ins, and suggestions resolved a month ago.
 */
export const cleanUpJobsJob: JobHandler = {
  kind: "jobs.cleanUp",
  lane: "quick",
  async run({ em, deps }) {
    await clearExpiredInvitationTokens(em)
    await cleanUpPasswordResets(em)
    const uploads = await clearOldUploads(deps.config.dataDir)
    const webhookEvents = await clearOldWebhookEvents(em)
    const cookingSessions = await clearOldCookingSessions(em)
    const imports = await clearOldImports(em)
    const prices = await clearOldPrices(em)
    const signIns = await clearExpiredSignIns(em)
    const proposals = await clearOldProposals(em)
    // SQLite keeps its planner's statistics until told to refresh them, and
    // only the tables that changed a lot are worked on. Postgres does this
    // itself.
    if (em.getPlatform() instanceof SqlitePlatform) {
      await em.getConnection().execute("pragma optimize")
    }
    const removed = await em.nativeDelete(Job, {
      status: { $in: ["done", "failed", "cancelled"] },
      finishedAt: {
        $lt: new Date(Date.now() - KEEP_FINISHED_DAYS * 24 * 60 * 60 * 1000),
      },
    })
    return {
      removed,
      uploads,
      webhookEvents,
      cookingSessions,
      imports,
      prices,
      signIns,
      proposals,
    }
  },
}
