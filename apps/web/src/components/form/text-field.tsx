import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** A labelled input, with a hint or its error underneath. */
export function TextField({
  label,
  description,
  error,
  id,
  className,
  endAction,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string
  description?: React.ReactNode
  error?: string
  endAction?: React.ReactNode
}) {
  const fallbackId = React.useId()
  const inputId = id ?? fallbackId
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error || description ? `${inputId}-hint` : undefined
          }
          {...props}
          className={cn(endAction && "pr-18", className)}
        />
        {endAction && (
          <div className="absolute inset-y-0 right-1 flex items-center">
            {endAction}
          </div>
        )}
      </div>
      {error ? (
        <FieldError id={`${inputId}-hint`}>{error}</FieldError>
      ) : (
        description && (
          <FieldDescription id={`${inputId}-hint`}>
            {description}
          </FieldDescription>
        )
      )}
    </Field>
  )
}
