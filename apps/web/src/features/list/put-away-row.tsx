import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PlacePicker } from "@/features/pantry/pantry-dialogs"
import { pantryQuery, type PantryItem } from "@/features/pantry/queries"
import { useDayLabel } from "@/features/pantry/use-soon"
import { api, ApiError, unwrap } from "@/lib/api/client"

type Mode = "idle" | "amount" | "freeze"

/**
 * An item can be partly frozen only when it has a number to take from, and
 * isn't in the freezer already. The server refuses the rest.
 */
function canFreezeSome(item: PantryItem) {
  return item.quantity !== null && item.storedIn !== "freezer"
}

/** One thing the shopping put away: move it, fix its amount, or freeze some. */
export function PutAwayRow({
  item,
  onChange,
  onSplit,
  onGone,
}: {
  item: PantryItem
  /** The item as the server has it now. */
  onChange: (item: PantryItem) => void
  /** The item, lowered, and the part that moved. */
  onSplit: (item: PantryItem, moved: PantryItem) => void
  /** The item is gone from the pantry. */
  onGone: (id: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const dayLabel = useDayLabel()
  const [mode, setMode] = React.useState<Mode>("idle")
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  /**
   * Runs a change. A 400 puts its message under the field it names, a 404
   * means the item is gone, and anything else says so in a message.
   */
  async function attempt<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    setErrors({})
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 404) onGone(item.id)
      else if (Object.keys(err.fields).length > 0) setErrors(err.fields)
      else toast.error(err.message)
      return null
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: pantryQuery.queryKey })
    }
  }

  const patch = (
    body: { storedIn: PantryItem["storedIn"] } | { amount: string }
  ) =>
    attempt(() =>
      unwrap(
        api.PATCH("/api/pantry/items/{itemId}", {
          params: { path: { itemId: item.id } },
          body,
        })
      )
    )

  async function move(place: NonNullable<PantryItem["storedIn"]>) {
    if (place === item.storedIn) return
    const done = await patch({ storedIn: place })
    if (done) onChange(done)
  }

  function startAmount() {
    setTyped(item.amount)
    setErrors({})
    setMode("amount")
  }

  function startFreeze() {
    setTyped("")
    setErrors({})
    setMode("freeze")
  }

  function cancel() {
    setErrors({})
    setMode("idle")
  }

  async function saveAmount() {
    const done = await patch({ amount: typed.trim() })
    if (!done) return
    onChange(done)
    setMode("idle")
  }

  async function freeze() {
    const done = await attempt(() =>
      unwrap(
        api.POST("/api/pantry/items/{itemId}/split", {
          params: { path: { itemId: item.id } },
          body: { amount: typed.trim(), storedIn: "freezer" },
        })
      )
    )
    if (!done) return
    onSplit(done.item, done.moved)
    setMode("idle")
  }

  function submitAmount(event: React.FormEvent) {
    event.preventDefault()
    void saveAmount()
  }

  function submitFreeze(event: React.FormEvent) {
    event.preventDefault()
    if (typed.trim()) void freeze()
  }

  function cancelOnEscape(event: React.KeyboardEvent) {
    if (event.key !== "Escape") return
    // Escape closes the editor, not the whole drawer.
    event.stopPropagation()
    cancel()
  }

  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">
          {item.name}
          {item.useBy && item.storedIn !== "freezer" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t("pantry.tags.useBy", { day: dayLabel(item.useBy, true) })}
            </span>
          )}
        </span>
        {mode !== "amount" && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label={t("list.putAwayReview.changeAmount", {
              name: item.name,
            })}
            disabled={busy}
            onClick={startAmount}
          >
            {item.amount || t("list.putAwayReview.noAmount")}
          </Button>
        )}
      </div>

      {mode === "amount" && (
        <form
          className="grid gap-2"
          onSubmit={submitAmount}
          onKeyDown={cancelOnEscape}
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              value={typed}
              maxLength={60}
              aria-label={t("list.putAwayReview.amount")}
              aria-invalid={Boolean(errors.amount)}
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {t("common.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={cancel}
            >
              {t("common.cancel")}
            </Button>
          </div>
          {errors.amount && <FieldError>{errors.amount}</FieldError>}
        </form>
      )}

      <PlacePicker
        value={item.storedIn}
        onChange={(place) => void move(place)}
      />
      {errors.storedIn && mode !== "freeze" && (
        <FieldError>{errors.storedIn}</FieldError>
      )}

      {mode !== "freeze" && canFreezeSome(item) && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={busy}
          onClick={startFreeze}
        >
          {t("list.putAwayReview.freezeSome")}
        </Button>
      )}

      {mode === "freeze" && (
        <form
          className="grid gap-2"
          onSubmit={submitFreeze}
          onKeyDown={cancelOnEscape}
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              value={typed}
              maxLength={60}
              aria-label={t("list.putAwayReview.howMuch")}
              placeholder={t("list.putAwayReview.howMuch")}
              aria-invalid={Boolean(errors.amount || errors.storedIn)}
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button type="submit" disabled={busy || !typed.trim()}>
              {t("list.putAwayReview.freeze")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={cancel}
            >
              {t("common.cancel")}
            </Button>
          </div>
          {(errors.amount || errors.storedIn) && (
            <FieldError>{errors.amount ?? errors.storedIn}</FieldError>
          )}
        </form>
      )}
    </li>
  )
}
