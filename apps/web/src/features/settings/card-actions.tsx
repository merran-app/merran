import type * as React from "react"

import { CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * A settings card's buttons, the same on every card: at the bottom right,
 * wrapping on a phone. The card's main action goes last, so it's always the
 * rightmost; other buttons for the same form go before it.
 */
export function CardActions({
  className,
  ...props
}: React.ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      className={cn("mt-6 flex-wrap justify-end gap-2", className)}
      {...props}
    />
  )
}

/**
 * The same, for a card with more than one section: each section ends with
 * its own buttons at its bottom right.
 */
export function SectionActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2", className)}
      {...props}
    />
  )
}
