import { useRouterState } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

// A load shorter than this shows nothing, so a quick tap never flashes a bar.
const SHOW_AFTER_MS = 200
// How long the bar takes to fill and fade once the page is there.
const FINISH_MS = 200

type Phase = "hidden" | "loading" | "finishing"

// A thin bar across the top of the window while the router loads a page, so a
// tap on slow Wi-Fi never looks like it did nothing. It doesn't know how far
// along the load is, so it eases toward 85% and waits.
export function PageProgress() {
  const { t } = useTranslation()
  const isPending = useRouterState({
    select: (state) => state.status === "pending",
  })
  const [phase, setPhase] = useState<Phase>("hidden")

  // Wait before showing the bar; when the load ends, finish it if it was shown.
  useEffect(() => {
    if (isPending) {
      const timer = setTimeout(() => setPhase("loading"), SHOW_AFTER_MS)
      return () => clearTimeout(timer)
    }
    setPhase((current) => (current === "loading" ? "finishing" : current))
  }, [isPending])

  // Once the bar has filled and faded, take it away.
  useEffect(() => {
    if (phase !== "finishing") {
      return
    }
    const timer = setTimeout(() => setPhase("hidden"), FINISH_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === "hidden") {
    return null
  }

  const isFinishing = phase === "finishing"

  return (
    <div
      role="progressbar"
      aria-label={t("app.loadingPage")}
      className={`pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 h-0.5 transition-opacity duration-200 ${
        isFinishing ? "opacity-0" : "opacity-100 motion-reduce:opacity-50"
      }`}
    >
      {/* Anchored at the start edge, so it grows from the right in right-to-left. */}
      <div
        className={`absolute inset-y-0 start-0 bg-primary ${
          isFinishing
            ? "inline-full"
            : "animate-page-progress motion-reduce:animate-none motion-reduce:inline-full"
        }`}
      />
    </div>
  )
}
