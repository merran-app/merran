import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A model choice on one line: what it's for, with a short hint, on one side
 * and its picker on the other. Stacked on a phone, where there's no room
 * for both.
 */
export function ModelRow({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] sm:items-center sm:gap-4",
        className
      )}
    >
      <div className="grid min-w-0 gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
