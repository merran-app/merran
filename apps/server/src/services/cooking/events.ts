import type { EntityManager } from "@mikro-orm/sql"
import {
  CookingSession,
  CookingTimer,
  Recipe,
  User,
} from "../../database/entities/index.ts"
import { toNumber } from "../../database/numbers.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import type { Actor } from "../webhooks/actor.ts"
import {
  recipeRef,
  type MealRef,
  type RecipeRef,
  type TimerRef,
} from "../webhooks/payloads.ts"
import { record, wantsEvent } from "../webhooks/record.ts"

// What cooking tells webhooks: cooking starting and ending, and each timer.
// Every event says who's cooking (`cook`), which stays set when Merran ends
// the session or a timer goes off and `by` is null (docs/webhooks.md).

type TimerEventType =
  "timer.started" | "timer.extended" | "timer.finished" | "timer.cancelled"

/** Who's cooking and what: the start of every cooking event. */
export async function cookingContext(
  em: EntityManager,
  session: CookingSession
): Promise<{
  cook: { id: string; name: string } | null
  session: { id: string }
  recipe: RecipeRef
}> {
  const cook = session.cook
    ? await em.findOne(User, { id: session.cook.id })
    : null
  return {
    cook: cook ? { id: cook.id, name: cook.name } : null,
    session: { id: session.id },
    recipe: await cookedRecipe(em, session.recipe.id),
  }
}

/** The recipe cooked with it, as a pairing, if it has one. */
export async function pairedRecipe(
  em: EntityManager,
  session: CookingSession
): Promise<RecipeRef | null> {
  if (!session.paired) return null
  return cookedRecipe(em, session.paired.id)
}

/**
 * A recipe being cooked, even one moved to Recently deleted since cooking
 * started: the kitchen still wants to hear that cooking ended.
 */
async function cookedRecipe(
  em: EntityManager,
  recipeId: string
): Promise<RecipeRef> {
  const recipe = await em.findOneOrFail(
    Recipe,
    { id: recipeId },
    { filters: { [NOT_DELETED_FILTER]: false } }
  )
  return recipeRef(recipe)
}

/** A timer as events carry it. */
export function timerRef(timer: CookingTimer): TimerRef {
  return {
    id: timer.timerId,
    label: timer.label,
    seconds: timer.seconds,
    endsAt: timer.endsAt.toISOString(),
  }
}

/** How long cooking went on, in whole minutes. */
function minutesCooking(session: CookingSession): number {
  const ended = session.endedAt ?? new Date()
  const ms = ended.getTime() - session.startedAt.getTime()
  return Math.max(0, Math.floor(ms / 60_000))
}

export async function recordCookingStarted(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  /** The planned meal it's cooked for, as the session describes it. */
  meal: MealRef | null
): Promise<void> {
  if (!(await wantsEvent(em, householdId, "cooking.started"))) return
  await record(em, householdId, {
    type: "cooking.started",
    data: {
      ...(await cookingContext(em, session)),
      with: await pairedRecipe(em, session),
      meal,
      servings: toNumber(session.servings),
    },
  })
}

export async function recordCookingEnded(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  actor?: Actor
): Promise<void> {
  if (!(await wantsEvent(em, householdId, "cooking.ended"))) return
  if (!session.outcome) return
  await record(em, householdId, {
    type: "cooking.ended",
    actor,
    data: {
      ...(await cookingContext(em, session)),
      with: await pairedRecipe(em, session),
      outcome: session.outcome,
      minutes: minutesCooking(session),
    },
  })
}

export async function recordTimerEvent(
  em: EntityManager,
  householdId: string,
  type: TimerEventType,
  session: CookingSession,
  timer: CookingTimer,
  actor?: Actor
): Promise<void> {
  if (!(await wantsEvent(em, householdId, type))) return
  await record(em, householdId, {
    type,
    actor,
    data: { ...(await cookingContext(em, session)), timer: timerRef(timer) },
  })
}
