import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useListActions } from "@/features/list/use-list-actions"
import { ShoppingReview } from "./shopping-review"
import type { SendPlan } from "./queries"
import { storeForItem, type StoreChoices } from "./store-choice"

export { ShoppingStatus } from "./shopping-status"

export type ShoppingItemProgress = SendPlan["items"][number]
export type ShoppingFilter = "all" | "attention" | "sent"

/** Use the same store choices as the older Send page, including left-out items. */
export function useShoppingStores(list: string, plan: SendPlan | undefined) {
  const remembered = React.useMemo<StoreChoices>(() => {
    try {
      const saved = sessionStorage.getItem(`merran.send.${list}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed.where === "object" && parsed.where !== null)
          return parsed
      }
    } catch {
      /* This device needn't remember a store. */
    }
    return { rest: null, order: null, where: {} }
  }, [list])
  const [overrides, setOverrides] = React.useState<
    Record<string, StoreChoices>
  >({})
  const choices = overrides[list] ?? remembered
  const stores = plan?.stores ?? []
  const keys = stores.map((store) => store.key)
  const busiest = [...stores].sort(
    (a, b) =>
      (plan?.items.filter((item) => item.picked[0] === b.key).length ?? 0) -
      (plan?.items.filter((item) => item.picked[0] === a.key).length ?? 0)
  )[0]?.key
  const rest =
    choices.rest && keys.includes(choices.rest) ? choices.rest : busiest
  const order =
    choices.order && keys.includes(choices.order) ? choices.order : null
  const whereOf = (item: ShoppingItemProgress) =>
    storeForItem(item, keys, choices, rest)
  function chooseOrder(store: string | null) {
    save({ ...choices, order: store })
  }
  function chooseRest(rest: string) {
    const next = { ...choices, rest }
    save(next)
  }
  function move(itemId: string, store: string) {
    save({ ...choices, where: { ...choices.where, [itemId]: store } })
  }
  function save(next: StoreChoices) {
    setOverrides((was) => ({ ...was, [list]: next }))
    try {
      sessionStorage.setItem(`merran.send.${list}`, JSON.stringify(next))
    } catch {
      /* Not remembered. */
    }
  }
  return { rest, order, whereOf, chooseOrder, chooseRest, move }
}

export function needsAttention(
  item: ShoppingItemProgress,
  store: string | undefined
) {
  if (item.deliveries.length)
    return item.deliveries.some((sent) => sent.changed)
  const product = item.products.find((product) => product.store === store)
  return !product || !product.inStock
}

/** The list stays underneath review; closing it returns to the same place. */
export function ShoppingProgress({
  plan,
  whereOf,
  rest,
  order,
  onOrder,
  onRest,
  filter,
  onFilter,
  review,
  onReview,
}: {
  plan: SendPlan
  whereOf: (item: ShoppingItemProgress) => string | undefined
  rest: string | undefined
  order: string | null
  onOrder: (store: string | null) => void
  onRest: (store: string) => void
  filter: ShoppingFilter
  onFilter: (filter: ShoppingFilter) => void
  review: { store: string; items: string[] } | null
  onReview: (review: { store: string; items: string[] } | null) => void
}) {
  const { t } = useTranslation()
  const actions = useListActions()
  const [buying, setBuying] = React.useState(false)
  const storeOptions = plan.stores.map((store) => ({
    value: store.key,
    label: store.name,
  }))
  return (
    <section
      className="grid gap-3 rounded-3xl border bg-card p-5"
      aria-label={t("list.shopping.title")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("list.shopping.title")}</h2>
        {plan.stores.length > 1 && (
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>{t("list.shopping.orderFrom")}</span>
            <Select
              items={[
                { value: "mixed", label: t("list.shopping.mixedOrder") },
                ...storeOptions,
              ]}
              value={order ?? "mixed"}
              onValueChange={(value) =>
                onOrder(value === "mixed" ? null : String(value))
              }
            >
              <SelectTrigger
                aria-label={t("list.shopping.orderFrom")}
                className="w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mixed">
                  {t("list.shopping.mixedOrder")}
                </SelectItem>
                {storeOptions.map((store) => (
                  <SelectItem key={store.value} value={store.value}>
                    {store.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("list.shopping.hint")}</p>
      {plan.stores.length > 1 && !order && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>{t("list.shopping.defaultStore")}</span>
          <Select
            items={storeOptions}
            value={rest ?? null}
            onValueChange={(value) => value && onRest(String(value))}
          >
            <SelectTrigger
              aria-label={t("list.shopping.defaultStore")}
              className="w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {storeOptions.map((store) => (
                <SelectItem key={store.value} value={store.value}>
                  {store.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {plan.stores.map((store) => {
          // Once sent, keep it at that store even if a newer product was picked elsewhere.
          const items = plan.items.filter(
            (item) =>
              item.sent.includes(store.key) ||
              (!item.sent.length && whereOf(item) === store.key)
          )
          if (!items.length) return null
          const sent = items.filter((item) => item.sent.includes(store.key))
          const ready = items.filter(
            (item) => !item.sent.length && !needsAttention(item, store.key)
          )
          const missing = items.filter(
            (item) =>
              !item.sent.length &&
              !item.products.some((product) => product.store === store.key)
          )
          const unavailable = items.filter(
            (item) =>
              !item.sent.length &&
              item.products.some(
                (product) => product.store === store.key && !product.inStock
              )
          )
          const attention = items.filter((item) =>
            needsAttention(item, store.key)
          )
          const bought = sent.filter(
            (item) => !item.deliveries.some((delivery) => delivery.changed)
          )
          return (
            <div
              key={store.key}
              className="grid content-start gap-3 rounded-2xl border p-4"
            >
              <h3 className="font-semibold">{store.name}</h3>
              <p className="text-sm" role="status">
                {t("list.shopping.summary", {
                  sent: sent.length,
                  ready: ready.length,
                  attention: attention.length,
                })}
              </p>
              {(missing.length > 0 || unavailable.length > 0) && (
                <p className="text-sm text-muted-foreground">
                  {t("list.shopping.productNeeds", {
                    missing: missing.length,
                    unavailable: unavailable.length,
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    onReview({
                      store: store.key,
                      items: items.map((item) => item.itemId),
                    })
                  }
                >
                  {t("list.shopping.review", { store: store.name })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <a
                      href={store.cartUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  {t("stores.basket.openCart")}
                </Button>
                {bought.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={buying}
                    onClick={async () => {
                      setBuying(true)
                      try {
                        await actions.bulk(
                          bought.map((item) => item.itemId),
                          { action: "check" },
                          (count) => t("list.shopping.markedBought", { count })
                        )
                      } finally {
                        setBuying(false)
                      }
                    }}
                  >
                    {t("list.shopping.markBought", { count: bought.length })}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div
        className="flex flex-wrap gap-2"
        aria-label={t("list.shopping.filter")}
      >
        {(["all", "attention", "sent"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
          >
            {t(`list.shopping.${value}`)}
          </Button>
        ))}
      </div>
      <ShoppingReview
        plan={plan}
        review={review}
        onClose={() => onReview(null)}
      />
    </section>
  )
}
