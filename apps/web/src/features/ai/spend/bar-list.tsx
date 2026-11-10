import * as React from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { initials } from "@/lib/initials"

import { formatMoney } from "../queries"

export type BarItem = {
  key: string
  label: ReactNode
  cost: number
  /** Something before the label, like a person's initials. */
  lead?: ReactNode
}

/**
 * Where the money went, biggest first, as bars in one quiet color so the
 * amounts lead. The first few show; the rest are a click away.
 */
export function BarList({
  title,
  items,
  shown = 5,
}: {
  title: string
  items: BarItem[]
  shown?: number
}) {
  const { t, i18n } = useTranslation()
  const [all, setAll] = React.useState(false)
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => b.cost - a.cost)
  const highest = Math.max(sorted[0]?.cost ?? 0, 0.01)
  const visible = all ? sorted : sorted.slice(0, shown)

  return (
    <section className="grid content-start gap-2">
      <h3 className="font-sans text-sm font-medium">{title}</h3>
      <ul className="grid gap-2">
        {visible.map((item) => (
          <li
            key={item.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(3rem,7rem)_auto] items-center gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              {item.lead}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-muted-foreground/45"
                style={{ width: `${(item.cost / highest) * 100}%` }}
              />
            </span>
            <span className="text-end tabular-nums">
              {formatMoney(item.cost, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > shown && (
        <Button
          variant="ghost"
          size="sm"
          className="-ms-2 justify-self-start text-muted-foreground"
          onClick={() => setAll(!all)}
        >
          {all
            ? t("ai.spend.showFewer")
            : t("ai.spend.showAll", { count: sorted.length })}
        </Button>
      )}
    </section>
  )
}

/** A person's initials in a circle, for a bar list. */
export function Initials({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium"
    >
      {initials(name)}
    </span>
  )
}
