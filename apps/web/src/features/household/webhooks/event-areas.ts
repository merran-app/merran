import { WEBHOOK_AREAS, WEBHOOK_EVENTS } from "@merran/shared"

import type { Webhook } from "./queries"

/** The events a webhook can be set to listen for. */
export type PickableEvent = Webhook["events"][number]

type PickableEntry = Extract<
  (typeof WEBHOOK_EVENTS)[number],
  { pickable: true }
>

export type PickableArea = PickableEntry["area"]

/** Events that are only ever sent by hand, like the test, aren't offered. */
export const PICKABLE = WEBHOOK_EVENTS.filter(
  (event): event is PickableEntry => event.pickable
)

/** The areas that have something to pick, in their usual order. */
export const AREAS = WEBHOOK_AREAS.filter((area): area is PickableArea =>
  PICKABLE.some((event) => event.area === area)
)

function eventsOf(area: PickableArea): PickableEvent[] {
  return PICKABLE.filter((event) => event.area === area).map(
    (event) => event.type
  )
}

/** How many of an area's events are chosen, for its row's count and checkbox. */
export function areaSummary(
  value: readonly PickableEvent[],
  area: PickableArea
): { chosen: number; total: number; state: "none" | "some" | "all" } {
  const events = eventsOf(area)
  const chosen = events.filter((event) => value.includes(event)).length

  let state: "none" | "some" | "all" = "some"
  if (chosen === 0) state = "none"
  if (chosen === events.length) state = "all"

  return { chosen, total: events.length, state }
}

/**
 * Chooses every event of an area, or none of them, leaving the other areas
 * alone. The result follows the catalog's order, so it never depends on the
 * order things were ticked in.
 */
export function setArea(
  value: readonly PickableEvent[],
  area: PickableArea,
  on: boolean
): PickableEvent[] {
  const inArea = eventsOf(area)

  return PICKABLE.map((event) => event.type).filter((type) => {
    if (inArea.includes(type)) return on
    return value.includes(type)
  })
}

/** The areas with something chosen, which the form starts open. */
export function areasToOpen(value: readonly PickableEvent[]): PickableArea[] {
  return AREAS.filter((area) => areaSummary(value, area).chosen > 0)
}
