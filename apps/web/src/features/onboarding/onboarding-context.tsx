import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useActiveHousehold, useMe } from "@/features/auth/use-me"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { onboardingQuery } from "./queries"

function useStateForOnboarding() {
  const me = useMe()
  const household = useActiveHousehold()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const options = onboardingQuery(me.id, household?.id)
  const query = useQuery(options)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [saving, setSaving] = React.useState(false)
  const [tourReset, setTourReset] = React.useState(0)
  const writes = React.useRef(Promise.resolve())
  const update = React.useCallback(
    (changes: Schemas["OnboardingChanges"]) => {
      // A tour may save its seen state and disable preference together.
      // Serialize this tab's writes, including background progress saves.
      const result = writes.current.then(async () => {
        setSaving(true)
        try {
          const saved = await unwrap(
            api.PATCH("/api/auth/me/onboarding", { body: changes })
          )
          queryClient.setQueryData(
            onboardingQuery(me.id, household?.id).queryKey,
            saved
          )
          if (changes.resetTours) setTourReset((version) => version + 1)
          return saved
        } catch {
          toast.error(t("onboarding.saveFailed"))
          return null
        } finally {
          setSaving(false)
        }
      })
      writes.current = result.then(() => {})
      return result
    },
    [queryClient, me.id, household?.id, t]
  )
  React.useEffect(() => {
    if (household)
      void queryClient.invalidateQueries({
        queryKey: onboardingQuery(me.id, household.id).queryKey,
      })
  }, [pathname, me.id, household?.id, queryClient])
  React.useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Both local actions and live updates refresh these queries. Keep the
      // checklist current without waiting for navigation or polling the API.
      if (event.type !== "updated" || event.action.type !== "success") return
      if (
        !["recipes", "plan", "list"].includes(String(event.query.queryKey[0]))
      )
        return
      clearTimeout(pending)
      pending = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: onboardingQuery(me.id, household?.id).queryKey,
        })
      }, 150)
    })
    return () => {
      unsubscribe()
      clearTimeout(pending)
    }
  }, [queryClient, me.id, household?.id])
  // Remember observed progress so clearing next week's plan doesn't undo it.
  const observed = query.data ? JSON.stringify(query.data.progress) : ""
  React.useEffect(() => {
    if (observed && observed.includes("true"))
      void update({ recordProgress: true })
  }, [observed, update])
  return { ...query, update, saving, tourReset }
}
const OnboardingContext = React.createContext<ReturnType<
  typeof useStateForOnboarding
> | null>(null)
export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const value = useStateForOnboarding()
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}
export function useOnboarding() {
  const value = React.useContext(OnboardingContext)
  if (!value) throw new Error("OnboardingProvider is missing")
  return value
}
