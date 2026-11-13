import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Toggle } from "@/components/ui/toggle"

import {
  AREAS,
  areasToOpen,
  areaSummary,
  PICKABLE,
  setArea,
  type PickableArea,
  type PickableEvent,
} from "./event-areas"

/** A chosen event's chip fills in, like the recipe filters. */
const CHIP =
  "rounded-full aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"

/**
 * Each pickable event's full name, the line saying what sends it, and the
 * short label on its chip.
 */
const EVENT_TEXT = {
  "recipe.created": {
    label: "settings.household.webhooks.events.recipe.created",
    hint: "settings.household.webhooks.eventHints.recipe.created",
    chip: "settings.household.webhooks.chips.recipe.created",
  },
  "recipe.updated": {
    label: "settings.household.webhooks.events.recipe.updated",
    hint: "settings.household.webhooks.eventHints.recipe.updated",
    chip: "settings.household.webhooks.chips.recipe.updated",
  },
  "recipe.deleted": {
    label: "settings.household.webhooks.events.recipe.deleted",
    hint: "settings.household.webhooks.eventHints.recipe.deleted",
    chip: "settings.household.webhooks.chips.recipe.deleted",
  },
  "recipe.restored": {
    label: "settings.household.webhooks.events.recipe.restored",
    hint: "settings.household.webhooks.eventHints.recipe.restored",
    chip: "settings.household.webhooks.chips.recipe.restored",
  },
  "import.finished": {
    label: "settings.household.webhooks.events.import.finished",
    hint: "settings.household.webhooks.eventHints.import.finished",
    chip: "settings.household.webhooks.chips.import.finished",
  },
  "tidy.ready": {
    label: "settings.household.webhooks.events.tidy.ready",
    hint: "settings.household.webhooks.eventHints.tidy.ready",
    chip: "settings.household.webhooks.chips.tidy.ready",
  },
  "review.waiting": {
    label: "settings.household.webhooks.events.review.waiting",
    hint: "settings.household.webhooks.eventHints.review.waiting",
    chip: "settings.household.webhooks.chips.review.waiting",
  },
  "cooking.started": {
    label: "settings.household.webhooks.events.cooking.started",
    hint: "settings.household.webhooks.eventHints.cooking.started",
    chip: "settings.household.webhooks.chips.cooking.started",
  },
  "cooking.ended": {
    label: "settings.household.webhooks.events.cooking.ended",
    hint: "settings.household.webhooks.eventHints.cooking.ended",
    chip: "settings.household.webhooks.chips.cooking.ended",
  },
  "timer.started": {
    label: "settings.household.webhooks.events.timer.started",
    hint: "settings.household.webhooks.eventHints.timer.started",
    chip: "settings.household.webhooks.chips.timer.started",
  },
  "timer.extended": {
    label: "settings.household.webhooks.events.timer.extended",
    hint: "settings.household.webhooks.eventHints.timer.extended",
    chip: "settings.household.webhooks.chips.timer.extended",
  },
  "timer.finished": {
    label: "settings.household.webhooks.events.timer.finished",
    hint: "settings.household.webhooks.eventHints.timer.finished",
    chip: "settings.household.webhooks.chips.timer.finished",
  },
  "timer.cancelled": {
    label: "settings.household.webhooks.events.timer.cancelled",
    hint: "settings.household.webhooks.eventHints.timer.cancelled",
    chip: "settings.household.webhooks.chips.timer.cancelled",
  },
  "plan.changed": {
    label: "settings.household.webhooks.events.plan.changed",
    hint: "settings.household.webhooks.eventHints.plan.changed",
    chip: "settings.household.webhooks.chips.plan.changed",
  },
  "plan.autoplanned": {
    label: "settings.household.webhooks.events.plan.autoplanned",
    hint: "settings.household.webhooks.eventHints.plan.autoplanned",
    chip: "settings.household.webhooks.chips.plan.autoplanned",
  },
  "meal.cooked": {
    label: "settings.household.webhooks.events.meal.cooked",
    hint: "settings.household.webhooks.eventHints.meal.cooked",
    chip: "settings.household.webhooks.chips.meal.cooked",
  },
  "meal.skipped": {
    label: "settings.household.webhooks.events.meal.skipped",
    hint: "settings.household.webhooks.eventHints.meal.skipped",
    chip: "settings.household.webhooks.chips.meal.skipped",
  },
  "list.changed": {
    label: "settings.household.webhooks.events.list.changed",
    hint: "settings.household.webhooks.eventHints.list.changed",
    chip: "settings.household.webhooks.chips.list.changed",
  },
  "list.completed": {
    label: "settings.household.webhooks.events.list.completed",
    hint: "settings.household.webhooks.eventHints.list.completed",
    chip: "settings.household.webhooks.chips.list.completed",
  },
  "list.sent": {
    label: "settings.household.webhooks.events.list.sent",
    hint: "settings.household.webhooks.eventHints.list.sent",
    chip: "settings.household.webhooks.chips.list.sent",
  },
  "pantry.changed": {
    label: "settings.household.webhooks.events.pantry.changed",
    hint: "settings.household.webhooks.eventHints.pantry.changed",
    chip: "settings.household.webhooks.chips.pantry.changed",
  },
} as const satisfies Record<
  PickableEvent,
  { label: string; hint: string; chip: string }
