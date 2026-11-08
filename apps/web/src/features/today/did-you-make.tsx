import { queryOptions, useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatWeekday } from "@/features/plan/format"
import type { PlanEntry } from "@/features/plan/queries"
import { usePlanActions } from "@/features/plan/use-plan-actions"
import { api, unwrap } from "@/lib/api/client"

import { SectionHeading } from "./section-heading"

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Past meals nobody marked. Under "plan", so a meal answered on another
 * phone leaves this one too.
 */
const unmarkedQuery = queryOptions({
  queryKey: ["plan", "unmarked"],
  queryFn: () => unwrap(api.GET("/api/plan/unmarked")),
})

/**
 * "Did you make these?": recipe meals from the past six days, and last
 * week's pool, still planned. Saying keeps the pantry right: a meal made
 * takes its food, and one that wasn't frees it to use soon.
 */
export function DidYouMake() {
  const { t } = useTranslation()
  const { data } = useQuery(unmarkedQuery)
  const actions = usePlanActions()
  const [busy, setBusy] = React.useState(false)
  const entries = data?.entries ?? []
  if (entries.length === 0) return null

  async function answer(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  async function didnt(entry: PlanEntry) {
    const done = await actions.change(entry, { status: "skipped" })
    if (!done) return
    toast.success(t("today.didYouMake.skipped", { name: nameOf(entry) }), {
      duration: UNDO_MS,
      action: {
        label: t("today.didYouMake.undo"),
        onClick: () => void actions.change(done, { status: "planned" }),
      },
    })
  }

  function madeThemAll() {
    return actions.bulk(
      entries.map((entry) => entry.id),
      { action: "status", status: "cooked" }
    )
  }

  return (
    <section aria-labelledby="did-you-make" className="grid gap-3">
      <SectionHeading id="did-you-make">
        {t("today.didYouMake.title")}
      </SectionHeading>
      <div className="grid gap-3 rounded-3xl border bg-card p-5 text-card-foreground">
        <p className="text-sm text-muted-foreground">
          {t("today.didYouMake.hint")}
        </p>
        <ul className="grid gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            >
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate font-semibold">{nameOf(entry)}</span>
                <span className="text-sm text-muted-foreground">
                  <When entry={entry} />
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void answer(() =>
                      actions.change(entry, { status: "cooked" })
                    )
                  }
                >
                  {t("today.didYouMake.madeIt")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void answer(() => didnt(entry))}
                >
                  {t("today.didYouMake.didnt")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {entries.length > 1 && (
          <div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void answer(madeThemAll)}
            >
              {t("today.didYouMake.all")}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

const nameOf = (entry: PlanEntry) => entry.recipe?.name ?? entry.note ?? ""

/** "Tuesday's dinner", or last week's pool. */
function When({ entry }: { entry: PlanEntry }) {
  const { t, i18n } = useTranslation()
  if (entry.anyDay) return t("today.didYouMake.pool")
  return t("today.didYouMake.when", {
    day: formatWeekday(entry.date, i18n.language),
    meal: t(`plan.mealNames.${entry.meal}`),
  })
}
