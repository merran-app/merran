import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  PlanEntry,
  Recipe,
  ShoppingItem,
  User,
} from "../../database/entities/index.ts"

/** Called with the active household's scoped entity manager. */
export async function onboardingStatus(
  em: EntityManager,
  userId: string,
  householdId: string
) {
  const user = await em.findOneOrFail(User, userId)
  const household = await em.findOneOrFail(Household, householdId)
  const saved = household.settings?.onboarding
  const [recipes, plans, items, cooked] = await Promise.all([
    em.count(Recipe, { deletedAt: null }),
    em.count(PlanEntry, {}),
    em.count(ShoppingItem, {}),
    em.count(Recipe, { lastMadeAt: { $ne: null } }),
  ])
  return {
    tours: user.preferences?.tours ?? {},
    toursDisabled: user.preferences?.onboarding?.toursDisabled ?? false,
    dismissed: user.preferences?.onboarding?.dismissed ?? false,
    reviewed: saved?.reviewed ?? false,
    progress: {
      recipe: !!saved?.recipe || recipes > 0,
      plan: !!saved?.plan || plans > 0,
      list: !!saved?.list || items > 0,
      cook: !!saved?.cook || cooked > 0,
    },
  }
}
