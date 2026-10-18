import { queryOptions } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

/** Scope cached onboarding to both the person and the active household. */
export const onboardingQuery = (
  userId: string,
  householdId: string | undefined
) =>
  queryOptions({
    queryKey: ["onboarding", userId, householdId],
    queryFn: () => unwrap(api.GET("/api/auth/me/onboarding")),
    enabled: !!householdId,
  })
