import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { diffRows } from "./line-diff"

export function LineChanges({
  before,
  after,
}: {
  before: readonly string[]
  after: readonly string[]
}) {
  const { t } = useTranslation()
  const [showUnchanged, setShowUnchanged] = useState(false)
  const rows = useMemo(() => diffRows(before, after), [before, after])
  const unchanged = rows.filter((row) => row.kind === "kept").length
  const visible = showUnchanged
    ? rows
    : rows.filter((row) => row.kind !== "kept")

  return (
    <div className="@container grid gap-3">
      <div className="flex flex-wrap gap-3 text-xs font-medium">
        {(["changed", "added", "removed"] as const).map((kind) => (
          <span key={kind}>
            {t(`recipes.review.${kind}Count`, {
              count: rows.filter((row) => row.kind === kind).length,
            })}
          </span>
        ))}
      </div>
      {unchanged > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          aria-pressed={showUnchanged}
          onClick={() => setShowUnchanged((shown) => !shown)}
        >
          {showUnchanged
            ? t("recipes.review.hideUnchanged")
            : t("recipes.review.showUnchanged", { count: unchanged })}
        </Button>
      )}
      <ul className="grid gap-3 text-sm">
        {visible.map((row, index) => (
          <li key={index} className="overflow-hidden rounded-xl border">
            <div className="border-b px-3 py-2">
              <Badge variant="outline">{t(`recipes.review.${row.kind}`)}</Badge>
            </div>
            <div className="grid @lg:grid-cols-2">
              <div className="min-w-0 border-b bg-muted/40 p-3 @lg:border-r @lg:border-b-0">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("recipes.review.previously")}
                </p>
                <LineValue
                  value={row.before}
                  empty={t("recipes.review.notPresent")}
                />
              </div>
              <div
                className={cn(
                  "min-w-0 p-3",
                  row.kind !== "kept" && row.after !== null && "bg-accent"
                )}
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("recipes.review.suggested")}
                </p>
                <LineValue
                  value={row.after}
                  empty={t("recipes.review.notPresent")}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LineValue({ value, empty }: { value: string | null; empty: string }) {
  return (
    <p
      className={cn(
        "leading-relaxed break-words whitespace-pre-wrap",
        value === null && "text-muted-foreground italic",
        value?.trim().startsWith("#") && "font-semibold"
      )}
    >
      {value === null ? empty : value.replace(/^\s*#+\s*/, "")}
    </p>
  )
}
