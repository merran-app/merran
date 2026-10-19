import { NO_THEMES, type NightTheme, type WeekThemes } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"

// Theme nights for Fill the week and the autoplan, kept in household settings.

export async function getThemes(
  em: EntityManager,
  householdId: string
): Promise<WeekThemes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return household.settings?.themes ?? NO_THEMES
}

export async function saveThemes(
  em: EntityManager,
  householdId: string,
  themes: readonly (NightTheme | null)[]
): Promise<WeekThemes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const saved = themes.map((theme) =>
    theme
      ? {
          kind: theme.kind,
          name: theme.name.trim(),
          // Only a tag theme has a tag.
          ...(theme.kind === "tag" && theme.tag
            ? { tag: theme.tag.trim().toLowerCase() }
            : {}),
        }
      : null
  )
  household.settings = { ...household.settings, themes: saved }
  await em.flush()
  return saved
}
