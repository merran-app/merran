import { ArrowMoveUpRightIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MoveMealsDialog } from "../change-meal-dialog"
import type { Meal, PlanEntry } from "../queries"
import { usePlanActions } from "../use-plan-actions"
import { whenValue } from "../when"
import { insertionBar, insertionIndex, reorderFor, type Box } from "./insertion"
import { OccupiedPrompt } from "./occupied-prompt"

type Destination = { date: string; anyDay: boolean; meal?: Meal }
const nameOf = (entry: PlanEntry) => entry.recipe?.name ?? entry.note ?? ""
const sameSlot = (entry: PlanEntry, to: Destination) =>
  entry.date === to.date &&
  entry.anyDay === to.anyDay &&
  (to.meal === undefined || entry.meal === to.meal)
const destinationKey = (to: Destination) => JSON.stringify(to)

/** The dishes a dish can be reordered among: its own meal, or its meal type in the pool. */
const groupOf = (entries: PlanEntry[], entry: PlanEntry) =>
  entries
    .filter(
      (other) =>
        other.date === entry.date &&
        other.anyDay === entry.anyDay &&
        other.meal === entry.meal
    )
    .sort((a, b) => a.position - b.position)

/** Where a dish's tile is on screen, if it's showing. */
function boxOf(id: string): Box | null {
  const tile = document.querySelector(`[data-meal-dish="${CSS.escape(id)}"]`)
  if (!tile) return null
  const { left, top, width, height } = tile.getBoundingClientRect()
  return { left, top, width, height }
}

/** A dish dragged within its own group: its new order, and the bar to show. */
type Insertion = { ids: string[]; index: number; bar: Box }

// Only zones rendered by this planner are destinations. Pointer capture keeps
// dragging on the handle while hit testing finds the slot beneath it.
function destinationAt(x: number, y: number): Destination | null {
  const zone = document.elementFromPoint(x, y)?.closest("[data-meal-drop]")
  const value = zone?.getAttribute("data-meal-drop")
  return value ? (JSON.parse(value) as Destination) : null
}

type PointerDrag = {
  id: string
  pointerId: number
  fromX: number
  fromY: number
  x: number
  y: number
  active: boolean
}
type DragState = {
  week: string
  source: PlanEntry | undefined
  over: string | null
  busy: boolean
  start: (event: React.PointerEvent<HTMLButtonElement>, id: string) => void
  track: (event: React.PointerEvent<HTMLButtonElement>) => void
  finish: (event: React.PointerEvent<HTMLButtonElement>) => void
  cancel: () => void
  preventClick: () => boolean
}
const DragContext = React.createContext<DragState | null>(null)