>

/**
 * The events a webhook is told about: one row per area, each opening to chips
 * for its events, with a checkbox on the row to choose the whole area.
 */
export function EventPicker({
  value,
  onChange,
  everything,
}: {
  value: PickableEvent[]
  onChange: (events: PickableEvent[]) => void
  everything: boolean
}) {
  const { t } = useTranslation()
  // Editing starts with the areas that already have something chosen open.
  const [open, setOpen] = React.useState<PickableArea[]>(() =>
    areasToOpen(value)
  )
  // The chip last focused or toggled in each area, whose hint shows below.
  const [lastTouched, setLastTouched] = React.useState<
    Partial<Record<PickableArea, PickableEvent>>
  >({})

  if (everything) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.household.webhooks.everythingChosen")}
      </p>
    )
  }

  function setAreaOpen(area: PickableArea, next: boolean) {
    setOpen((current) =>
      next ? [...current, area] : current.filter((other) => other !== area)
    )
  }

  function touch(area: PickableArea, type: PickableEvent) {
    setLastTouched((current) => ({ ...current, [area]: type }))
  }

  function toggle(area: PickableArea, type: PickableEvent, pressed: boolean) {
    touch(area, type)
    onChange(
      pressed ? [...value, type] : value.filter((event) => event !== type)
    )
  }

  return (
    <div className="divide-y rounded-xl border">
      {AREAS.map((area) => {
        const summary = areaSummary(value, area)
        const areaName = t(`settings.household.webhooks.areas.${area}`)
        const touched = lastTouched[area]

        return (
          <Collapsible
            key={area}
            open={open.includes(area)}
            onOpenChange={(next) => setAreaOpen(area, next)}
          >
            {/* The checkbox sits beside the trigger, not inside it, so ticking it never opens or closes the row. */}
            <div className="flex items-center gap-3 pe-3">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 p-3 text-start text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <span>{areaName}</span>
                <span className="text-muted-foreground">
                  {t("settings.household.webhooks.areaCount", {
                    chosen: summary.chosen,
                    total: summary.total,
                  })}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                />
              </CollapsibleTrigger>
              <Checkbox
                aria-label={t("settings.household.webhooks.areaAll", {
                  area: areaName,
                })}
                checked={summary.state === "all"}
                indeterminate={summary.state === "some"}
                onCheckedChange={(checked) =>
                  onChange(setArea(value, area, checked))
                }
              />
            </div>
            <CollapsibleContent className="space-y-2 px-3 pb-3">
              <div className="flex flex-wrap gap-2">
                {PICKABLE.filter((event) => event.area === area).map(
                  (event) => {
                    const text = EVENT_TEXT[event.type]
                    const hintId = `webhook-event-${event.type}-hint`
                    return (
                      <React.Fragment key={event.type}>
                        <Toggle
                          variant="outline"
                          size="sm"
                          className={CHIP}
                          pressed={value.includes(event.type)}
                          onPressedChange={(pressed) =>
                            toggle(area, event.type, pressed)
                          }
                          onFocus={() => touch(area, event.type)}
                          aria-describedby={hintId}
                        >
                          {t(text.chip)}
                        </Toggle>
                        {/* Said by screen readers, so each chip still tells what sends it. */}
                        <span id={hintId} className="sr-only">
                          {t(text.hint)}
                        </span>
                      </React.Fragment>
                    )
                  }
                )}
              </div>
              {/* Sighted people read the last chip's hint here; the chips already describe themselves to everyone else. */}
              {touched && (
                <p aria-hidden="true" className="text-sm text-muted-foreground">
                  {t(EVENT_TEXT[touched].hint)}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
