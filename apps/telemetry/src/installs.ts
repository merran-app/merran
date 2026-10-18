import type { TelemetryReport } from "@merran/shared/telemetry"
import type { Database } from "./env.ts"

/**
 * Keeps a server's summary: its row, replaced by each new summary, so a
 * second one the same day counts once. The day it first reported stays.
 */
export async function keepReport(
  db: Database,
  report: TelemetryReport,
  day: string
) {
  await db
    .prepare(
      `INSERT INTO installs (install_id, version, install, arch, db, modules,
         ai_providers, households, people, recipes, first_day, last_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (install_id) DO UPDATE SET
         version = excluded.version,
         install = excluded.install,
         arch = excluded.arch,
         db = excluded.db,
         modules = excluded.modules,
         ai_providers = excluded.ai_providers,
         households = excluded.households,
         people = excluded.people,
         recipes = excluded.recipes,
         last_day = excluded.last_day`
    )
    .bind(
      report.installId,
      report.version,
      report.install,
      report.arch,
      report.database,
      JSON.stringify(report.modules),
      report.aiProviders ? JSON.stringify(report.aiProviders) : null,
      report.households,
      report.people,
      report.recipes,
      day,
      day
    )
    .run()
}

/** Forgets a server, when it asks: after a new id, or turning telemetry off. */
export async function forget(db: Database, installId: string) {
  await db
    .prepare("DELETE FROM installs WHERE install_id = ?")
    .bind(installId)
    .run()
}

/** Counts a summary turned down, by why, with nothing of the summary. */
export async function countRejection(
  db: Database,
  day: string,
  reason: string
) {
  await db
    .prepare(
      `INSERT INTO rejections (day, reason, count) VALUES (?, ?, 1)
       ON CONFLICT (day, reason) DO UPDATE SET count = count + 1`
    )
    .bind(day, reason)
    .run()
}
