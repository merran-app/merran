import * as React from "react"
import { useIsFetching, useQuery } from "@tanstack/react-query"
import { useRouterState } from "@tanstack/react-router"
import { useMe } from "@/features/auth/use-me"
import { telemetryStatusQuery } from "@/features/server/queries"
import { useOnboarding } from "./onboarding-context"
import { useTour } from "./tour-context"
import { TOUR_VERSION } from "./tours"

/** Start once the page settles, without covering a dialog or interrupting typing. */
export function AutomaticTour() {
  const { data, saving, tourReset } = useOnboarding()
  const { current, start, active } = useTour()
  const me = useMe()
  const fetching = useIsFetching()
  const loading = useRouterState({ select: (state) => state.isLoading })
  const telemetry = useQuery({
    ...telemetryStatusQuery,
    enabled: me.serverAdmin,
  })
  const started = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (
      !data ||
      !current ||
      active ||
      saving ||
      loading ||
      fetching ||
      data.toursDisabled ||
      (data.tours[current] ?? 0) >= TOUR_VERSION
    )
      return
    if (me.serverAdmin && (telemetry.isPending || telemetry.data?.ask)) return
    const key = `${me.id}:${current}:${tourReset}`
    if (started.current.has(key)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (
          document.visibilityState !== "visible" ||
          document.querySelector(
            '[role="dialog"], [role="alertdialog"], [role="menu"], input:focus, textarea:focus, [contenteditable="true"]:focus'
          )
        )
          return
        if (start(current, true)) started.current.add(key)
      }, 300)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-hidden"],
    })
    document.addEventListener("focusout", schedule)
    document.addEventListener("visibilitychange", schedule)
    schedule()
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener("focusout", schedule)
      document.removeEventListener("visibilitychange", schedule)
    }
  }, [
    data,
    current,
    active,
    saving,
    loading,
    fetching,
    me.id,
    me.serverAdmin,
    telemetry.isPending,
    telemetry.data?.ask,
    tourReset,
    start,
  ])
  return null
}
