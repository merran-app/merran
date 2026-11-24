import type { EntityManager } from "@mikro-orm/sql"
import { Job } from "../../database/entities/index.ts"
import { ACTIVE } from "../jobs/jobs.ts"

// What Merran is doing for a recipe in the background, so its page can say
// so (and show it done when it's over), found by the key each job is
// started with: one job at a time per recipe and kind.

export type WorkingOn = "nutrition" | "photo"

/** Job keys, by what they do for a recipe, as `<kind>:<recipe id>`. */
const KEYED: { working: WorkingOn; kind: string }[] = [
  { working: "nutrition", kind: "recipes.workOutNutrition" },
]

/** Which of the recipe's keyed jobs are queued or running. */
export async function workingOn(
  em: EntityManager,
  recipeId: string
): Promise<WorkingOn[]> {
  const jobs = await em.find(
    Job,
    {
      key: { $in: KEYED.map(({ kind }) => `${kind}:${recipeId}`) },
      status: { $in: [...ACTIVE] },
    },
    { fields: ["key"] }
  )
  const keys = new Set(jobs.map((job) => job.key))
  return KEYED.filter(({ kind }) => keys.has(`${kind}:${recipeId}`)).map(
    ({ working }) => working
  )
}
