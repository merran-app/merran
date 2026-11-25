import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import { AppError } from "../../core/errors.ts"
import { Job, Recipe } from "../../database/entities/index.ts"
import { forHousehold } from "../../database/scope.ts"
import type { AiDeps } from "../ai/run.ts"
import type { AppDeps } from "../../core/context.ts"
import { failureOf, HANDOVER_MS, waitThenHandOver } from "../jobs/hand-over.ts"
import { ACTIVE, enqueue } from "../jobs/jobs.ts"
import { JobStopped, type JobHandler } from "../jobs/runner.ts"
import {
  findRecipe,
  loadRecipe,
  type LoadedRecipe,
} from "../recipes/recipes.ts"
import { currentActor, withActor, type Actor } from "../webhooks/actor.ts"
import {
  checkNutritionPossible,
  nutritionAbilities,
  workOutNutrition,
} from "./nutrition.ts"

// Working out nutrition in the background: a recipe just saved (new, or
// with its ingredients changed), or the household's whole library, after
// moving from Mealie, say. USDA's hourly limit pauses a run rather than
// ending it.

const KIND = "recipes.nutrition"

/** It stops after this many recipes in a row can't be worked out. */
const FAILURES_IN_A_ROW = 3

/** Waits for USDA's hourly limit, at most this many times a run. */
const WAITS = 12
const WAIT_MS = 5 * 60_000

const Payload = z.object({
  /** One recipe just saved, or null for every recipe without nutrition. */
  ids: z.array(z.string()).nullable(),
  userId: z.string().nullable(),
  /** After a save, by itself: not shown as a run. */
  auto: z.boolean().default(false),
})

const Counts = z.object({
  total: z.number(),
  done: z.number(),
  /** Recipes that have nutrition now. */
  workedOut: z.number(),
  failed: z.number(),
  /** Why it stopped before the end, when it did. */
  stopped: z.string().nullable(),
})
type Counts = z.infer<typeof Counts>

const counting = (total: number): Counts => ({
  total,
  done: 0,
  workedOut: 0,
  failed: 0,
  stopped: null,
})

/** No AI or none left, or USDA refusing the key: the rest would fail too. */
const stopsTheRun = (err: unknown) =>
  err instanceof AppError &&
  (err.kind === "forbidden" ||
    err.code === "usda_key_refused" ||
    err.code === "nutrition_unavailable" ||
    err.code === "ai_out_of_credit" ||
    (err.kind === "rate_limited" && err.code !== "usda_rate_limited"))

