/**
 * Whether the checklist can still change: it's loaded, not dismissed, and
 * has a step left. Past that, asking the server again can't tell it
 * anything new.
 */
export function checklistCanChange(
  onboarding:
    | {
        dismissed: boolean
        progress: Record<"recipe" | "plan" | "list" | "cook", boolean>
      }
    | undefined
): boolean {
  if (!onboarding) return false
  if (onboarding.dismissed) return false
  return Object.values(onboarding.progress).includes(false)
}

/**
 * Whether a query that just loaded can have changed a checklist step: the
 * recipes, the plan and the list are what the steps count, and Today's
 * summary carries all of them, so it's the one that loads on that page.
 */
export function mayChangeChecklist(queryKey: readonly unknown[]): boolean {
  return ["recipes", "plan", "list", "today"].includes(String(queryKey[0]))
}
