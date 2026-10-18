import { addDays, utcDay } from "../days.ts"
import type { Database, Env } from "../env.ts"
import { knownReleases } from "./releases.ts"
import { totalsFrom, type Count, type Counts, type Totals } from "./totals.ts"

/** A server counts while it's reported in the past week. */
const COUNTED_DAYS = 7
/** And is forgotten 30 days after its last report. */
const KEPT_DAYS = 30

// Counted in the database, so the Worker's own time stays small however
// many servers report.

async function countBy(db: Database, column: string, since: string) {
  const { results } = await db
    .prepare(
      `SELECT ${column} AS value, COUNT(*) AS servers FROM installs
       WHERE last_day >= ? GROUP BY ${column}`
    )
    .bind(since)
    .all<Count>()
  return results
}

async function count(db: Database, day: string, since: string) {
  const [
    overall,
    versions,
    install,
    arch,
    database,
    households,
    people,
    recipes,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS servers,
             COALESCE(SUM(first_day = ?), 0) AS new,
             COALESCE(SUM(ai_providers IS NOT NULL), 0) AS aiReported,
             COALESCE(SUM(ai_providers = '[]'), 0) AS aiNone
           FROM installs WHERE last_day >= ?`
      )
      .bind(day, since)
      .first<Pick<Counts, "servers" | "new" | "aiReported" | "aiNone">>(),
    countBy(db, "version", since),
    countBy(db, "install", since),
    countBy(db, "arch", since),
    countBy(db, "db", since),
    countBy(db, "households", since),
    countBy(db, "people", since),
    countBy(db, "recipes", since),
  ])
  const [modules, aiProviders, rejected] = await Promise.all([
    db
      .prepare(
        `SELECT module.key AS value, SUM(module.value) AS servers,
           COUNT(*) AS reported
         FROM installs, json_each(installs.modules) AS module
         WHERE installs.last_day >= ? GROUP BY module.key`
      )
      .bind(since)
      .all<Count & { reported: number }>(),
    db
      .prepare(
        `SELECT provider.value AS value, COUNT(*) AS servers
         FROM installs, json_each(installs.ai_providers) AS provider
         WHERE installs.last_day >= ? AND installs.ai_providers IS NOT NULL
         GROUP BY provider.value`
      )
      .bind(since)
      .all<Count>(),
    db
      .prepare(
        "SELECT reason AS value, count AS servers FROM rejections WHERE day = ?"
      )
      .bind(day)
      .all<Count>(),
  ])
  return {
    servers: overall?.servers ?? 0,
    new: overall?.new ?? 0,
    aiReported: overall?.aiReported ?? 0,
    aiNone: overall?.aiNone ?? 0,
    versions,
    install,
    arch,
    database,
    households,
    people,
    recipes,
    modules: modules.results,
    aiProviders: aiProviders.results,
    rejected: rejected.results,
  } satisfies Counts
}

/**
 * Each night, just after midnight UTC: the day that's ended gets its totals,
 * and servers quiet for 30 days are forgotten.
 */
export async function runDaily(env: Env, now: Date, fetcher = fetch) {
  const db = env.DB
  const today = utcDay(now)
  const day = addDays(today, -1)
  const releases = await knownReleases(db, fetcher)
  const counts = await count(db, day, addDays(day, 1 - COUNTED_DAYS))
  const { results: before } = await db
    .prepare("SELECT totals FROM days WHERE day < ? ORDER BY day DESC LIMIT 30")
    .bind(day)
    .all<{ totals: string }>()
  const totals = totalsFrom(
    day,
    counts,
    releases,
    before.map((row) => (JSON.parse(row.totals) as Totals).new)
  )

  const forgetBefore = addDays(today, -KEPT_DAYS)
  await db.batch([
    db
      .prepare(
        `INSERT INTO days (day, totals) VALUES (?, ?)
         ON CONFLICT (day) DO UPDATE SET totals = excluded.totals`
      )
      .bind(day, JSON.stringify(totals)),
    db.prepare("DELETE FROM installs WHERE last_day < ?").bind(forgetBefore),
    db.prepare("DELETE FROM rejections WHERE day < ?").bind(forgetBefore),
  ])
  return totals
}
