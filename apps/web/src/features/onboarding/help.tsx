import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useCapability } from "@/features/capabilities/queries"
import { useOnboarding } from "./onboarding-context"
import { useTour } from "./tour-context"

export function HelpButton() {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { start, current } = useTour()
  const { update, saving } = useOnboarding()
  const ai = useCapability("ai")
  const pendingTour = React.useRef<"current" | "assistant" | null>(null)

  function replay(tour: "current" | "assistant") {
    pendingTour.current = tour
    setOpen(false)
  }

  function onOpenChangeComplete(finishedOpen: boolean) {
    if (finishedOpen || !pendingTour.current) return

    const tour = pendingTour.current
    pendingTour.current = null
    // Wait for the closing popup to leave the DOM before the tour checks for overlays.
    window.requestAnimationFrame(() =>
      start(tour === "assistant" ? "assistant" : undefined)
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogTrigger
        render={<Button data-tour="help" variant="ghost" size="sm" />}
      >
        {t("help.title")}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("help.title")}</DialogTitle>
          <DialogDescription>{t("help.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {current && (
            <Button onClick={() => replay("current")}>
              {t("help.replay")}
            </Button>
          )}
          {ai && (
            <Button variant="outline" onClick={() => replay("assistant")}>
              {t("help.assistantTour")}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={saving}
            onClick={() =>
              void update({
                dismissed: false,
                toursDisabled: false,
                resetTours: true,
              })
            }
          >
            {t("help.restore")}
          </Button>
          <a
            className="underline"
            href="https://merran.app/docs/get-started/first-week/"
            target="_blank"
            rel="noreferrer"
          >
            {t("help.docs")}
          </a>
          <a
            className="underline"
            href="https://github.com/merran-app/merran/releases/latest"
            target="_blank"
            rel="noreferrer"
          >
            {t("help.whatsNew")}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
