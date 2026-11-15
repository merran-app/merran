import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import {
  Import,
  ImportItem,
  Recipe,
  type ImportStatus,
} from "../../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import {
  asImport,
  cancelWaitingImport,
  enqueueImport,
  ensureImport,
  settleItem,
} from "../../imports/imports.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { findLinks } from "../../share/links.ts"
import { appLink } from "../../webhooks/payloads.ts"
import { record } from "../../webhooks/record.ts"
import { photoUrls } from "../photos/photos.ts"
import { addTagsTo } from "../tags.ts"
import { importLink } from "./import-link.ts"
import { findBySourceUrls, isVideoLink, normalizeLink } from "./links.ts"

// Several links at once, pasted from a note or shared together: checked
// against the library, then imported one at a time as a job, which says how
// each link went in the import's record as it goes.

const KIND = "recipes.importLinks"

/** The most links one import takes. */
export const MAX_LINKS = 100

/**
 * Where each link has got to. "adding" and "stopped" are only ever shown:
 * the first waiting link while it runs, and any waiting once it's finished.
 */
export type LinkState =
  "waiting" | "adding" | "added" | "already" | "failed" | "stopped"

export type LinkItem = {
  url: string
  state: LinkState
  /** The recipe it made, or was already. */
  recipe: {
    id: string
    slug: string
    name: string
    photo: string | null
  } | null
  /** Why it wasn't added. */
  error: string | null
}

const Payload = z.object({
  urls: z.array(z.string()).max(MAX_LINKS),
  tag: z.string().nullable(),
  userId: z.string().nullable(),
  // What webhooks are told it was; imports started before this have no kind.
  kind: z.enum(["links", "collection"]).default("links"),
})

/** A link as Merran keeps it, or null if it isn't one it can fetch. */
function tidy(raw: string) {
  try {
    return normalizeLink(raw)
  } catch {
    return null
  }
}

/** The links in some pasted text, and which are in the library already. */
export async function checkLinks(em: EntityManager, text: string) {
  const found = findLinks(text)
  const links: {
    url: string
    video: boolean
    existing: { slug: string; name: string } | null
  }[] = []
  const urls: string[] = []
  for (const raw of found) {
    if (urls.length === MAX_LINKS) break
    const url = tidy(raw)
    if (url && !urls.includes(url)) urls.push(url)
  }
  // The library is read once for them all, not once a link.
  const known = await findBySourceUrls(em, urls)
  for (const url of urls) {
    const existing = known.get(url)
    links.push({
      url,
      video: isVideoLink(url),
      existing: existing ? { slug: existing.slug, name: existing.name } : null,
    })
  }
  return { links, more: Math.max(0, found.length - MAX_LINKS) }
}

/** Starts importing several links, in the background, and keeps its record. */
export async function startLinkImport(
  em: EntityManager,
  options: {
    householdId: string
    userId: string
    urls: readonly string[]
    /** Added to every recipe it makes, like "to try". */
    tag?: string | null
    /** A collection's import is a batch of links that says what it is. */
    kind?: "links" | "collection"
    /** What it was, for the Imports page: the collection's name. */
    source?: string | null
  }
) {
  const urls = [
    ...new Set(
      options.urls.map(tidy).filter((url): url is string => url !== null)
    ),
  ].slice(0, MAX_LINKS)
  if (urls.length === 0) {
    throw new AppError("invalid", "no_links", "Add at least one link.", {
      urls: "Add at least one link.",
    })
  }
  const tag = options.tag?.trim() || null
  const kind = options.kind ?? "links"
  const { record } = await enqueueImport(
    em,
    {
      kind: KIND,
      householdId: options.householdId,
      payload: { urls, tag, userId: options.userId, kind },
      createdBy: options.userId,
      // Never tried again by itself: Try again starts another with the ones left.
      maxAttempts: 1,
    },
    {
      kind,
      source: options.source ?? null,
      listed: true,
      tag,
      items: urls.map((url) => ({ label: url, ref: url })),
    }
  )
  return record
}

/** Whether an import has finished, one way or another. */
const finished = (status: ImportStatus) =>
  status === "done" || status === "failed" || status === "cancelled"

