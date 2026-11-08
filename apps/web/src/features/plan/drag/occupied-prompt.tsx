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
import { formatDay } from "../format"
import type { Meal, PlanEntry } from "../queries"

const nameOf = (entry: PlanEntry) => entry.recipe?.name ?? entry.note ?? ""

/**
 * A dish going to a meal that already has dishes: swap it with one of them,
 * or put it alongside them. A drawer on phones, like every dialog.
 */
export function OccupiedPrompt({
  entry,
  occupants,
  date,
  meal,
  busy,
  onSwap,
  onAlongside,
  onCancel,
}: {
  entry: PlanEntry
  /** The dishes already there. */
  occupants: PlanEntry[]
  date: string
  meal: Meal
  busy: boolean
  onSwap: (other: PlanEntry) => void
  onAlongside: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const when = `${formatDay(date, i18n.language)} · ${t(`plan.meals.${meal}`)}`

  function closed(open: boolean) {
    if (!open && !busy) onCancel()
  }

  return (
    <Dialog open onOpenChange={closed}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plan.drag.occupiedTitle", { when })}</DialogTitle>
          <DialogDescription>
            {t("plan.drag.occupied", { name: nameOf(entry) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col sm:items-stretch">
          {occupants.map((other) => (
            <Button
              key={other.id}
              disabled={busy}
              className="min-w-0"
              onClick={() => onSwap(other)}
            >
              <span className="truncate">
                {t("plan.drag.swapWith", { name: nameOf(other) })}
              </span>
            </Button>
          ))}
          <Button variant="secondary" disabled={busy} onClick={onAlongside}>
            {t("plan.drag.alongside")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
