import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"

import type { ImportDetail } from "./queries"

type CameIn = ImportDetail["cameIn"]["items"][number]["recipe"]

/** What's happened to a recipe since it came in, for Undo to warn of. */
function marksOf(recipe: CameIn) {
  return (
    [
      recipe.changed && "changed",
      recipe.planned && "planned",
      recipe.cooked && "cooked",
      recipe.deleted && "deleted",
    ] as const
  ).filter((mark): mark is "changed" | "planned" | "cooked" | "deleted" =>
    Boolean(mark)
  )
}

/**
 * Asks before undoing an import: how many recipes go to Recently deleted,
 * every one ticked, those changed, planned or cooked since marked. Untick
 * any to keep them. A drawer on a phone.
 */
export function UndoDialog({
  detail,
  onUndo,
}: {
  detail: ImportDetail
  onUndo: (keep: string[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [kept, setKept] = React.useState<ReadonlySet<string>>(new Set())
  // Those already in Recently deleted stay as they are.
  const shown = detail.cameIn.items
    .map((item) => item.recipe)
    .filter((recipe) => !recipe.deleted)
  const more = Math.max(0, detail.added - detail.cameIn.items.length)

  function toggle(id: string, ticked: boolean) {
    setKept((now) => {
      const next = new Set(now)
      if (ticked) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function undo() {
    setBusy(true)
    try {
      await onUndo([...kept])
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setKept(new Set())
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" />}>
        {t("imports.undo")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("imports.undoTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("imports.undoDescription", { count: shown.length + more })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid max-h-[40dvh] gap-1 overflow-y-auto">
          {shown.map((recipe) => {
            const marks = marksOf(recipe)
            return (
              <li key={recipe.id}>
                <label className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm">
                  <Checkbox
                    checked={!kept.has(recipe.id)}
                    onCheckedChange={(ticked) => toggle(recipe.id, ticked)}
                  />
                  <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
                  {marks.map((mark) => (
                    <Badge key={mark} variant="secondary">
                      {t(`imports.marks.${mark}`)}
                    </Badge>
                  ))}
                </label>
              </li>
            )
          })}
        </ul>
        {more > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("imports.undoMore", { count: more })}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void undo()}
            disabled={busy}
          >
            {busy && <Spinner />}
            {t("imports.undo")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
