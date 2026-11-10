import { useDirection } from "@base-ui/react/direction-provider"
import { StarIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { MAX_STARS, STAR_STEP } from "@merran/shared"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const STARS = Array.from({ length: MAX_STARS }, (_, index) => index + 1)

type Fill = "full" | "half" | "empty"

/** How much of a star a rating fills: 3.5 fills the first three and half the fourth. */
function fillOf(star: number, rating: number | null): Fill {
  if (rating === null) return "empty"
  if (rating >= star) return "full"
  if (rating >= star - STAR_STEP) return "half"
  return "empty"
}

/** Keeps a rating from half a star to five. */
function withinStars(rating: number) {
  return Math.min(MAX_STARS, Math.max(STAR_STEP, rating))
}

/**
 * One star, full, half or empty. A half star is a full one cut to the half
 * the line starts from, laid over an empty one.
 */
function Star({
  fill,
  className,
  emptyClassName,
}: {
  fill: Fill
  className: string
  emptyClassName: string
}) {
  if (fill !== "half") {
    return (
      <HugeiconsIcon
        icon={StarIcon}
        strokeWidth={2}
        className={cn(
          className,
          fill === "full" ? "[&_path]:fill-current" : emptyClassName
        )}
      />
    )
  }

  return (
    // A block, as the whole stars' icons are, so it doesn't sit on a line of
    // text and make the row taller than they do.
    <span className={cn("relative block shrink-0", className)}>
      <HugeiconsIcon
        icon={StarIcon}
        strokeWidth={2}
        className={cn("size-full", emptyClassName)}
      />
      <HugeiconsIcon
        icon={StarIcon}
        strokeWidth={2}
        className="absolute inset-0 size-full [clip-path:inset(0_50%_0_0)] rtl:[clip-path:inset(0_0_0_50%)] [&_path]:fill-current"
      />
    </span>
  )
}

/** A rating, shown as stars. */
export function RatingStars({
  rating,
  className,
}: {
  rating: number
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span
      role="img"
      aria-label={t("recipes.rating.label", { count: rating })}
      className={cn("inline-flex items-center text-highlight", className)}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          fill={fillOf(star, rating)}
          className="size-3.5"
          emptyClassName="opacity-30"
        />
      ))}
    </span>
  )
}

/**
 * Five stars to pick a rating with. Each star has two halves: the one the
 * line starts from, the left in English, gives half a star. Picking the rating already chosen clears it.
 */
export function RatingInput({
  value,
  onChange,
  id,
}: {
  value: number | null
  onChange: (rating: number | null) => void
  id?: string
}) {
  const { t } = useTranslation()
  const direction = useDirection()
  // What a mouse over the stars would pick, shown until it leaves them.
  const [preview, setPreview] = React.useState<number | null>(null)
  const choices = React.useRef(new Map<number, HTMLButtonElement>())
  const shown = preview ?? value
  // As in any group of radios, Tab stops only on the chosen one, or the
  // first when none is, and the arrow keys move between them.
  const tabStop = value ?? STAR_STEP

  function pick(rating: number) {
    // Show what was picked, or that it was cleared, rather than the hover.
    setPreview(null)
    onChange(value === rating ? null : rating)
  }

  function previewOnHover(event: React.PointerEvent, rating: number) {
    // A tap has no hover to undo, so only a mouse previews.
    if (event.pointerType === "mouse") setPreview(rating)
  }

  function choiceRef(rating: number) {
    return (element: HTMLButtonElement | null) => {
      if (element) choices.current.set(rating, element)
      else choices.current.delete(rating)
    }
  }

  function moveTo(rating: number) {
    const next = withinStars(rating)
    if (next !== value) onChange(next)
    choices.current.get(next)?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const current = value ?? 0
    // More stars are the way the line runs: left in a right-to-left language.
    const forward = direction === "rtl" ? -STAR_STEP : STAR_STEP
    const targets: Record<string, number> = {
      ArrowRight: current + forward,
      ArrowUp: current + STAR_STEP,
      ArrowLeft: current - forward,
      ArrowDown: current - STAR_STEP,
      Home: STAR_STEP,
      End: MAX_STARS,
    }
    const target = targets[event.key]
    if (target === undefined) return

    event.preventDefault()
    moveTo(target)
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={t("recipes.fields.rating")}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => setPreview(null)}
      className="-ms-1 flex items-center"
    >
      {STARS.map((star) => (
        <span
          key={star}
          className="relative rounded-full p-1 text-highlight transition-transform hover:scale-110 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
        >
          <Star
            fill={fillOf(star, shown)}
            className="size-6"
            emptyClassName="opacity-40"
          />
          {[star - STAR_STEP, star].map((rating) => (
            <button
              key={rating}
              ref={choiceRef(rating)}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={t("recipes.rating.label", { count: rating })}
              tabIndex={rating === tabStop ? 0 : -1}
              onClick={() => pick(rating)}
              onPointerEnter={(event) => previewOnHover(event, rating)}
              className={cn(
                "absolute inset-y-0 w-1/2 outline-none",
                rating === star ? "end-0" : "start-0"
              )}
            />
          ))}
        </span>
      ))}
    </div>
  )
}
