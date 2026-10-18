// The daily telemetry summary (docs/telemetry.md): what a Merran server
// sends, and what the project's receiver takes. Both ends check it with the
// same schema, so a release can't send something the receiver's public code
// doesn't account for.

import { z } from "zod"
import { parseVersion } from "../releases/versions.ts"

/** Where counts are cut into ranges, so no exact number is sent. */
export const TELEMETRY_BANDS = {
  households: [1, 5, 20],
  people: [1, 5, 20, 100],
  recipes: [99, 499, 1999],
} as const

/** A count as a range, so no exact number is sent: rangeOf(3, [1, 5]) is "2-5". */
export function rangeOf(count: number, bands: readonly number[]): string {
  if (count === 0) return "0"
  let low = 1
  for (const high of bands) {
    if (count <= high) return low === high ? `${high}` : `${low}-${high}`
    low = high + 1
  }
  return `${low}+`
}

/** Every range rangeOf can give for these bands, smallest first. */
export function rangesOf(bands: readonly number[]): string[] {
  const ranges = ["0"]
  let low = 1
  for (const high of bands) {
    ranges.push(low === high ? `${high}` : `${low}-${high}`)
    low = high + 1
  }
  ranges.push(`${low}+`)
  return ranges
}

/** What Node's os.arch() can say. */
export const NODE_ARCHES = [
  "arm",
  "arm64",
  "ia32",
  "loong64",
  "mips",
  "mipsel",
  "ppc",
  "ppc64",
  "riscv64",
  "s390",
  "s390x",
  "x64",
] as const

/** A module's or AI provider's id: "errorTracking", "openai-compatible". */
const ID = /^[a-z][A-Za-z-]{0,31}$/

const range = (bands: readonly number[]) => z.enum(rangesOf(bands))

export const TelemetryReportSchema = z.strictObject({
  /** Random, made by the server; a new one starts afresh. */
  installId: z.uuid(),
  version: z
    .string()
    .max(64)
    .refine((version) => parseVersion(version) !== null),
  install: z.enum(["docker", "source"]),
  arch: z.enum(NODE_ARCHES),
  /** "sqlite", or "postgres 18". */
  database: z.string().regex(/^(sqlite|postgres \d{1,3})$/),
  /** Each module, and whether it's on. A new module is just another id. */
  modules: z
    .record(z.string().regex(ID), z.boolean())
    .refine((modules) => Object.keys(modules).length <= 40),
  /**
   * The kinds of AI provider with a key anywhere on the server, the
   * server's or a household's. Not in 0.1.0-alpha.1's summaries.
   */
  aiProviders: z
    .array(z.string().regex(ID))
    .max(8)
    .refine((kinds) => new Set(kinds).size === kinds.length)
    .optional(),
  households: range(TELEMETRY_BANDS.households),
  people: range(TELEMETRY_BANDS.people),
  recipes: range(TELEMETRY_BANDS.recipes),
})

export type TelemetryReport = z.infer<typeof TelemetryReportSchema>
