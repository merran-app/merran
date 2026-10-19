import { levelOf, type HouseholdTastes } from "@merran/shared"

/** The household's tastes, for assistant and discovery prompts. */
export function tastesText(tastes: HouseholdTastes) {
  const who = (item: { who: string | null }) =>
    item.who ? ` (for ${item.who})` : ""
  const by = (level: string) =>
    tastes.avoid
      .filter((item) => levelOf(item) === level)
      .map((item) => `${item.food}${who(item)}`)
  const allergies = by("allergy")
  const never = by("never")
  const leaveOut = by("leave-out")
  return [
    allergies.length ? `- Allergies, strict: ${allergies.join(", ")}.` : "",
    never.length ? `- Never eaten: ${never.join(", ")}.` : "",
    leaveOut.length
      ? `- Not liked, and left out of a dish that can do without them: ${leaveOut.join(", ")}.`
      : "",
    tastes.diets.length
      ? `- Every meal must be: ${tastes.diets.join(", ")}.`
      : "",
    tastes.weeknightMinutes
      ? `- Dinners Monday to Thursday take at most ${tastes.weeknightMinutes} minutes.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}
