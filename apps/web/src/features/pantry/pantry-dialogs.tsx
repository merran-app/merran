import { addDays } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useForMeals } from "@/features/list/use-for-meals"
import { useHouseholdClock } from "@/features/plan/queries"

import { STORAGE_PLACES, type PantryItem, type StoragePlace } from "./queries"
import { usePantryActions, type PutBack } from "./use-pantry-actions"
import { useDayLabel } from "./use-soon"

/** Fridge, freezer or cupboard, as toggles. */
function PlacePicker({
  value,
  onChange,
}: {
  value: StoragePlace | null
  onChange: (place: StoragePlace) => void
}) {
  const { t } = useTranslation()
  return (
    <ToggleGroup
      variant="outline"
      value={value ? [value] : []}
      onValueChange={(next) => {
        const place = next[0] as StoragePlace | undefined
        if (place) onChange(place)
      }}
      className="w-full"
    >
      {STORAGE_PLACES.map((place) => (
        <ToggleGroupItem key={place} value={place} className="flex-1">
          {t(`pantry.places.${place}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Changing something at home: name, how much, where it's kept, use-by date. */
export function EditPantryDialog({
  item,
  onClose,
}: {
  item: PantryItem | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {item && <EditPantry item={item} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function EditPantry({
  item,
  onDone,
}: {
  item: PantryItem
  onDone: () => void
}) {
  const { t } = useTranslation()
  const actions = usePantryActions()
  const [name, setName] = React.useState(item.name)
  const [amount, setAmount] = React.useState(item.amount)
  const [storedIn, setStoredIn] = React.useState(item.storedIn)
  const [useBy, setUseBy] = React.useState(item.useBy ?? "")
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    const done = await actions.change(item, {
      ...(name.trim() !== item.name ? { name: name.trim() } : {}),
      ...(amount.trim() !== item.amount ? { amount: amount.trim() } : {}),
      ...(storedIn !== item.storedIn ? { storedIn } : {}),
      ...((useBy || null) !== item.useBy ? { useBy: useBy || null } : {}),
    })
    setBusy(false)
    if (done) onDone()
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void save()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t("pantry.editItem.title", { name: item.name })}
        </DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="pantry-name">
          {t("pantry.editItem.name")}
        </FieldLabel>
        <Input
          id="pantry-name"
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="pantry-amount">
          {t("pantry.editItem.amount")}
        </FieldLabel>
        <Input
          id="pantry-amount"
          value={amount}
          maxLength={60}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldDescription>{t("pantry.editItem.amountHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>{t("pantry.editItem.storedIn")}</FieldLabel>
        <PlacePicker
          value={storedIn}
          onChange={(place) => {
            setStoredIn(place)
            // The freezer keeps it.
            if (place === "freezer") setUseBy("")
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="pantry-use-by">
          {t("pantry.editItem.useBy")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="pantry-use-by"
            type="date"
            value={useBy}
            onChange={(event) => setUseBy(event.target.value)}
          />
          {useBy && (
            <Button type="button" variant="ghost" onClick={() => setUseBy("")}>
              {t("pantry.editItem.noDate")}
            </Button>
          )}
        </div>
      </Field>
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onDone()
            void actions.remove(item)
          }}
        >
          {t("pantry.usedUp")}
        </Button>
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("pantry.editItem.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Where selected things are kept. */
export function PlaceDialog({
  count,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (place: StoragePlace) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("pantry.placeDialog.title", { count })}</DialogTitle>
        </DialogHeader>
        <PlacePicker value={null} onChange={onPick} />
      </DialogContent>
    </Dialog>
  )
}

/** When selected things should be used by: soon, a date, or none. */
export function UseByDialog({
  count,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (useBy: string | null) => void
}) {
  const { t } = useTranslation()
  const { today } = useHouseholdClock()
  const [date, setDate] = React.useState("")
  const quick: [string, number][] = [
    [t("pantry.useByDialog.tomorrow"), 1],
    [t("pantry.useByDialog.inDays", { count: 3 }), 3],
    [t("pantry.useByDialog.inAWeek"), 7],
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("pantry.useByDialog.title", { count })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {quick.map(([label, days]) => (
            <Button
              key={days}
              variant="outline"
              onClick={() => onPick(addDays(today, days))}
            >
              {label}
            </Button>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (date) onPick(date)
            }}
          >
            <Input
              type="date"
              aria-label={t("pantry.useByDialog.date")}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <Button type="submit" disabled={!date}>
              {t("pantry.useByDialog.set")}
            </Button>
          </form>
          <Button variant="ghost" onClick={() => onPick(null)}>
            {t("pantry.useByDialog.none")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Things just used up that meals on the list counted on: which go back on
 * the list. None are picked to start, so nothing goes on unless chosen.
 */
export function PutBackDialog({
  choices,
  onClose,
}: {
  choices: PutBack[] | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={choices !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {choices && <PutBackChoices choices={choices} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PutBackChoices({
  choices,
  onDone,
}: {
  choices: PutBack[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const forMeals = useForMeals()
  const dayLabel = useDayLabel()
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())

  function pick(id: string, on: boolean) {
    setPicked((was) => {
      const next = new Set(was)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function putOnList() {
    const chosen = choices.filter((choice) => picked.has(choice.item.id))
    onDone()
    void forMeals.putOnList(
      { removed: chosen.map((choice) => choice.before) },
      t("pantry.putBack.doneSome", { count: chosen.length })
    )
  }

  /** "2 lb for Tacos, Tue": how much each meal on the list needs back. */
  const forWhat = (item: PantryItem) =>
    item.meals
      .filter((meal) => meal.onList)
      .map((meal) => {
        const which = t("pantry.putBack.meal", {
          name: meal.name,
          day: dayLabel(meal.date),
        })
        return meal.amount
          ? t("pantry.putBack.amountFor", { amount: meal.amount, meal: which })
          : which
      })
      .join(", ")

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("pantry.putBack.title")}</DialogTitle>
        <DialogDescription>{t("pantry.putBack.description")}</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-3">
        {choices.map(({ item }) => (
          <li key={item.id}>
            <Field orientation="horizontal">
              <Checkbox
                id={`put-back-${item.id}`}
                checked={picked.has(item.id)}
                onCheckedChange={(on) => pick(item.id, on === true)}
              />
              <FieldLabel
                htmlFor={`put-back-${item.id}`}
                className="grid gap-0.5 font-normal"
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {forWhat(item)}
                </span>
              </FieldLabel>
            </Field>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t("pantry.putBack.notNow")}
        </Button>
        <Button disabled={picked.size === 0} onClick={putOnList}>
          {t("pantry.putBack.putSome", { count: picked.size })}
        </Button>
      </DialogFooter>
    </>
  )
}
