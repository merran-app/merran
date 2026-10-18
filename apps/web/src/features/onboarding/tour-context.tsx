import * as React from "react"
import { driver, type Driver, type DriveStep } from "driver.js"
import "driver.js/dist/driver.css"
import "./tours.css"
import { useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useMe } from "@/features/auth/use-me"
import { useCapability } from "@/features/capabilities/queries"
import { useOnboarding } from "./onboarding-context"
import { TOUR_VERSION, tourForPath, type TourId } from "./tours"

const TourContext = React.createContext<{
  start: (id?: TourId, quiet?: boolean) => boolean
  active: boolean
  current: TourId | null
}>({ start: () => false, active: false, current: null })

function visibleTarget(name: string) {
  return [
    ...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`),
  ].find((element) => element.getClientRects().length > 0)
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { update } = useOnboarding()
  const me = useMe()
  const ai = useCapability("ai")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const current = tourForPath(pathname)
  const instance = React.useRef<Driver | null>(null)
  const interrupted = React.useRef(false)
  const [active, setActive] = React.useState(false)
  React.useEffect(
    () => () => {
      interrupted.current = true
      instance.current?.destroy()
      instance.current = null
    },
    [pathname, me.id]
  )

  const start = React.useCallback(
    (id: TourId | undefined = current ?? undefined, quiet = false) => {
      if (!id || pathname.includes("/cook")) return false
      if (instance.current?.isActive()) return false
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        if (!quiet) toast.info(t("help.closeDialog"))
        return false
      }
      interrupted.current = false
      const selectors: Array<
        | "navigation"
        | "page"
        | "page-actions"
        | "server-settings"
        | "assistant"
        | "help"
      > = [
        "navigation",
        "page",
        "page-actions",
        ...(id === "settings" && me.serverAdmin
          ? ["server-settings" as const]
          : []),
        ...(ai ? ["assistant" as const] : []),
        "help",
      ]
      const steps: DriveStep[] = selectors.flatMap((name) => {
        const target = visibleTarget(name)
        if (!target) return []
        const key =
          name === "page" || name === "page-actions"
            ? (`help.tours.${id}.${name === "page" ? "overview" : "action"}` as const)
            : (`help.tours.shared.${name}` as const)
        return [
          {
            element: target,
            popover: {
              title: t(`help.tours.${id}.title`),
              description: t(key),
            },
          },
        ]
      })
      if (!steps.length) return false
      const restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      const tour = driver({
        steps,
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        smoothScroll: false,
        allowKeyboardControl: true,
        showProgress: true,
        popoverClass: "merran-tour",
        disableActiveInteraction: true,
        nextBtnText: t("help.next"),
        prevBtnText: t("help.previous"),
        doneBtnText: t("help.done"),
        onNextClick: (_element, _step, { driver: activeDriver }) => {
          if (activeDriver.hasNextStep()) activeDriver.moveNext()
          else activeDriver.destroy()
        },
        onPopoverRender: (popover, { driver: activeDriver }) => {
          popover.closeButton.setAttribute("aria-label", t("help.skip"))
          popover.closeButton.title = t("help.skip")
          const disable = document.createElement("button")
          disable.type = "button"
          disable.className = "merran-tour-disable"
          disable.textContent = t("help.disable")
          disable.onclick = () => {
            void update({ toursDisabled: true })
            activeDriver.destroy()
          }
          popover.wrapper.insertBefore(disable, popover.title)
        },
        onDestroyed: () => {
          setActive(false)
          if (!interrupted.current) {
            void update({ tour: { id, version: TOUR_VERSION } })
            restoreFocus?.focus()
          }
          instance.current = null
        },
      })
      instance.current = tour
      setActive(true)
      tour.drive()
      return true
    },
    [current, pathname, me.serverAdmin, ai, t, update]
  )
  return (
    <TourContext.Provider value={{ start, active, current }}>
      {children}
    </TourContext.Provider>
  )
}
export const useTour = () => React.useContext(TourContext)
