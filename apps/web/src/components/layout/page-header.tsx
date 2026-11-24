import type * as React from "react"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 pt-2 pb-6 sm:flex-row sm:items-end sm:justify-between md:pt-4">
      <div className="min-w-0 space-y-1">
        {/* A title can be a long link, like an import's: it wraps. */}
        <h1 className="text-3xl font-semibold tracking-tight break-words md:text-4xl">
          {title}
        </h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div
          data-tour="page-actions"
          className="flex min-w-0 flex-wrap items-center gap-2"
        >
          {actions}
        </div>
      )}
    </div>
  )
}
