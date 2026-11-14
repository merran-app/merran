import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  Heading01Icon,
  MoreVerticalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import type { StepRow as Row } from "./step-rows"
import { useGrowWithText } from "./use-grow-with-text"

type Box = HTMLTextAreaElement | HTMLInputElement

/**
 * What a row can ask the list to do, by its key. The list keeps these the
 * same from render to render, so typing in one box redraws only that row.
 */
export type RowActions = {
  /** The box's new value, and where the cursor is in it. */
  type: (key: string, value: string, caret: number) => void
  /** Pasting; whether the list took care of it. */
  paste: (key: string, start: number, end: number, pasted: string) => boolean
  /** Backspace at the very start; whether the list took care of it. */
  backspaceAtStart: (key: string) => boolean
  move: (key: string, by: -1 | 1) => void
  addSectionAbove: (key: string) => void
  remove: (key: string) => void
  /** The row's box, so the cursor can be put in it after an edit. */
  register: (key: string, box: Box | null) => void
}

type StepRowProps = {
  row: Row
  /** A step's number, counted right through the sections. */
  number: number | undefined
  first: boolean
  last: boolean
  error: string | undefined
  placeholder: string | undefined
  actions: RowActions
}

/**
 * The form hands the rows back as copies after every change, so a row is
 * compared by what's in it. Otherwise each key typed would redraw every row,
 * which a long recipe can't keep up with.
 */
function sameProps(before: StepRowProps, after: StepRowProps) {
  return (
    before.row.key === after.row.key &&
    before.row.kind === after.row.kind &&
    before.row.text === after.row.text &&
    before.number === after.number &&
    before.first === after.first &&
    before.last === after.last &&
    before.error === after.error &&
    before.placeholder === after.placeholder &&
    before.actions === after.actions
  )
}

/** One step, numbered, or one section's heading, with its menu. */
export const StepRow = React.memo(function StepRow({
  row,
  number,
  first,
  last,
  error,
  placeholder,
  actions,
}: StepRowProps) {
  const { t } = useTranslation()
  const { key } = row
  const step = row.kind === "step"

  const [textarea, setTextarea] = React.useState<HTMLTextAreaElement | null>(
    null
  )
  useGrowWithText(textarea, row.text)

  const register = React.useCallback(
    (box: Box | null) => {
      actions.register(key, box)
      setTextarea(box instanceof HTMLTextAreaElement ? box : null)
    },
    [actions, key]
  )

  function handleChange(event: React.ChangeEvent<Box>) {
    const box = event.target
    actions.type(key, box.value, box.selectionStart ?? box.value.length)
  }

  function handlePaste(event: React.ClipboardEvent<Box>) {
    const box = event.currentTarget
    const pasted = event.clipboardData.getData("text/plain")
    const start = box.selectionStart ?? box.value.length
    const end = box.selectionEnd ?? start
    if (actions.paste(key, start, end, pasted)) event.preventDefault()
  }

  function handleKeyDown(event: React.KeyboardEvent<Box>) {
    // The Enter that finishes a word in an input method isn't a new step.
    // Safari has already ended the word when that Enter comes, so it says
    // so only with keyCode 229.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const box = event.currentTarget
    const start = box.selectionStart ?? 0
    const end = box.selectionEnd ?? start

    // A heading's field is one line, so Enter would submit the recipe.
    // Instead it starts a step under the heading, wherever the cursor is,
    // and leaves the heading as it is.
    if (!step && event.key === "Enter") {
      event.preventDefault()
      actions.type(key, `${box.value}\n`, box.value.length + 1)
      return
    }

    if (event.key === "Backspace" && start === 0 && end === 0) {
      if (actions.backspaceAtStart(key)) event.preventDefault()
    }
  }

  const boxProps = {
    ref: register,
    value: row.text,
    "aria-invalid": error ? true : undefined,
    onChange: handleChange,
    onPaste: handlePaste,
    onKeyDown: handleKeyDown,
  }

  return (
    <div className="flex items-start gap-3">
      {step && (
        <span
          aria-hidden
          className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
        >
          {number}
        </span>
      )}
      <Field data-invalid={error ? true : undefined} className="min-w-0 flex-1">
        {step ? (
          <Textarea
            {...boxProps}
            aria-label={t("recipes.editor.stepLabel", { number })}
            placeholder={placeholder}
            rows={1}
            className="min-h-11 py-2.5"
          />
        ) : (
          <Input
            {...boxProps}
            aria-label={t("recipes.editor.sectionName")}
            placeholder={t("recipes.editor.sectionName")}
            className="font-semibold"
          />
        )}
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 shrink-0"
              aria-label={
                step
                  ? t("recipes.editor.stepOptions", { number })
                  : t("recipes.editor.sectionOptions")
              }
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={first}
            onClick={() => actions.move(key, -1)}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
            {t("recipes.editor.moveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={last}
            onClick={() => actions.move(key, 1)}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            {t("recipes.editor.moveDown")}
          </DropdownMenuItem>
          {step && (
            <DropdownMenuItem onClick={() => actions.addSectionAbove(key)}>
              <HugeiconsIcon icon={Heading01Icon} strokeWidth={2} />
              {t("recipes.editor.addSectionAbove")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => actions.remove(key)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("recipes.editor.deleteRow")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}, sameProps)
