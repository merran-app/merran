import { compareVersions, parseVersion } from "@merran/shared/releases"
import { rangesOf, TELEMETRY_BANDS } from "@merran/shared/telemetry"

// A night's totals from the counts (docs/telemetry.md, "What it keeps"):
// versions by name only if they're releases, and any value fewer than five
// servers report folded into "Other", which keeps the few servers in an
// unusual setup out of sight and made-up values small.

export const FLOOR = 5
export const OTHER = "Other"
export const EDGE = "Edge"
export const OTHER_BUILDS = "Other builds"

/** What the public page reads, one for each day. */
export type Totals = {
  day: string
  /** Servers that reported in the 7 days to `day`. */
  servers: number
  /** Servers whose first report was on `day`. */
  new: number
  /** Far more new servers than usual: maybe made-up reports. */
  flagged: boolean
  versions: Record<string, number>
  install: Record<string, number>
  arch: Record<string, number>
  database: Record<string, number>
  /** Servers with each module on. */
  modules: Record<string, number>
  /** Servers that said which AI providers they have (0.1.0-alpha.1 didn't). */
  aiReported: number
  /** Servers with a key for each kind of AI provider, and "none". */
  aiProviders: Record<string, number>
  households: Record<string, number>
  people: Record<string, number>
  recipes: Record<string, number>
  /** Summaries turned down on `day`, by why. */
  rejected: Record<string, number>
}

export type Count = { value: string; servers: number }

/** The counts from the database, before naming and folding. */
export type Counts = {
  servers: number
  new: number
  versions: Count[]
  install: Count[]
  arch: Count[]
  database: Count[]
  /** For each module id: the servers with it on, and all that mention it. */
  modules: (Count & { reported: number })[]
  aiReported: number
  aiNone: number
  aiProviders: Count[]
  households: Count[]
  people: Count[]
  recipes: Count[]
  rejected: Count[]
}

/** A version's name on the page: itself if it's a release. */
export function versionLabel(version: string, releases: ReadonlySet<string>) {
  if (releases.has(version)) return version
  return parseVersion(version)?.prerelease[0] === "edge" ? EDGE : OTHER_BUILDS
}

/** Counts by name, with names under the floor folded into "Other". */
function folded(counts: Count[], label: (value: string) => string) {
  const byName = new Map<string, number>()
  for (const { value, servers } of counts) {
    const name = label(value)
    byName.set(name, (byName.get(name) ?? 0) + servers)
  }
  const shown = new Map<string, number>()
  let other = 0
  for (const [name, servers] of byName) {
    if (servers >= FLOOR && name !== OTHER) shown.set(name, servers)
    else other += servers
  }
  if (other > 0) shown.set(OTHER, other)
  return shown
}

/** In order, with "Other" last. */
function ordered(
  counts: Map<string, number>,
  compare: (a: string, b: string) => number
) {
  const names = [...counts.keys()]
    .filter((name) => name !== OTHER)
    .sort(compare)
  if (counts.has(OTHER)) names.push(OTHER)
  return Object.fromEntries(names.map((name) => [name, counts.get(name)!]))
}

const mostFirst = (counts: Map<string, number>) => (a: string, b: string) =>
  counts.get(b)! - counts.get(a)! || a.localeCompare(b)

function byCount(counts: Count[]) {
  const shown = folded(counts, (value) => value)
  return ordered(shown, mostFirst(shown))
}

function byRange(counts: Count[], bands: readonly number[]) {
  const ranges = rangesOf(bands)
  return ordered(
    folded(counts, (value) => value),
    (a, b) => ranges.indexOf(a) - ranges.indexOf(b)
  )
}

function byVersion(counts: Count[], releases: ReadonlySet<string>) {
  const rank = (name: string) =>
    name === EDGE ? 1 : name === OTHER_BUILDS ? 2 : 0
  return ordered(
    folded(counts, (value) => versionLabel(value, releases)),
    (a, b) => rank(a) - rank(b) || compareVersions(b, a)
  )
}

/** Ids only named once enough servers mention them, so made-up ones stay out. */
function byId(counts: (Count & { reported: number })[]) {
  return Object.fromEntries(
    counts
      .filter(({ reported }) => reported >= FLOOR)
      .sort((a, b) => b.servers - a.servers || a.value.localeCompare(b.value))
      .map(({ value, servers }) => [value, servers])
  )
}

export function totalsFrom(
  day: string,
  counts: Counts,
  releases: ReadonlySet<string>,
  /** New servers on each of the days before, for the spike check. */
  newBefore: readonly number[]
): Totals {
  const usual =
    newBefore.reduce((sum, count) => sum + count, 0) /
    Math.max(newBefore.length, 1)
  return {
    day,
    servers: counts.servers,
    new: counts.new,
    flagged:
      newBefore.length > 0 && counts.new >= 100 && counts.new > usual * 5,
    versions: byVersion(counts.versions, releases),
    install: byCount(counts.install),
    arch: byCount(counts.arch),
    database: byCount(counts.database),
    modules: byId(counts.modules),
    aiReported: counts.aiReported,
    aiProviders: byId([
      ...counts.aiProviders.map((count) => ({
        ...count,
        reported: count.servers,
      })),
      { value: "none", servers: counts.aiNone, reported: counts.aiNone },
    ]),
    households: byRange(counts.households, TELEMETRY_BANDS.households),
    people: byRange(counts.people, TELEMETRY_BANDS.people),
    recipes: byRange(counts.recipes, TELEMETRY_BANDS.recipes),
    rejected: Object.fromEntries(
      counts.rejected.map(({ value, servers }) => [value, servers])
    ),
  }
}
