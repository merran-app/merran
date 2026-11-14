import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { TextareaField } from "@/components/form/textarea-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"

import { LineRow, type RowActions } from "./line-row"
import {
  appendLine,
  appendSection,
  backspaceAtStart,
  insertSectionBefore,
  lineNumbers,
  moveRow,
  newRowKey,
  pasteLines,
  removeRow,
  rowsFromText,
  setText,
  splitAtLineBreaks,
  textFromRows,
  type Change,
  type Focus,
  type LineList,
  type LineRow as Row,
} from "./line-rows"
import { useAsText } from "./use-as-text"

/** What the server said was wrong: with the whole list, or a row by its index. */
export type LineErrors = {
  list?: string
  rows: readonly (string | undefined)[]
}

type Box = HTMLTextAreaElement | HTMLInputElement

/** The words each list's card uses. */
const WORDS = {
  steps: {
    title: "recipes.fields.steps",
    boxesHint: "recipes.editor.stepsBoxesHint",
    textHint: "recipes.editor.stepsHint",
    textPlaceholder: "recipes.editor.stepsPlaceholder",
    firstPlaceholder: "recipes.editor.stepPlaceholder",
    add: "recipes.editor.addStep",
  },
  ingredients: {
    title: "recipes.fields.ingredients",
    boxesHint: "recipes.editor.ingredientsBoxesHint",
    textHint: "recipes.editor.ingredientsHint",
    textPlaceholder: "recipes.editor.ingredientsPlaceholder",
    firstPlaceholder: "recipes.editor.ingredientPlaceholder",
    add: "recipes.editor.addIngredient",
  },
} as const

/**
 * A recipe's steps or ingredients, in a box each with sections as headings,
 * or as text, one per line, for whoever prefers that or is pasting a lot.
 */
export function LinesEditor({
  list,
  value,
  onChange,
  errors,
}: {
  list: LineList
  value: Row[]
  onChange: (rows: Row[]) => void
  errors: LineErrors
}) {
  const { t } = useTranslation()
  const words = WORDS[list]
  const [asText, setAsText] = useAsText(list)
  const [draft, setDraft] = React.useState(() =>
    asText ? textFromRows(value) : ""
  )

  // The rows' actions stay the same from render to render, so they read the
  // newest rows from here rather than from when they were made.
  const latest = React.useRef({ value, onChange })
  React.useLayoutEffect(() => {
    latest.current = { value, onChange }
  })

  const boxes = React.useRef(new Map<string, Box>())
  const focusAfter = React.useRef<Focus | null>(null)

  const actions = React.useMemo<
    RowActions & {
      addLine: () => void
      addSection: () => void
    }
  >(() => {
    function rows() {
      return latest.current.value
    }

    function apply(change: Change) {
      focusAfter.current = change.focus
      latest.current.onChange(change.rows)
    }

    return {
      type(key, text, caret) {
        apply(
          text.includes("\n")
            ? splitAtLineBreaks(rows(), key, text, caret, newRowKey)
            : setText(rows(), key, text)
        )
      },
      paste(key, start, end, pasted) {
        const change = pasteLines(rows(), key, start, end, pasted, newRowKey)
        if (!change) return false
        apply(change)
        return true
      },
      backspaceAtStart(key) {
        const change = backspaceAtStart(rows(), key)
        if (!change) return false
        apply(change)
        return true
      },
      move(key, by) {
        latest.current.onChange(moveRow(rows(), key, by))
      },
      addSectionAbove(key) {
        apply(insertSectionBefore(rows(), key, newRowKey))
      },
      remove(key) {
        apply(removeRow(rows(), key, newRowKey))
      },
      register(key, box) {
        if (box) boxes.current.set(key, box)
        else boxes.current.delete(key)
      },
      addLine() {
        apply(appendLine(rows(), newRowKey))
      },
      addSection() {
        apply(appendSection(rows(), newRowKey))
      },
    }
  }, [])

  // After an edit, the cursor goes where the edit says, in what may be a new
  // box. Scrolling only as far as it takes keeps the page from jumping while
  // a phone's keyboard is open.
  React.useLayoutEffect(() => {
    const focus = focusAfter.current
    if (!focus) return
    focusAfter.current = null
    const box = boxes.current.get(focus.key)
    if (!box) return
    box.focus({ preventScroll: true })
    box.setSelectionRange(focus.caret, focus.caret)
    box.scrollIntoView({ block: "nearest" })
  }, [value])

  function switchToText(next: boolean) {
    if (next) setDraft(textFromRows(value))
    setAsText(next)
  }

  function changeDraft(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value)
    onChange(rowsFromText(event.target.value, value, newRowKey))
  }

  const numbers = lineNumbers(value)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(words.title)}</CardTitle>
        <CardDescription>
          {asText ? t(words.textHint) : t(words.boxesHint)}
        </CardDescription>
        <CardAction>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={asText} onCheckedChange={switchToText} />
            {t("recipes.editor.editAsText")}
          </label>
        </CardAction>
      </CardHeader>
      <CardContent>
        {asText ? (
          <TextareaField
            label={t(words.title)}
            hideLabel
            className="min-h-48"
            placeholder={t(words.textPlaceholder)}
            error={errors.list ?? errors.rows.find(Boolean)}
            value={draft}
            onChange={changeDraft}
          />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3">
              {value.map((row, index) => (
                <LineRow
                  key={row.key}
                  list={list}
                  row={row}
                  number={numbers.get(row.key)}
                  first={index === 0}
                  last={index === value.length - 1}
                  error={errors.rows[index]}
                  placeholder={
                    index === 0 && row.kind === "line"
                      ? t(words.firstPlaceholder)
                      : undefined
                  }
                  actions={actions}
                />
              ))}
            </div>
            {errors.list && <FieldError>{errors.list}</FieldError>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={actions.addLine}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                {t(words.add)}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={actions.addSection}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                {t("recipes.editor.addSection")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
