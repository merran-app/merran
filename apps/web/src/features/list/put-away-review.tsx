import { Link } from "@tanstack/react-router"
import * as React from "react"
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
import {
  STORAGE_PLACES,
  type PantryItem,
  type StoragePlace,
} from "@/features/pantry/queries"
import type { Schemas } from "@/lib/api/client"

import { PutAwayRow } from "./put-away-row"

/**
 * Once the shopping's done: where each thing it put away went, to move
 * anywhere that's wrong, fix an amount, or freeze some. It opens with a
 * review and closes with none.
 */
export function PutAwayReview({
  review,
  onClose,
}: {
  review: Schemas["PutAwayReview"] | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={review !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("list.putAwayReview.title")}</DialogTitle>
          <DialogDescription>
            {t("list.putAwayReview.description")}
          </DialogDescription>
        </DialogHeader>
        {review && <ReviewItems start={review.items} />}
        <DialogFooter>
          <Button
            variant="outline"
            render={<Link to="/pantry" />}
            onClick={onClose}
          >
            {t("list.putAwayReview.openPantry")}
          </Button>
          <Button onClick={onClose}>{t("list.putAwayReview.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The items under the place each is in, as changes to them come back. */
function ReviewItems({ start }: { start: PantryItem[] }) {
  const { t } = useTranslation()
  const [items, setItems] = React.useState(start)

  function replace(item: PantryItem) {
    setItems((now) => now.map((one) => (one.id === item.id ? item : one)))
  }

  function drop(id: string) {
    setItems((now) => now.filter((one) => one.id !== id))
  }

  /** The part that moved may have joined an item that's here already. */
  function split(item: PantryItem, moved: PantryItem) {
    setItems((now) => {
      const lowered = now.map((one) => (one.id === item.id ? item : one))
      return lowered.some((one) => one.id === moved.id)
        ? lowered.map((one) => (one.id === moved.id ? moved : one))
        : [...lowered, moved]
    })
  }

  const groups = STORAGE_PLACES.map((place) => ({
    place,
    items: items.filter((item) => item.storedIn === place),
  })).filter((group) => group.items.length > 0)
  // Anything without a place still shows, rather than going missing.
  const unplaced = items.filter(
    (item) => !STORAGE_PLACES.includes(item.storedIn as StoragePlace)
  )

  return (
    <div className="grid max-h-[60vh] gap-4 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.place}>
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t(`pantry.places.${group.place}`)}
          </h3>
          <ul className="divide-y">
            {group.items.map((item) => (
              <PutAwayRow
                key={item.id}
                item={item}
                onChange={replace}
                onSplit={split}
                onGone={drop}
              />
            ))}
          </ul>
        </section>
      ))}
      {unplaced.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t("pantry.places.none")}
          </h3>
          <ul className="divide-y">
            {unplaced.map((item) => (
              <PutAwayRow
                key={item.id}
                item={item}
                onChange={replace}
                onSplit={split}
                onGone={drop}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
