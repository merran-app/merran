import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate } from "@/lib/format"

import { itemDetailsQuery, type ListItem } from "./queries"

/** Compare the amount to buy with the current recipe lines, without leaving List. */
export function ItemInfo({ item }: { item: ListItem }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const details = useQuery({ ...itemDetailsQuery(item.id), enabled: open })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={150}
        aria-label={t("list.details.open", { name: item.name })}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <HugeiconsIcon
          icon={InformationCircleIcon}
          strokeWidth={1.75}
          className="size-4"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(32rem,var(--available-height))] w-96 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto overscroll-contain"
      >
        <div>
          <PopoverTitle className="first-letter:uppercase">
            {item.name}
          </PopoverTitle>
          <p className="mt-1 text-muted-foreground">
            {t("list.details.listed", {
              amount:
                details.data?.amount ||
                item.amount ||
                t("list.details.noAmount"),
            })}
          </p>
        </div>
        {details.isPending && <p role="status">{t("list.details.loading")}</p>}
        {details.isError && (
          <div role="alert">
            <p>{t("list.details.error")}</p>
            <button
              type="button"
              onClick={() => void details.refetch()}
              className="mt-2 rounded text-primary underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {t("list.details.retry")}
            </button>
          </div>
        )}
        {details.data && (
          <>
            {details.data.meals.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {t("list.details.explanation")}
                </p>
                {details.data.meals.map((meal) => (
                  <section key={meal.id} className="space-y-2 border-t pt-3">
                    <div>
                      <h3 className="font-medium">{meal.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {meal.anyDay
                          ? t("list.details.anyDay")
                          : formatDate(`${meal.date}T12:00:00`, i18n.language)}
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {meal.lines.map((line, index) => (
                        <li key={index} className="min-w-0 break-words">
                          {line.recipe !== meal.name && (
                            <p className="text-xs text-muted-foreground">
                              {line.recipe}
                            </p>
                          )}
                          <p>{line.original}</p>
                          {line.factor !== 1 && (
                            <p className="text-xs text-primary">
                              {t("list.details.planned", {
                                line: line.planned,
                              })}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      {t("list.details.afterPantry", {
                        amount: meal.listedAmounts
                          .map((amount) => amount || t("list.details.noAmount"))
                          .join(" + "),
                      })}
                    </p>
                  </section>
                ))}
              </>
            ) : (
              <p className="text-muted-foreground">
                {t("list.details.noRecipes")}
              </p>
            )}
            {details.data.unavailableMeals > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("list.details.unavailable", {
                  count: details.data.unavailableMeals,
                })}
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