/** Moves through the existing transactional bulk action, with its Undo. */
export function MealDragProvider({
  week,
  entries,
  disabled,
  children,
}: {
  week: string
  entries: PlanEntry[]
  disabled: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const actions = usePlanActions()
  const [id, setId] = React.useState<string | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [point, setPoint] = React.useState({ x: 0, y: 0 })
  const [insertion, setInsertion] = React.useState<Insertion | null>(null)
  const pointer = React.useRef<PointerDrag | null>(null)
  const suppressClick = React.useRef(false)
  const saving = React.useRef(false)
  const [busy, setBusy] = React.useState(false)
  const [pending, setPending] = React.useState<{
    id: string
    to: Destination
  } | null>(null)
  const source = entries.find((entry) => entry.id === id)
  const pendingEntry = entries.find((entry) => entry.id === pending?.id)
  const occupants = pending
    ? entries.filter(
        (entry) => entry.id !== pending.id && sameSlot(entry, pending.to)
      )
    : []

  const cancel = React.useCallback(() => {
    pointer.current = null
    setId(null)
    setOver(null)
    setInsertion(null)
  }, [])

  /**
   * Over its own meal, or its own meal type in the pool, a dish goes
   * between the others: where, from the pointer and their tiles.
   */
  function insertionAt(
    entryId: string,
    to: Destination | null,
    x: number,
    y: number
  ): Insertion | null {
    const entry = entries.find((other) => other.id === entryId)
    if (!entry || !to || !sameSlot(entry, to)) return null
    const ids = groupOf(entries, entry).map((other) => other.id)
    if (ids.length < 2) return null
    const boxes = ids
      .filter((other) => other !== entryId)
      .map(boxOf)
      .filter((box): box is Box => box !== null)
    if (boxes.length !== ids.length - 1) return null
    const index = insertionIndex(boxes, { x, y })
    return { ids, index, bar: insertionBar(boxes, index) }
  }

  /** What's under the pointer: a meal to drop on, or a place among the dishes. */
  const aim = React.useCallback(
    (entryId: string, x: number, y: number) => {
      const to = destinationAt(x, y)
      setOver(to ? destinationKey(to) : null)
      setInsertion(insertionAt(entryId, to, x, y))
    },
    [entries]
  )

  // Native scrolling still works everywhere except the small drag handle.
  // Near a viewport edge, scroll continuously so distant days can be reached.
  React.useEffect(() => {
    if (!id || disabled) {
      cancel()
      return
    }
    let frame: number
    const scroll = () => {
      const current = pointer.current
      if (!current?.active) return
      const edge = 80
      const speed =
        current.y < edge
          ? -Math.ceil((edge - current.y) / 5)
          : current.y > window.innerHeight - edge
            ? Math.ceil((current.y - window.innerHeight + edge) / 5)
            : 0
      if (speed) {
        window.scrollBy(0, speed)
        aim(current.id, current.x, current.y)
      }
      frame = requestAnimationFrame(scroll)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        cancel()
      }
    }
    frame = requestAnimationFrame(scroll)
    window.addEventListener("keydown", onKey)
    window.addEventListener("blur", cancel)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", cancel)
    }
  }, [id, disabled, cancel, aim])

  async function move(entryId: string, to: Destination) {
    if (saving.current || disabled) return
    saving.current = true
    setBusy(true)
    setPending(null)
    try {
      await actions.bulk([entryId], { action: "move", ...to })
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function swap(entry: PlanEntry, other: PlanEntry) {
    if (saving.current || disabled) return
    saving.current = true
    setBusy(true)
    setPending(null)
    try {
      await actions.swap(entry, other)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function reorder(entry: PlanEntry, ids: string[]) {
    if (saving.current || disabled) return
    saving.current = true
    setBusy(true)
    try {
      await actions.reorder(entry, ids, "drag")
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  /** Dropped among its own meal's dishes: a new order, unless it's the same. */
  function dropBetween(entryId: string, placed: Insertion) {
    const entry = entries.find((other) => other.id === entryId)
    const order = reorderFor(placed.ids, entryId, placed.index)
    if (!entry || !order || saving.current || disabled) return
    void reorder(entry, order)
  }

  function drop(entryId: string, to: Destination) {
    const entry = entries.find((entry) => entry.id === entryId)
    if (!entry || sameSlot(entry, to) || saving.current || disabled) return
    // An occupied slot can hold several dishes. Ask: swap with one, or alongside.
    if (!to.anyDay && entries.some((entry) => sameSlot(entry, to)))
      setPending({ id: entry.id, to })
    else void move(entry.id, to)
  }

  return (
    <DragContext
      value={{
        week,
        source: disabled ? undefined : source,
        over,
        busy: busy || disabled || pending !== null,
        start: (event, entryId) => {
          event.stopPropagation()
          if (
            event.button !== 0 ||
            !event.isPrimary ||
            disabled ||
            saving.current ||
            pending
          )
            return
          suppressClick.current = false
          pointer.current = {
            id: entryId,
            pointerId: event.pointerId,
            fromX: event.clientX,
            fromY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            active: false,
          }
          event.currentTarget.setPointerCapture(event.pointerId)
        },
        track: (event) => {
          const current = pointer.current
          if (!current || current.pointerId !== event.pointerId) return
          current.x = event.clientX
          current.y = event.clientY
          if (
            !current.active &&
            Math.hypot(current.x - current.fromX, current.y - current.fromY) < 6
          )
            return
          current.active = true
          suppressClick.current = true
          setId(current.id)
          setPoint({ x: current.x, y: current.y })
          aim(current.id, current.x, current.y)
        },
        finish: (event) => {
          const current = pointer.current
          if (!current || current.pointerId !== event.pointerId) return
          const to = current.active
            ? destinationAt(event.clientX, event.clientY)
            : null
          const placed = insertionAt(
            current.id,
            to,
            event.clientX,
            event.clientY
          )
          cancel()
          if (placed) dropBetween(current.id, placed)
          else if (to) drop(current.id, to)
        },
        cancel,
        preventClick: () => {
          const prevented = suppressClick.current
          suppressClick.current = false
          return prevented
        },
      }}
    >
      {children}
      {source && !disabled && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 max-w-56 truncate rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-lg"
          style={{
            left: Math.max(
              8,
              Math.min(point.x + 16, document.documentElement.clientWidth - 240)
            ),
            top: point.y + 16,
          }}
        >
          {nameOf(source)}
        </div>
      )}
      {source && !disabled && insertion && (
        <InsertionBar bar={insertion.bar} label={t("plan.drag.dropBetween")} />
      )}
      <p className="sr-only" role="status">
        {source ? t("plan.drag.pickedUp", { name: nameOf(source) }) : ""}
      </p>
      {pending && pendingEntry && (
        <OccupiedPrompt
          entry={pendingEntry}
          occupants={occupants}
          date={pending.to.date}
          meal={pending.to.meal!}
          busy={busy || disabled}
          onSwap={(other) => void swap(pendingEntry, other)}
          onAlongside={() => void move(pending.id, pending.to)}
          onCancel={() => setPending(null)}
        />
      )}
    </DragContext>
  )
}

/** Where a dragged dish will go among its meal's dishes, drawn over them. */
function InsertionBar({ bar, label }: { bar: Box; label: string }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-40 rounded-full bg-primary"
        style={bar}
      />
      <p
        aria-hidden
        className="pointer-events-none fixed z-40 rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
        style={{ left: bar.left, top: bar.top + bar.height + 4 }}
      >
        {label}
      </p>
    </>
  )
}

/** Tapping or activating the handle opens the same destination picker. */
export function MealDragHandle({ entry }: { entry: PlanEntry }) {
  const { t } = useTranslation()
  const drag = React.useContext(DragContext)
  const [moving, setMoving] = React.useState(false)
  if (!drag) return null
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute -right-1.5 -bottom-1.5 cursor-grab touch-none rounded-full border bg-card shadow-sm active:cursor-grabbing"
        disabled={drag.busy}
        aria-label={t("plan.drag.move", { name: nameOf(entry) })}
        title={t("plan.drag.handleHint")}
        onPointerDown={(event) => drag.start(event, entry.id)}
        onPointerMove={drag.track}
        onPointerUp={drag.finish}
        onPointerCancel={drag.cancel}
        onLostPointerCapture={drag.cancel}
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          if (event.detail > 0 && drag.preventClick()) return
          setMoving(true)
        }}
      >
        <HugeiconsIcon icon={ArrowMoveUpRightIcon} strokeWidth={2} />
      </Button>
      {moving && (
        <MoveMealsDialog
          ids={[entry.id]}
          entry={entry}
          week={drag.week}
          initialWhen={whenValue(entry)}
          initialMeal={entry.meal}
          open={moving}
          onOpenChange={setMoving}
          onMoved={() => setMoving(false)}
        />
      )}
    </>
  )
}

/** Slots keep their size while dragging so targets don't move under the pointer. */
export function MealDropZone({
  to,
  className,
  children,
}: {
  to: Destination
  className?: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const drag = React.useContext(DragContext)
  const accepts = Boolean(
    drag?.source && !drag.busy && !sameSlot(drag.source, to)
  )
  const over = accepts && drag?.over === destinationKey(to)
  return (
    <div
      data-meal-drop={destinationKey(to)}
      className={cn(
        "relative min-w-0 rounded-2xl",
        className,
        accepts && "outline-2 outline-primary/40 outline-dashed",
        over && "bg-accent outline-primary outline-solid"
      )}
    >
      {children}
      {over && (
        <p className="pointer-events-none absolute top-full left-0 z-10 max-w-full rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
          {t(to.anyDay ? "plan.drag.dropPool" : "plan.drag.dropMeal")}
        </p>
      )}
    </div>
  )
}
