import { WEBHOOK_AREAS, WEBHOOK_EVENTS } from "@merran/shared"
import { useTranslation } from "react-i18next"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"

import type { Webhook } from "./queries"

/** The events a webhook can be set to listen for. */
export type PickableEvent = Webhook["events"][number]

type PickableEntry = Extract<
  (typeof WEBHOOK_EVENTS)[number],
  { pickable: true }
>

/** Events that are only ever sent by hand, like the test, aren't offered. */
const PICKABLE = WEBHOOK_EVENTS.filter(
  (event): event is PickableEntry => event.pickable
)

/** The areas that have something to pick, in their usual order. */
const AREAS = WEBHOOK_AREAS.filter((area): area is PickableEntry["area"] =>
  PICKABLE.some((event) => event.area === area)
)

/** Each pickable event's label, and the line under it saying what sends it. */
const EVENT_TEXT = {
  "recipe.created": {
    label: "settings.household.webhooks.events.recipe.created",
    hint: "settings.household.webhooks.eventHints.recipe.created",
  },
  "recipe.updated": {
    label: "settings.household.webhooks.events.recipe.updated",
    hint: "settings.household.webhooks.eventHints.recipe.updated",
  },
  "recipe.deleted": {
    label: "settings.household.webhooks.events.recipe.deleted",
    hint: "settings.household.webhooks.eventHints.recipe.deleted",
  },
  "recipe.restored": {
    label: "settings.household.webhooks.events.recipe.restored",
    hint: "settings.household.webhooks.eventHints.recipe.restored",
  },
} as const satisfies Record<PickableEvent, { label: string; hint: string }>

/** The events a webhook is told about, as checkboxes under their areas. */
export function EventPicker({
  value,
  onChange,
  disabled,
}: {
  value: PickableEvent[]
  onChange: (events: PickableEvent[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  function toggle(type: PickableEvent, checked: boolean) {
    onChange(
      checked ? [...value, type] : value.filter((event) => event !== type)
    )
  }

  return (
    <FieldGroup>
      {AREAS.map((area) => (
        <FieldSet key={area}>
          <FieldLegend variant="label">
            {t(`settings.household.webhooks.areas.${area}`)}
          </FieldLegend>
          {PICKABLE.filter((event) => event.area === area).map((event) => {
            const id = `webhook-event-${event.type}`
            const text = EVENT_TEXT[event.type]
            return (
              <Field key={event.type} orientation="horizontal">
                <Checkbox
                  id={id}
                  aria-describedby={`${id}-hint`}
                  checked={value.includes(event.type)}
                  onCheckedChange={(checked) => toggle(event.type, checked)}
                  disabled={disabled}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>{t(text.label)}</FieldLabel>
                  <FieldDescription id={`${id}-hint`}>
                    {t(text.hint)}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )
          })}
        </FieldSet>
      ))}
    </FieldGroup>
  )
}
