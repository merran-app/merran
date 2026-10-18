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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Button
              onClick={() => {
                setOpen(false)
                window.setTimeout(() => start(), 200)
              }}
            >
              {t("help.replay")}
            </Button>
          )}
          {ai && (
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false)
                window.setTimeout(() => start("assistant"), 200)
              }}
            >
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
