import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * On the week's last day, whether a recipe going on the list is for tonight
 * (this week's plan) or later (next week's). Closing it adds nothing. A
 * drawer on phones, as the app's dialogs are.
 */
export function TonightDialog({
  name,
  onAnswer,
}: {
  /** The recipe asked about; none when the question isn't open. */
  name: string | null
  /** True for tonight, false for later, null when it's closed unanswered. */
  onAnswer: (tonight: boolean | null) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) onAnswer(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("list.recipe.tonight.title", { name: name ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {t("list.recipe.tonight.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAnswer(false)}>
            {t("list.recipe.tonight.no")}
          </Button>
          <Button onClick={() => onAnswer(true)}>
            {t("list.recipe.tonight.yes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