/** Waits, a few seconds at a time, so stopping still stops it. */
async function pause(ms: number, signal: AbortSignal) {
  for (let waited = 0; waited < ms && !signal.aborted; waited += 5000) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

/** Recipes with servings and ingredients but no nutrition yet. */
const MISSING = {
  nutrition: null,
  servings: { $ne: null },
  ingredients: { $some: {} },
} as const

export const nutritionRunJob: JobHandler = {
  kind: KIND,
  lane: "long",
  area: "recipes",
  // None per household: a recipe just saved gets its nutrition while the
  // household's library run goes on.
  concurrency: 2,
  async run({ em, householdId, payload, progress, signal, logger, deps }) {
    if (!householdId) throw new Error("Nutrition needs a household.")
    const { ids, userId, auto } = Payload.parse(payload)
    // After a save, quietly nothing when there's no way to work it out.
    if (auto) {
      const can = await nutritionAbilities(deps, em, householdId)
      if (!can.usdaKey && !can.ai) return counting(0)
    }
    const recipes = await em.find(
      Recipe,
      ids ? { id: { $in: ids } } : MISSING,
      {
        fields: ["id"],
        orderBy: { createdAt: "asc", id: "asc" },
      }
    )
    const counts = counting(recipes.length)
    await progress(0, counts.total, counts)
    let inARow = 0
    let waits = 0

    for (const { id } of recipes) {
      if (signal.aborted) throw new JobStopped()
      for (;;) {
        try {
          // A fresh view for each, so a long run doesn't hold every recipe.
          await workOutNutrition(
            deps,
            forHousehold(deps.database.em, householdId),
            {
              householdId,
              userId,
              recipe: id,
            }
          )
          counts.workedOut++
          inARow = 0
        } catch (err) {
          // Stopped while it was on this one, which didn't fail.
          if (signal.aborted) throw err
          if (
            err instanceof AppError &&
            err.code === "usda_rate_limited" &&
            waits < WAITS &&
            !auto
          ) {
            waits++
            await pause(WAIT_MS, signal)
            if (signal.aborted) throw new JobStopped()
            continue
          }
          counts.failed++
          inARow++
          if (stopsTheRun(err) || auto) {
            counts.stopped = err instanceof AppError ? err.message : null
          }
          if (!(err instanceof AppError)) {
            logger.warn({ err, recipe: id }, "Nutrition couldn't be worked out")
          }
          if (stopsTheRun(err) || inARow >= FAILURES_IN_A_ROW) {
            counts.stopped ??= "Three recipes in a row couldn't be worked out."
            counts.done++
            await progress(counts.done, counts.total, counts)
            return counts
          }
        }
        break
      }
      counts.done++
      await progress(counts.done, counts.total, counts)
      // Open pages show it.
      deps.events.changed(householdId, {
        area: "recipes",
        by: null,
        client: null,
      })
    }
    return counts
  },
}

/**
 * A recipe just saved: its nutrition worked out in the background, when
 * there's a way to. The job looks again, for a key removed while it waits.
 */
export async function nutritionAfterSave(
  deps: AiDeps,
  em: EntityManager,
  options: { householdId: string; userId: string | null; recipeId: string }
) {
  try {
    const can = await nutritionAbilities(deps, em, options.householdId)
    if (!can.usdaKey && !can.ai) return
    await enqueue(em, {
      kind: KIND,
      householdId: options.householdId,
      payload: { ids: [options.recipeId], userId: options.userId, auto: true },
      createdBy: options.userId,
      // Saved again while waiting: the one waiting does.
      key: `nutrition:${options.recipeId}`,
      maxAttempts: 1,
      result: counting(1),
    })
  } catch {
    // Nutrition is a nicety; the recipe's saved either way.
  }
}

/**
 * Works out nutrition for every recipe that has none, in the background.
 * One at a time per household; starting another gives back the one going.
 */
export async function startNutritionRun(
  em: EntityManager,
  options: { householdId: string; userId: string | null }
) {
  const total = await em.count(Recipe, MISSING)
  if (total === 0) {
    throw new AppError(
      "invalid",
      "all_worked_out",
      "Every recipe with servings has its nutrition already."
    )
  }
  return enqueue(em, {
    kind: KIND,
    householdId: options.householdId,
    payload: { ids: null, userId: options.userId, auto: false },
    createdBy: options.userId,
    key: `nutrition:${options.householdId}`,
    maxAttempts: 1,
    result: counting(total),
  })
}

/** A run as the API shows it. */
export function describeNutritionRun(job: Job) {
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

/** The library: how many recipes lack nutrition, and the latest run. */
export async function nutritionLibrary(em: EntityManager, householdId: string) {
  const [missing, noServings, jobs] = await Promise.all([
    em.count(Recipe, MISSING),
    em.count(Recipe, {
      nutrition: null,
      servings: null,
      ingredients: { $some: {} },
    }),
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
    noServings,
    run: run ? describeNutritionRun(run) : null,
  }
}

/** One of the household's runs. */
export async function findNutritionRun(
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

const ONE_KIND = "recipes.workOutNutrition"

const OnePayload = z.object({
  recipeId: z.string(),
  userId: z.string().nullable(),
  /** Who pressed it, so what it changes says they did, not Merran. */
  actor: z.custom<Actor>(),
})

/**
 * One recipe's nutrition, worked out when someone presses the button. The
 * request waits for it (`workOutNutritionNow`), so an error that's the
 * person's to see, like USDA's hourly limit, is handed back as the job's
 * result rather than failing the job.
 */
export const workOutNutritionJob: JobHandler = {
  kind: ONE_KIND,
  lane: "long",
  // Pressed, and waited on before handing over.
  waitedOn: true,
  area: "recipes",
  concurrency: 3,
  perHousehold: 2,
  changes: ["recipes"],
  async run({ em, householdId, payload, deps }) {
    if (!householdId) throw new Error("Nutrition needs a household.")
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
        const recipe = await workOutNutrition(deps, em, {
          householdId,
          userId,
          recipe: recipeId,
        })
        return { recipeId, name: recipe.name }
      } catch (err) {
        if (!(err instanceof AppError)) throw err
        return { ...failureOf(err), recipeId, name: named?.name ?? null }
      }
    })
  },
}

export type WorkedOutNow = { done: LoadedRecipe } | { started: Job }

/**
 * Works out a recipe's nutrition now: the recipe with it, as before, if it's
 * in within the wait, or the job, going on in the background. What would
 * fail anyway (no servings, no ingredients, no way to work it out) fails
 * here, at once, with no job made. Pressing it again while it's going joins
 * the job already going.
 */
export async function workOutNutritionNow(
  deps: Pick<AppDeps, "jobs" | "settings" | "fetcher" | "ai">,
  em: EntityManager,
  input: { householdId: string; userId: string | null; recipe: string },
  options: { handoverMs?: number } = {}
): Promise<WorkedOutNow> {
  await checkNutritionPossible(deps, em, input)
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