/** A link import's record, as its page shows it. */
export async function describeLinkImport(em: EntityManager, importId: string) {
  const found = await em.findOne(Import, { id: importId })
  if (!found || (found.kind !== "links" && found.kind !== "collection")) {
    throw new AppError(
      "not_found",
      "import_not_found",
      "There's no such import."
    )
  }
  const rows = await em.find(
    ImportItem,
    { import: importId },
    { orderBy: { position: "asc" }, populate: ["recipe"] }
  )
  const over = finished(found.status)
  // The first waiting link is the one it's on, while it runs.
  const current =
    found.status === "running"
      ? rows.find((row) => row.state === "waiting")
      : undefined
  const items: LinkItem[] = rows.map((row) => {
    const recipe = row.recipe?.getEntity()
    let state: LinkState = row.state
    if (row.state === "waiting" && over) state = "stopped"
    if (row === current) state = "adding"
    return {
      url: row.label,
      state,
      recipe: recipe
        ? {
            id: recipe.id,
            slug: recipe.slug,
            name: recipe.name,
            photo: photoUrls(recipe)?.card ?? null,
          }
        : null,
      error: row.error ?? null,
    }
  })
  const count = (state: LinkState) =>
    items.filter((item) => item.state === state).length
  return {
    id: found.id,
    status: found.status,
    tag: found.tag ?? null,
    total: items.length,
    done: items.length - count("waiting") - count("adding") - count("stopped"),
    added: count("added"),
    already: count("already"),
    failed: count("failed"),
    stopped: count("stopped"),
    items,
    createdAt: found.createdAt.toISOString(),
    finishedAt: found.finishedAt?.toISOString() ?? null,
  }
}

/** The household's link imports still going, newest first. */
export async function activeLinkImports(em: EntityManager) {
  const going = await em.find(
    Import,
    {
      kind: { $in: ["links", "collection"] },
      status: { $in: ["queued", "running"] },
    },
    { orderBy: { createdAt: "desc" } }
  )
  return Promise.all(going.map((found) => describeLinkImport(em, found.id)))
}

/** Tags a recipe the import made. */
function tagRecipe(
  em: EntityManager,
  householdId: string,
  recipeId: string,
  tag: string
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const recipe = await tx.findOneOrFail(Recipe, { id: recipeId })
    await addTagsTo(tx, householdId, [recipe], [tag])
  })
}

/** Says the batch ran to its end, and how many links went each way. */
async function tellWebhooks(
  em: EntityManager,
  householdId: string,
  importId: string,
  kind: "links" | "collection"
) {
  const found = await em.findOneOrFail(Import, { id: importId })
  await record(em, householdId, {
    type: "import.finished",
    data: {
      import: { id: importId },
      kind,
      app: null,
      added: found.added,
      skipped: found.already,
      failed: found.failed,
      url: appLink(`/recipes/imports/${importId}`),
    },
  })
}

/**
 * The import job: each link in turn, so what's in stays in if it's
 * stopped. A link the library has already is noted, not added again. Cut
 * off by a restart, it carries on from the first link still waiting.
 */
export const linkImportJob: JobHandler = {
  kind: KIND,
  lane: "long",
  area: "recipes",
  perHousehold: 1,
  concurrency: 2,
  changes: ["recipes"],
  cancelledWaiting: (em, job) => cancelWaitingImport(em, job.id),
  async run({
    jobId,
    em,
    householdId,
    payload,
    progress,
    signal,
    logger,
    deps,
  }) {
    if (!householdId) throw new Error("An import needs a household.")
    const { urls, tag, userId, kind } = Payload.parse(payload)
    // One started before records were kept, cut off by the restart.
    const ofJob = { id: jobId, householdId, createdBy: userId }
    await ensureImport(em, ofJob, {
      kind,
      source: null,
      listed: true,
      tag,
      items: urls.map((url) => ({ label: url, ref: url })),
    })

    return asImport(em, jobId, signal, async () => {
      const items = await em.find(
        ImportItem,
        { import: jobId },
        { orderBy: { position: "asc" } }
      )
      let done = items.filter((item) => item.state !== "waiting").length
      for (const item of items) {
        if (signal.aborted) throw new JobStopped()
        // Done before a restart cut it off.
        if (item.state !== "waiting") continue
        await progress(done, items.length)
        try {
          const { recipe, duplicate } = await importLink(em, deps, {
            householdId,
            userId,
            url: item.label,
          })
          if (!duplicate && tag) {
            await tagRecipe(em, householdId, recipe.id, tag)
          }
          await settleItem(em, jobId, item.position, {
            state: duplicate ? "already" : "added",
            recipeId: recipe.id,
          })
        } catch (err) {
          // Stopped while it was on this link, which didn't fail.
          if (err instanceof JobStopped || signal.aborted) throw err
          await settleItem(em, jobId, item.position, {
            state: "failed",
            error:
              err instanceof AppError
                ? err.message
                : "Something went wrong with it.",
          })
          if (!(err instanceof AppError)) {
            logger.warn({ err, url: item.label }, "A link didn't come in")
          }
        }
        done++
        await progress(done, items.length)
      }
      await tellWebhooks(em, householdId, jobId, kind)
      return { done }
    })
  },
}
