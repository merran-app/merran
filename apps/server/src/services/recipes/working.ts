import type { EntityManager } from "@mikro-orm/sql"
import { Job } from "../../database/entities/index.ts"
import { ACTIVE } from "../jobs/jobs.ts"

// What Merran is doing for a recipe in the background, so its page can say
// so (and show it done when it's over), found by the key each job is
// started with: one job at a time per recipe and kind.

export type WorkingOn = "nutrition" | "photo"

/**
 * The job keys that mean each kind of work, as `<prefix>:<recipe id>`: the
 * button's job, and the one a save queues by itself. The library run's key
 * (`nutrition:<household id>`) shares the save's prefix, which is fine: the
 * lookup is by this recipe's id, so it never matches.
 */
const KEYED: { working: WorkingOn; prefixes: string[] }[] = [
  {
    working: "nutrition",
    prefixes: ["recipes.workOutNutrition", "nutrition"],
  },
]

const keyOf = (prefix: string, recipeId: string) => `${prefix}:${recipeId}`

/** Which of the recipe's keyed jobs are queued or running. */
export async function workingOn(
  em: EntityManager,
  recipeId: string
): Promise<WorkingOn[]> {
  const jobs = await em.find(
    Job,
    {
      key: {
        $in: KEYED.flatMap(({ prefixes }) =>
          prefixes.map((prefix) => keyOf(prefix, recipeId))
        ),
      },
      status: { $in: [...ACTIVE] },
    },
    { fields: ["key"] }
  )
  const keys = new Set(jobs.map((job) => job.key))
  return KEYED.filter(({ prefixes }) =>
    prefixes.some((prefix) => keys.has(keyOf(prefix, recipeId)))
  ).map(({ working }) => working)
}
