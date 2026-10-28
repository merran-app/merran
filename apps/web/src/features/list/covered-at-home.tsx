import { useQuery } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useDayLabel } from "@/features/pantry/use-soon"

import { coveredQuery, type CoveredItem } from "./queries"
import { useForMeals } from "./use-for-meals"

/** The link Add from plan's message opens this with. */
export const COVERED_HASH = "covered-at-home"

/**
 * What the list counted on at home for meals on it, so left off: under
 * the list, a line of names until it's opened. Each thing says how much is
 * at home, for which meals, and what's still on the list when it covers
 * only part, with Not at home for when it isn't there after all. What's
 * always on hand that those meals use gets a line of its own.
 */
export function CoveredAtHome({
  list,
  withOnHand,
  onChangeOnHand,
}: {
  /** The list showing, when there's more than one. */
  list?: string
  /** Whether to say what's always on hand: on one list only. */
  withOnHand: boolean
  onChangeOnHand: () => void
}) {
  const { t } = useTranslation()
  const covered = useQuery(coveredQuery)
  const forMeals = useForMeals()
  const hash = useRouterState({ select: (state) => state.location.hash })
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const section = React.useRef<HTMLElement>(null)

  // Add from plan's See what's covered opens it, once what's covered has
  // loaded. The link then goes, keeping the page where it is, so the next
  // one opens it again and the list loading again doesn't.
  const loaded = Boolean(covered.data) && !covered.isFetching
  React.useEffect(() => {
    if (hash !== COVERED_HASH || !loaded) return
    setOpen(true)
    const scroll = () =>
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    void navigate({ to: "/list", replace: true, resetScroll: false }).then(
      () => {
        scroll()
        // The list can still be growing as it scrolls, on a phone most of
        // all: once more when it fell short. Gone by then, nothing to do.
        window.setTimeout(() => {
          const top = section.current?.getBoundingClientRect().top
          if (top !== undefined && top > window.innerHeight / 2) scroll()
        }, 800)
      }
    )
  }, [hash, loaded, navigate])

  const items = (covered.data?.items ?? []).filter(
    (item) => !list || item.list === list
  )
  const onHand = withOnHand ? (covered.data?.onHand ?? []) : []
  if (items.length === 0 && onHand.length === 0) return null

  return (
    <section
      ref={section}
      id={COVERED_HASH}
      aria-labelledby="covered-at-home-title"
      className="@container scroll-mt-20 rounded-3xl border bg-muted/40 px-5 md:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
        <p id="covered-at-home-title" className="min-w-0 text-muted-foreground">
          <span className="font-semibold text-foreground">
            {items.length > 0
              ? t("list.covered.count", { count: items.length })
              : t("list.covered.title")}
          </span>
          {!open && items.length > 0 && (
            <span>
              : {items.map((item) => item.name.toLowerCase()).join(", ")}
            </span>
          )}
        </p>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            {open ? t("list.hide") : t("list.show")}
          </Button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul className="divide-y border-t">
          {items.map((item) => (
            <CoveredRow
              key={item.id}
              item={item}
              onNotAtHome={() => void forMeals.notAtHome(item)}
            />
          ))}
        </ul>
      )}
      {onHand.length > 0 && (
        <div
          className={
            items.length > 0
              ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t py-3"
              : "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3.5"
          }
        >
          <p className="min-w-0 text-sm text-muted-foreground">
            {t("list.covered.onHand", { names: onHand.join(", ") })}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full bg-card"
            onClick={onChangeOnHand}
          >
            {t("list.covered.changeOnHand")}
          </Button>
        </div>
      )}
    </section>
  )
}

/** One thing at home: how much, for which meals, and what's still to buy. */
function CoveredRow({
  item,
  onNotAtHome,
}: {
  item: CoveredItem
  onNotAtHome: () => void
}) {
  const { t } = useTranslation()
  const dayLabel = useDayLabel()
  const meals = item.meals
    .map((meal) =>
      t("list.covered.meal", {
        name: meal.name,
        day: meal.anyDay ? t("list.covered.anyDay") : dayLabel(meal.date),
      })
    )
    .join(", ")

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="break-words">
          <span className="font-medium">{item.name}</span>
          <span className="text-muted-foreground">
            {" · "}
            {item.amount
              ? t("list.covered.amount", { amount: item.amount })
              : t("list.covered.some")}
          </span>
        </p>
        <p className="text-sm break-words text-muted-foreground">
          {t("list.covered.for", { meals })}
          {item.stillToBuy &&
            ` · ${t("list.covered.stillToBuy", { amount: item.stillToBuy })}`}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full bg-card"
        aria-label={t("list.covered.notAtHomeName", { name: item.name })}
        onClick={onNotAtHome}
      >
        {t("list.covered.notAtHome")}
      </Button>
    </li>
  )
}
