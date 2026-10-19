import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useWakeLock } from "@/features/cook/use-wake-lock"
import { useSelection } from "@/features/select/use-selection"
import type { YourStore } from "@/features/stores/queries"
import { ItemRow } from "../item-row"
import type { ShoppingList, ListItem } from "../queries"
import { useListActions } from "../use-list-actions"
import { ShoppingSheet } from "./shopping-sheet"
import type { TripControls } from "./use-shopping-trip"
import { ShoppingSwapDialog } from "./swap-dialog"

export function ShoppingMode({
  data,
  controls,
  stores,
  assigned,
  onEdit,
}: {
  data: ShoppingList
  controls: TripControls
  stores: YourStore[]
  assigned: Map<string, string | undefined>
  onEdit: (item: ListItem) => void
}) {
  const { t, i18n } = useTranslation()
  const trip = controls.trip!
  const awake = useWakeLock()
  const selection = useSelection()
  const actions = useListActions()
  const [trouble, setTrouble] = React.useState<ListItem | null>(null)
  const [swapping, setSwapping] = React.useState<ListItem | null>(null)
  const [finishing, setFinishing] = React.useState(false)
  const [puttingAway, setPuttingAway] = React.useState(false)
  React.useEffect(() => {
    if (!data.lists.some((list) => list.id === trip.listId) && data.lists[0])
      controls.update({ listId: data.lists[0].id })
  }, [data.lists, trip.listId, controls])
  const items = data.items.filter((item) => item.list === trip.listId)
  const bought = items.filter((item) => item.checked)
  const waiting = items.filter((item) => !item.checked)
  const aside = waiting.filter((item) => trip.aside.includes(item.id))
  const where = (item: ListItem) =>
    trip.elsewhere[item.id] ?? assigned.get(item.id) ?? ""
  const later = waiting.filter(
    (item) =>
      !trip.aside.includes(item.id) &&
      (trip.store
        ? Boolean(
            where(item) && where(item) !== "out" && where(item) !== trip.store
          )
        : Boolean(trip.elsewhere[item.id]))
  )
  const visible = waiting.filter(
    (item) => !aside.includes(item) && !later.includes(item)
  )
  const collator = new Intl.Collator(i18n.language, { sensitivity: "base" })
  const groups = [
    ...data.aisles,
    { id: "none", name: t("list.noAisle"), position: 9999 },
  ]
    .map((aisle) => ({
      ...aisle,
      items: visible
        .filter((item) =>
          aisle.id === "none"
            ? !data.aisles.some((known) => known.id === item.aisle)
            : item.aisle === aisle.id
        )
        .sort((a, b) => collator.compare(a.name, b.name)),
    }))
    .filter((group) => group.items.length)
  const selectClass =
    "min-h-11 min-w-0 max-w-full rounded-xl border bg-background px-3 text-sm"
  function setAside(item: ListItem) {
    controls.aside(item.id)
    setTrouble(null)
    toast(t("shopping.setAsideDone", { name: item.name }), {
      action: {
        label: t("list.undo"),
        onClick: () => controls.restore(item.id),
      },
    })
  }
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <header className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t("shopping.title")}</h1>
          <Button variant="outline" onClick={() => setFinishing(true)}>
            {t("shopping.finish")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={selectClass}
            aria-label={t("shopping.list")}
            value={trip.listId}
            onChange={(event) =>
              controls.update({ listId: event.target.value })
            }
          >
            {data.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            aria-label={t("shopping.store")}
            value={trip.store}
            onChange={(event) => controls.update({ store: event.target.value })}
          >
            <option value="">{t("shopping.allStores")}</option>
            {stores.map((store) => (
              <option key={store.key} value={store.key}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          {t("shopping.progress", {
            left: visible.length,
            bought: bought.length,
            aside: aside.length + later.length,
          })}{" "}
          · {t(awake ? "shopping.screenOn" : "shopping.screenUnavailable")}
        </p>
      </header>
      {groups.map((group) => (
        <section
          key={group.id}
          className="@container min-w-0 rounded-2xl border bg-card px-4"
        >
          <h2 className="py-3 text-lg font-semibold">{group.name}</h2>
          <ul className="divide-y border-t">
            {group.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                trip
                selection={selection}
                onEdit={() => onEdit(item)}
                shopping={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTrouble(item)}
                  >
                    {t("shopping.cannotFind")}
                  </Button>
                }
              />
            ))}
          </ul>
        </section>
      ))}
      {!visible.length && (
        <p className="rounded-2xl border p-5 text-center text-muted-foreground">
          {t(
            waiting.length
              ? "shopping.nothingHere"
              : "shopping.everythingBought"
          )}
        </p>
      )}
      {[
        [t("shopping.setAside"), aside],
        [t("shopping.otherStores"), later],
        [t("shopping.bought"), bought],
      ].map(([title, rows]) => (
        <details
          key={title as string}
          className="min-w-0 rounded-2xl border p-4"
        >
          <summary className="cursor-pointer font-medium">
            {title as string} ({(rows as ListItem[]).length})
          </summary>
          <ul className="mt-3 grid gap-2">
            {(rows as ListItem[]).map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center justify-between gap-2"
              >
                <span className="min-w-0 break-words">
                  {item.name} · {item.amount}
                  {where(item) && !item.checked
                    ? ` · ${stores.find((store) => store.key === where(item))?.name ?? ""}`
                    : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    item.checked
                      ? void actions.change(item, { checked: false })
                      : controls.restore(item.id)
                  }
                >
                  {t(item.checked ? "shopping.notBought" : "shopping.restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {trouble && (
        <ShoppingSheet
          title={t("shopping.troubleTitle", { name: trouble.name })}
          description={t("shopping.troubleHint")}
          onClose={() => setTrouble(null)}
        >
          <div className="grid gap-3">
            <Button variant="outline" onClick={() => setAside(trouble)}>
              {t("shopping.setAside")}
            </Button>
            <Button
              onClick={() => {
                setSwapping(trouble)
                setTrouble(null)
              }}
            >
              {t("shopping.findSubstitute")}
            </Button>
            {stores
              .filter((store) => store.key !== trip.store)
              .map((store) => (
                <Button
                  key={store.key}
                  variant="outline"
                  onClick={() => {
                    controls.elsewhere(trouble.id, store.key)
                    setTrouble(null)
                  }}
                >
                  {t("shopping.tryStore", { store: store.name })}
                </Button>
              ))}
          </div>
        </ShoppingSheet>
      )}
      {swapping && (
        <ShoppingSwapDialog item={swapping} onClose={() => setSwapping(null)} />
      )}
      {finishing && (
        <ShoppingSheet
          title={t("shopping.finishTitle")}
          description={t("shopping.finishHint")}
          onClose={() => setFinishing(false)}
        >
          <div className="grid gap-4">
            <p>
              {t("shopping.summary", {
                bought: bought.length,
                left: waiting.length,
              })}
            </p>
            {waiting.length > 0 && (
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {waiting.map((item) => (
                  <li key={item.id}>
                    {item.name} · {item.amount}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              disabled={puttingAway}
              onClick={controls.finish}
            >
              {t("shopping.endTrip")}
            </Button>
            {bought.length > 0 && (
              <Button
                disabled={puttingAway}
                onClick={async () => {
                  setPuttingAway(true)
                  try {
                    if (await actions.putAway(trip.listId)) controls.finish()
                  } finally {
                    setPuttingAway(false)
                  }
                }}
              >
                {t("shopping.putAway")}
              </Button>
            )}
          </div>
        </ShoppingSheet>
      )}
    </div>
  )
}
