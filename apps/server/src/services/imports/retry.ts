import { stat } from "node:fs/promises"
import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import { ImportItem, type Import } from "../../database/entities/index.ts"
import { startAppImport } from "../recipes/import/apps/job.ts"
import { startLinkImport } from "../recipes/import/import-links.ts"
import { startImport } from "../transfer/import.ts"
import { WITH_DELETED_RECIPES } from "./describe.ts"

// Try again: a new import of just what didn't come in, started as the
// first was, from what its record kept (never a token, which is asked for
// again).

const FileRetry = z.object({
  from: z.literal("file"),
  file: z.string(),
  group: z.string().nullable(),
})
const MealieRetry = z.object({ from: z.literal("mealie"), url: z.string() })
const ExportRetry = z.object({ file: z.string() })

const nothingToRetry = () =>
  new AppError(
    "conflict",
    "import_nothing_to_retry",
    "Everything in that import came in, or was there already."
  )

const fileGone = () =>
  new AppError(
    "conflict",
    "import_file_gone",
    "That file isn't kept any more. Choose it again in Settings, Import and export."
  )

/** Whether the import's file is still on disk. */
async function stillThere(file: string) {
  return (await stat(file).catch(() => null)) !== null
}

/** Whether the whole import stopped or failed, rather than some of it. */
const cutShort = (record: Import) =>
  record.status === "failed" || record.status === "cancelled"

/** What Try again means for an import: how it was started. */
export function retryKind(record: Import) {
  if (record.kind === "merran") return "export" as const
  if (record.kind === "mealie" || record.kind === "paprika") {
    return MealieRetry.safeParse(record.retry).success
      ? ("mealie" as const)
      : ("file" as const)
  }
  return "links" as const
}

/**
 * Starts a new import of what didn't come in: links that failed or were
 * never reached, an app's recipes that failed (or all of it again, skipping
 * what's in, if it stopped short), or a Merran export again. Says the new
 * import's id.
 */
export async function retryImport(
  em: EntityManager,
  deps: Pick<AppDeps, "settings">,
  record: Import,
  options: { householdId: string; userId: string; token?: string | null }
) {
  const failed = await em.find(
    ImportItem,
    { import: record.id, state: "failed" },
    { ...WITH_DELETED_RECIPES, orderBy: { position: "asc" } }
  )
  const kind = retryKind(record)

  if (kind === "links") {
    const waiting = cutShort(record)
      ? await em.find(
          ImportItem,
          { import: record.id, state: "waiting" },
          { ...WITH_DELETED_RECIPES, orderBy: { position: "asc" } }
        )
      : []
    const urls = [...failed, ...waiting]
      .sort((a, b) => a.position - b.position)
      .flatMap((item) => (item.ref ? [item.ref] : []))
    if (urls.length === 0) throw nothingToRetry()
    const started = await startLinkImport(em, {
      householdId: options.householdId,
      userId: options.userId,
      urls,
      tag: record.tag ?? null,
      kind: record.kind === "collection" ? "collection" : "links",
      source: record.source ?? null,
    })
    return started.id
  }

  if (kind === "export") {
    if (!cutShort(record)) throw nothingToRetry()
    const { file } = ExportRetry.parse(record.retry)
    if (!(await stillThere(file))) throw fileGone()
    const job = await startImport(em, {
      householdId: options.householdId,
      file,
      newHousehold: false,
      userId: options.userId,
    })
    return job.id
  }

  // Just the recipes that failed, or all of it again if it stopped short,
  // when it skips what's in.
  const only = cutShort(record)
    ? null
    : failed.flatMap((item) => (item.ref ? [item.ref] : []))
  if (only?.length === 0) throw nothingToRetry()

  if (kind === "mealie") {
    const { url } = MealieRetry.parse(record.retry)
    if (!options.token) {
      throw new AppError(
        "unprocessable",
        "mealie_token_needed",
        "Mealie's token isn't kept once an import finishes. Enter it again to try again.",
        { token: "Enter Mealie's API token." }
      )
    }
    const job = await startAppImport(em, {
      householdId: options.householdId,
      userId: options.userId,
      source: { from: "mealie", url, token: deps.settings.seal(options.token) },
      only,
    })
    return job.id
  }

  const { file, group } = FileRetry.parse(record.retry)
  if (!(await stillThere(file))) throw fileGone()
  const job = await startAppImport(em, {
    householdId: options.householdId,
    userId: options.userId,
    source: { from: "file", file, group },
    only,
  })
  return job.id
}
