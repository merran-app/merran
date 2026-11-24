import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import { Job, Recipe } from "../../../database/entities/index.ts"
import { forHousehold } from "../../../database/scope.ts"
import { PHOTOS } from "../../../modules/photos/settings.ts"
import {
  failureOf,
  HANDOVER_MS,
  waitThenHandOver,
} from "../../jobs/hand-over.ts"
import { ACTIVE, enqueue } from "../../jobs/jobs.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { currentActor, withActor, type Actor } from "../../webhooks/actor.ts"
import {
  findRecipe,
  loadRecipe,
  recordParts,
  type LoadedRecipe,
  type RecipeOrigin,
} from "../recipes.ts"
import {
  aiPhotosFor,
  checkPhotoPossible,
  makePhoto,
  type PhotoDeps,
} from "./generate.ts"

// Making AI photos in the background: one for a recipe just added without
// a photo, or for every recipe in the library without one.

const KIND = "recipes.photos"

/** It stops after this many photos in a row can't be made. */
const FAILURES_IN_A_ROW = 3

/**
 * Recipes added one at a time get a photo by themselves; a whole library
 * moved in at once doesn't, as it could be hundreds.
 */
const ONE_AT_A_TIME: readonly RecipeOrigin[] = [
  "link",
  "video",
  "text",
  "photo",
  "manual",
  "assistant",
]

const Payload = z.object({
  /** One recipe just added, or null for every recipe without a photo. */
  ids: z.array(z.string()).nullable(),
  userId: z.string().nullable(),
  /** After adding a recipe, by itself: not shown as a run. */
  auto: z.boolean().default(false),
})

const Counts = z.object({
  total: z.number(),
  done: z.number(),
  made: z.number(),
  failed: z.number(),
  /** Why it stopped before the end, when it did. */
  stopped: z.string().nullable(),
})
type Counts = z.infer<typeof Counts>

const counting = (total: number): Counts => ({
  total,
  done: 0,
  made: 0,
  failed: 0,
  stopped: null,
})

/** No key or AI left, or photos turned off: the rest would fail too. */
const stopsTheRun = (err: unknown) =>
  err instanceof AppError &&
  (err.kind === "forbidden" ||
    err.kind === "rate_limited" ||
    err.code === "photos_off" ||
    err.code === "photos_no_key" ||
    err.code === "ai_out_of_credit")

export const aiPhotoRunJob: JobHandler = {
  kind: KIND,
  lane: "long",
  area: "recipes",
  // None per household: a recipe just saved gets its photo while the
  // household's library run goes on.
  concurrency: 2,
  async run({ em, householdId, payload, progress, signal, logger, deps }) {
    if (!householdId) throw new Error("Photos need a household.")
    const { ids, userId, auto } = Payload.parse(payload)
    // By itself, quietly nothing unless the server and household are set up.
    if (auto) {
      if (!(await deps.settings.server(PHOTOS.auto))) return counting(0)
      if (!(await aiPhotosFor(deps, em, householdId)).ok) return counting(0)
    }
    const recipes = await em.find(
      Recipe,
      ids ? { id: { $in: ids }, image: null } : { image: null },
      { fields: ["id"], orderBy: { createdAt: "asc", id: "asc" } }
    )
    const counts = counting(recipes.length)
    await progress(0, counts.total, counts)
    let inARow = 0

    for (const { id } of recipes) {
      if (signal.aborted) throw new JobStopped()
      try {
        await makePhoto(deps, forHousehold(deps.database.em, householdId), {
          householdId,
          userId,
          recipe: id,
        })
        counts.made++
        inARow = 0
      } catch (err) {
        // Stopped while it was on this one, which didn't fail.
        if (signal.aborted) throw err
        counts.failed++
        inARow++
        if (!(err instanceof AppError)) {
          logger.warn({ err, recipe: id }, "A photo couldn't be made")
        }
        if (stopsTheRun(err) || inARow >= FAILURES_IN_A_ROW) {
          counts.stopped =
            err instanceof AppError && stopsTheRun(err)
              ? err.message
              : "Three photos in a row couldn't be made."
          counts.done++
          await progress(counts.done, counts.total, counts)
          return counts
        }
      }
      counts.done++
      await progress(counts.done, counts.total, counts)
      deps.events.changed(householdId, {
        area: "recipes",
        by: null,
        client: null,
      })
    }
    return counts
  },
}

const ONE_KIND = "recipes.makePhoto"

const OnePayload = z.object({
  recipeId: z.string(),
  userId: z.string().nullable(),
  /** Who pressed it, so what it changes says they did, not Merran. */
  actor: z.custom<Actor>(),
})

/**
 * One recipe's photo, made when someone presses the button. The request
 * waits for it (`makePhotoNow`), so an error that's the person's to see,
 * like the image provider's limit, is handed back as the job's result
 * rather than failing the job.
 */
export const makePhotoJob: JobHandler = {
  kind: ONE_KIND,
  lane: "long",
  area: "recipes",
  concurrency: 2,
  perHousehold: 1,
  changes: ["recipes"],
  async run({ em, householdId, payload, deps }) {
    if (!householdId) throw new Error("Photos need a household.")
    const { recipeId, userId, actor } = OnePayload.parse(payload)
    // The recipe's name, before the work: one moved to Recently deleted
    // meanwhile can't be found again, and shouldn't turn an error into a
    // different one.
    const named = await em.findOne(
      Recipe,
      { id: recipeId },
      { fields: ["name"] }
    )
    return withActor(actor, async () => {
      try {
        const recipe = await makePhoto(deps, em, {
          householdId,
          userId,
          recipe: recipeId,
        })
        // Here and not in makePhoto, which the library run uses too: it
        // sends nothing.
        await recordParts(em, householdId, recipe, ["photo"])
        return { recipeId, name: recipe.name }
      } catch (err) {
        if (!(err instanceof AppError)) throw err
        return { ...failureOf(err), recipeId, name: named?.name ?? null }
      }
    })
  },
}

