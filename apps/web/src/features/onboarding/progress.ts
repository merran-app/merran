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
