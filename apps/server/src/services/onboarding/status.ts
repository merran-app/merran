import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  PlanEntry,
  Recipe,
  ShoppingItem,
  User,
} from "../../database/entities/index.ts"

type Step = "recipe" | "plan" | "list" | "cook"
type Progress = Record<Step, boolean>

/** Whether the household has done each step right now, by what it holds. */
const COUNTS: Record<Step, (em: EntityManager) => Promise<number>> = {
  recipe: (em) => em.count(Recipe, { deletedAt: null }),
  plan: (em) => em.count(PlanEntry, {}),
  list: (em) => em.count(ShoppingItem, {}),
  cook: (em) => em.count(Recipe, { lastMadeAt: { $ne: null } }),
}

/**
 * Which steps are done: the ones the household remembered, and the ones its
 * data shows. A remembered step is never counted again, so once all four
 * are remembered this asks the database nothing.
 */
async function doneSteps(
  em: EntityManager,
  remembered: Partial<Progress> | undefined
): Promise<Progress> {
  const steps = Object.keys(COUNTS) as Step[]
  const done = await Promise.all(
    steps.map(async (step) => {
      if (remembered?.[step]) return true
      return (await COUNTS[step](em)) > 0
    })
  )
  return Object.fromEntries(
    steps.map((step, index) => [step, done[index]])
  ) as Progress
}

/** Called with the active household's scoped entity manager. */
export async function onboardingStatus(
  em: EntityManager,
  userId: string,
  householdId: string
) {
  const user = await em.findOneOrFail(User, userId)
  const household = await em.findOneOrFail(Household, householdId)
  const saved = household.settings?.onboarding
  return {
    tours: user.preferences?.tours ?? {},
    toursDisabled: user.preferences?.onboarding?.toursDisabled ?? false,
    dismissed: user.preferences?.onboarding?.dismissed ?? false,
    reviewed: saved?.reviewed ?? false,
    progress: await doneSteps(em, saved),
  }
}

/** The steps that are done but not remembered yet. */
function newSteps(done: Progress, remembered: Partial<Progress> | undefined) {
  return (Object.keys(done) as Step[]).filter(
    (step) => done[step] && !remembered?.[step]
  )
}

/**
 * Saves the steps the household has done but hasn't remembered, so clearing
 * next week's plan doesn't undo them. Says whether it saved anything.
 */
export async function rememberProgress(
  em: EntityManager,
  householdId: string
): Promise<boolean> {
  const household = await em.findOneOrFail(Household, householdId)
  const remembered = household.settings?.onboarding
  const done = await doneSteps(em, remembered)
  if (newSteps(done, remembered).length === 0) return false
  let saved = false
  await em.transactional(async (tx) => {
    // Lock the household as the settings save does, so a `reviewed` saved
    // at the same moment isn't lost.
    const locked = await tx.findOneOrFail(Household, householdId, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
    })
    const before = locked.settings?.onboarding
    const steps = newSteps(done, before)
    if (steps.length === 0) return
    locked.settings = {
      ...locked.settings,
      onboarding: {
        ...before,
        ...Object.fromEntries(steps.map((step) => [step, true])),
      },
    }
    saved = true
  })
  return saved
}