export type MadeNow = { done: LoadedRecipe } | { started: Job }

/**
 * Makes a recipe's photo now: the recipe with it, as before, if it's in
 * within the wait, or the job, going on in the background. What would fail
 * anyway (photos off, a real photo, no key) fails here, at once, with no
 * job made. Pressing it again while it's going joins the job already going.
 */
export async function makePhotoNow(
  deps: PhotoDeps & Pick<AppDeps, "jobs">,
  em: EntityManager,
  input: { householdId: string; userId: string | null; recipe: string },
  options: { handoverMs?: number } = {}
): Promise<MadeNow> {
  await checkPhotoPossible(deps, em, input)
  const { id: recipeId } = await findRecipe(em, input.recipe)
  const job = await enqueue(em, {
    kind: ONE_KIND,
    householdId: input.householdId,
    payload: { recipeId, userId: input.userId, actor: currentActor() },
    createdBy: input.userId,
    key: `${ONE_KIND}:${recipeId}`,
    maxAttempts: 1,
  })
  // Adding it woke the runner already, except where nothing listens (tests).
  deps.jobs.wake()
  const answer = await waitThenHandOver(em, deps.jobs, job.id, {
    ms: options.handoverMs ?? HANDOVER_MS,
  })
  if ("started" in answer) return answer
  return { done: await loadRecipe(em, recipeId) }
}

/**
 * A recipe just added without a photo: one made in the background, when
 * the server makes them by itself and the household has a key for it.
 */
export async function photoAfterCreate(
  deps: PhotoDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    recipeId: string
    origin: RecipeOrigin
  }
) {
  if (!ONE_AT_A_TIME.includes(options.origin)) return
  try {
    // The job looks again, for a setting or key changed while it waits.
    if (!(await deps.settings.server(PHOTOS.auto))) return
    if (!(await aiPhotosFor(deps, em, options.householdId)).ok) return
    await enqueue(em, {
      kind: KIND,
      householdId: options.householdId,
      payload: { ids: [options.recipeId], userId: options.userId, auto: true },
      createdBy: options.userId,
      key: `photo:${options.recipeId}`,
      maxAttempts: 1,
      result: counting(1),
    })
  } catch {
    // A photo is a nicety; the recipe's saved either way.
  }
}

/**
 * Makes a photo for every recipe without one, in the background. One at a
 * time per household; starting another gives back the one going.
 */
export async function startPhotoRun(
  deps: Parameters<typeof aiPhotosFor>[0],
  em: EntityManager,
  options: { householdId: string; userId: string | null }
) {
  const ready = await aiPhotosFor(deps, em, options.householdId)
  if (!ready.ok) {
    throw new AppError(
      "unprocessable",
      ready.why === "off" ? "photos_off" : "photos_no_key",
      ready.why === "off"
        ? "AI photos are off on this server. The server admin can turn them on in Settings, Recipes, Whole server."
        : "AI photos need an OpenAI or Google key. A household admin can add one in Settings, AI."
    )
  }
  const total = await em.count(Recipe, { image: null })
  if (total === 0) {
    throw new AppError(
      "invalid",
      "all_have_photos",
      "Every recipe has a photo already."
    )
  }
  return enqueue(em, {
    kind: KIND,
    householdId: options.householdId,
    payload: { ids: null, userId: options.userId, auto: false },
    createdBy: options.userId,
    key: `photos:${options.householdId}`,
    maxAttempts: 1,
    result: counting(total),
  })
}

/** A run as the API shows it. */
export function describePhotoRun(job: Job) {
  const counts = Counts.safeParse(job.result)
  return {
    id: job.id,
    status: job.status,
    ...(counts.success ? counts.data : counting(0)),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

/** How long a finished run is still shown. */
const SHOWN_FOR = 24 * 60 * 60 * 1000

/**
 * The library: how many recipes have no photo, whether photos can be
 * made and why not, the household's style, and the latest run.
 */
export async function photoLibrary(
  deps: Parameters<typeof aiPhotosFor>[0],
  em: EntityManager,
  householdId: string
) {
  const [missing, ready, style, jobs] = await Promise.all([
    em.count(Recipe, { image: null }),
    aiPhotosFor(deps, em, householdId),
    deps.settings.household(em, householdId, PHOTOS.style),
    em.find(
      Job,
      {
        kind: KIND,
        forHousehold: householdId,
        $or: [
          { status: { $in: [...ACTIVE] } },
          { finishedAt: { $gte: new Date(Date.now() - SHOWN_FOR) } },
        ],
      },
      { orderBy: { createdAt: "desc" }, limit: 10 }
    ),
  ])
  const run = jobs.find(
    (job) => Payload.safeParse(job.payload).data?.auto === false
  )
  return {
    missing,
    ready: ready.ok,
    why: ready.ok ? null : ready.why,
    style,
    run: run ? describePhotoRun(run) : null,
  }
}

/** One of the household's runs. */
export async function findPhotoRun(
  em: EntityManager,
  runId: string,
  householdId: string
) {
  const job = /^[0-9a-f-]{36}$/i.test(runId)
    ? await em.findOne(Job, {
        id: runId,
        kind: KIND,
        forHousehold: householdId,
      })
    : null
  if (!job) {
    throw new AppError("not_found", "run_not_found", "There's no such run.")
  }
  return job
}
