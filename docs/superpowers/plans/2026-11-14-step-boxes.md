# Step Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the recipe editor, edit steps in a box each, numbered, with sections as heading rows, instead of one big text box.

**Architecture:** The steps become a list of rows (`step` or `section`) in the form. Plain functions in `step-rows.ts` turn lines into rows and back and do every edit (split, join, paste, move, delete), so they're tested with `node --test` without a screen. The components only render rows and route keys, pastes and menu choices to those functions. Saving still sends lines, so nothing changes on the server.

**Tech Stack:** React 19, react-hook-form, Base UI through the app's shadcn/ui components, react-i18next, Hugeicons, `node:test`.

**Spec:** [docs/recipe-editor.md](../../recipe-editor.md)

## Global Constraints

- Web app only. No change to the API, its schemas, `openapi.json`, `schema.d.ts`, the database, the assistant, MCP or imports.
- Saving sends lines: a step's text, `# Name` for a section, a bare `#` for a section with no name.
- Ingredients stay one box.
- Every word people read goes in `apps/web/src/locales/en.json`; the boxes' hint is a new key, and `recipes.editor.stepsHint` keeps its meaning for text mode.
- Right-to-left: logical classes only (`ms-*`, `ps-*`, `text-start`, `border-s`), never `ml-*`, `pl-*`, `left-*` or `text-left`.
- Anything that opens a dialog on a computer opens a drawer on a phone. Menus (`DropdownMenu`) are fine on both.
- Code reads like the code around it: normal line breaks, named handlers, comments in plain English that say why. Run Prettier from the root (`pnpm format`), never inside an app.
- Pull request title: `feat: edit recipe steps in a box each`. Commit messages are plain English.
- Work on a branch `feat/step-boxes` from `main`, in its own worktree: the main checkout has unrelated uncommitted changes in `docs/`.

## Review Focus

- **Enter from a phone's on-screen keyboard** often sends no `keydown` "Enter". It still has to split the step, so line breaks are caught in `onChange`, not in a key handler. Checked in Task 2, Step 7.
- **Typing with an input method** (Japanese, Chinese): the Enter that commits a word must not split the step, and Backspace while composing must not join. Checked in Task 2, Step 7.
- **Enter in a section's field** must add a step, not submit the whole form. Checked in Task 2, Step 7.
- **A long recipe** (100 steps): typing in one box must not lag, so only the changed row re-renders. Checked in Task 2, Step 7.
- **A server error after empty steps:** `steps.12` must land on the 13th row, so `linesFromRows` keeps empty steps as `""` (the server drops them). Tested in Task 1.

---

### Task 1: Rows and the edits on them

**Files:**
- Create: `apps/web/src/features/recipes/steps-editor/step-rows.ts`
- Test: `apps/web/src/features/recipes/steps-editor/step-rows.test.ts`
- Modify: `apps/web/package.json` (the `test` script)

**Interfaces:**
- Produces, all from `step-rows.ts`, all pure (they never change what they're given):
  - `type StepRow = { key: string; kind: "step" | "section"; text: string }`
  - `type Focus = { key: string; caret: number }`
  - `type Change = { rows: StepRow[]; focus: Focus | null }`
  - `newRowKey(): string`: `row-1`, `row-2`... from a counter in the module. Not `crypto.randomUUID()`, which needs https, and many self-hosted servers are plain http on the home network.
  - `rowsFromLines(lines: readonly string[], makeKey: () => string, previous?: readonly StepRow[]): StepRow[]`
  - `linesFromRows(rows: readonly StepRow[]): string[]`
  - `textFromRows(rows: readonly StepRow[]): string`
  - `rowsFromText(text: string, previous: readonly StepRow[], makeKey: () => string): StepRow[]`
  - `setText(rows: readonly StepRow[], key: string, text: string): Change`
  - `splitAtLineBreaks(rows: readonly StepRow[], key: string, value: string, caret: number, makeKey: () => string): Change`
  - `pasteLines(rows: readonly StepRow[], key: string, start: number, end: number, pasted: string, makeKey: () => string): Change | null`
  - `joinWithPrevious(rows: readonly StepRow[], key: string): Change | null`
  - `moveRow(rows: readonly StepRow[], key: string, by: -1 | 1): StepRow[]`
  - `removeRow(rows: readonly StepRow[], key: string, makeKey: () => string): Change`
  - `insertSectionBefore(rows: readonly StepRow[], key: string, makeKey: () => string): Change`
  - `appendStep(rows: readonly StepRow[], makeKey: () => string): Change`
  - `appendSection(rows: readonly StepRow[], makeKey: () => string): Change`
  - `stepNumbers(rows: readonly StepRow[]): Map<string, number>`

- [ ] **Step 1: Set up the worktree**

Use superpowers:using-git-worktrees for a worktree on a new branch `feat/step-boxes` from `main`. Copy `docs/recipe-editor.md` and this plan from the main checkout into it, then commit them: `git add docs/recipe-editor.md docs/superpowers/plans/2026-11-14-step-boxes.md && git commit -m "Plan editing steps in a box each"`. Run `pnpm install` in the worktree.

- [ ] **Step 2: Write the failing tests**

`step-rows.test.ts`, in the style of `tidy/line-diff.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  appendSection,
  appendStep,
  insertSectionBefore,
  joinWithPrevious,
  linesFromRows,
  moveRow,
  pasteLines,
  removeRow,
  rowsFromLines,
  rowsFromText,
  setText,
  splitAtLineBreaks,
  stepNumbers,
  textFromRows,
  type StepRow,
} from "./step-rows.ts"

/**
 * Keys that are the same every run: k1, k2... for the rows a test starts
 * with, n1, n2... for the ones an edit adds, so they never clash.
 */
function counter(prefix = "k") {
  let next = 0
  return () => `${prefix}${++next}`
}

function rows(...lines: string[]) {
  return rowsFromLines(lines, counter())
}

test("rows and lines go both ways, with a bare # ending a section", () => {
  const lines = ["Heat the oven.", "# For the sauce", "Whisk.", "#", "Serve."]
  const result = rows(...lines)
  assert.deepEqual(
    result.map((row) => row.kind),
    ["step", "section", "step", "section", "step"]
  )
  assert.equal(result[1]?.text, "For the sauce")
  assert.equal(result[3]?.text, "")
  assert.deepEqual(linesFromRows(result), lines)
  assert.equal(rows("## For the sauce")[0]?.text, "For the sauce")
})

test("blank lines are skipped, and there's always a row to type in", () => {
  assert.deepEqual(linesFromRows(rows("", "  Stir.  ", " ")), ["Stir."])
  assert.deepEqual(rowsFromLines([], counter()), [
    { key: "k1", kind: "step", text: "" },
  ])
})

test("empty steps stay as empty lines, so a server error's index is the row's", () => {
  const list: StepRow[] = [
    { key: "a", kind: "step", text: "Stir." },
    { key: "b", kind: "step", text: "" },
    { key: "c", kind: "step", text: "Serve." },
  ]
  assert.deepEqual(linesFromRows(list), ["Stir.", "", "Serve."])
})

test("Enter splits a step at the cursor", () => {
  const start = rows("Heat the oven. Toss the vegetables.")
  const change = splitAtLineBreaks(
    start,
    "k1",
    "Heat the oven.\n Toss the vegetables.",
    15,
    counter("n")
  )
  assert.deepEqual(linesFromRows(change.rows), [
    "Heat the oven.",
    "Toss the vegetables.",
  ])
  assert.equal(change.rows[0]?.key, "k1")
  assert.deepEqual(change.focus, { key: change.rows[1]?.key, caret: 0 })
})

test("Enter at the end starts an empty step, and at the start puts one above", () => {
  const atEnd = splitAtLineBreaks(rows("Stir."), "k1", "Stir.\n", 6, counter("n"))
  assert.deepEqual(linesFromRows(atEnd.rows), ["Stir.", ""])
  assert.deepEqual(atEnd.focus, { key: atEnd.rows[1]?.key, caret: 0 })

  const atStart = splitAtLineBreaks(rows("Stir."), "k1", "\nStir.", 1, counter("n"))
  assert.deepEqual(linesFromRows(atStart.rows), ["", "Stir."])
  assert.deepEqual(atStart.focus, { key: atStart.rows[1]?.key, caret: 0 })
})

test("Enter in a section starts a step under it", () => {
  const change = splitAtLineBreaks(rows("# Sauce"), "k1", "Sauce\n", 6, counter("n"))
  assert.deepEqual(linesFromRows(change.rows), ["# Sauce", ""])
  assert.equal(change.rows[1]?.kind, "step")
  assert.deepEqual(change.focus, { key: change.rows[1]?.key, caret: 0 })
})

test("Backspace at the start joins a step to the one above", () => {
  const two = rows("Heat the oven.", "Toss.")
  const joined = joinWithPrevious(two, "k2")
  assert.deepEqual(linesFromRows(joined?.rows ?? []), ["Heat the oven. Toss."])
  assert.deepEqual(joined?.focus, { key: "k1", caret: 15 })

  const empty = joinWithPrevious(rows("Stir.", ""), "k2")
  assert.deepEqual(linesFromRows(empty?.rows ?? []), ["Stir."])
  assert.deepEqual(empty?.focus, { key: "k1", caret: 5 })

  const intoEmpty = joinWithPrevious(rows("", "Stir."), "k2")
  assert.deepEqual(linesFromRows(intoEmpty?.rows ?? []), ["Stir."])
  assert.deepEqual(intoEmpty?.focus, { key: "k1", caret: 0 })
})

test("Backspace leaves the first row and a heading alone, but removes an empty step", () => {
  assert.equal(joinWithPrevious(rows("Stir."), "k1"), null)
  assert.equal(joinWithPrevious(rows("# Sauce", "Whisk."), "k2"), null)
  const removed = joinWithPrevious(rows("# Sauce", ""), "k2")
  assert.deepEqual(linesFromRows(removed?.rows ?? []), ["# Sauce"])
  assert.deepEqual(removed?.focus, { key: "k1", caret: 5 })
})

test("pasting several lines makes a step of each, from the cursor on", () => {
  const change = pasteLines(
    rows("Preheat. Serve."),
    "k1",
    9,
    9,
    "Toss.\r\n\r\nBake.\n# Sauce\nWhisk. ",
    counter("n")
  )
  assert.deepEqual(linesFromRows(change?.rows ?? []), [
    "Preheat. Toss.",
    "Bake.",
    "# Sauce",
    "Whisk. Serve.",
  ])
  assert.equal(change?.rows[0]?.key, "k1")
  assert.deepEqual(change?.focus, { key: change?.rows[3]?.key, caret: 7 })

  const replacing = pasteLines(rows("abcdef"), "k1", 2, 4, "X\nY", counter("n"))
  assert.deepEqual(linesFromRows(replacing?.rows ?? []), ["abX", "Yef"])
  assert.deepEqual(replacing?.focus, { key: replacing?.rows[1]?.key, caret: 1 })

  assert.equal(pasteLines(rows("Stir."), "k1", 5, 5, " well", counter("n")), null)
})

test("pasting into a section keeps its first line a heading", () => {
  const change = pasteLines(rows("# Sauce"), "k1", 5, 5, "\nWhisk.\nPour.", counter("n"))
  assert.deepEqual(linesFromRows(change?.rows ?? []), ["# Sauce", "Whisk.", "Pour."])
})

test("a step typed with a leading # becomes a section", () => {
  const change = setText(rows("Stir."), "k1", "# For the sauce")
  assert.deepEqual(change.rows, [{ key: "k1", kind: "section", text: "For the sauce" }])
  assert.deepEqual(change.focus, { key: "k1", caret: 13 })
  assert.equal(setText(rows("Stir."), "k1", "Stir well.").focus, null)
})

test("moving swaps with the neighbour, and does nothing at the ends", () => {
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k2", -1)), ["b", "a", "c"])
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k1", -1)), ["a", "b", "c"])
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k3", 1)), ["a", "b", "c"])
})

test("deleting a heading puts its steps in the section above", () => {
  const change = removeRow(rows("# One", "a", "# Two", "b"), "k3", counter("n"))
  assert.deepEqual(linesFromRows(change.rows), ["# One", "a", "b"])
  assert.deepEqual(change.focus, { key: "k2", caret: 1 })

  const first = removeRow(rows("a", "b"), "k1", counter("n"))
  assert.deepEqual(first.focus, { key: "k2", caret: 0 })

  const last = removeRow(rows("a"), "k1", counter("n"))
  assert.deepEqual(linesFromRows(last.rows), [""])
  assert.deepEqual(last.focus, { key: last.rows[0]?.key, caret: 0 })
})

test("adding a step or a section puts the cursor in it", () => {
  const step = appendStep(rows("a"), counter("n"))
  assert.deepEqual(linesFromRows(step.rows), ["a", ""])
  assert.deepEqual(step.focus, { key: step.rows[1]?.key, caret: 0 })

  const section = appendSection(rows("a"), counter("n"))
  assert.deepEqual(linesFromRows(section.rows), ["a", "#"])
  assert.deepEqual(section.focus, { key: section.rows[1]?.key, caret: 0 })

  const above = insertSectionBefore(rows("a", "b"), "k2", counter("n"))
  assert.deepEqual(linesFromRows(above.rows), ["a", "#", "b"])
  assert.deepEqual(above.focus, { key: above.rows[1]?.key, caret: 0 })
})

test("steps are numbered right through the sections", () => {
  const numbers = stepNumbers(rows("a", "# S", "b", "c"))
  assert.deepEqual([...numbers], [
    ["k1", 1],
    ["k3", 2],
    ["k4", 3],
  ])
})

test("text and back keeps the keys, so nothing looks changed", () => {
  const start = rows("a", "# S", "b")
  const text = textFromRows(start)
  assert.equal(text, "a\n# S\nb")
  assert.deepEqual(rowsFromText(text, start, counter("n")), start)
  const withEmpty: StepRow[] = [
    { key: "a", kind: "step", text: "Stir." },
    { key: "b", kind: "step", text: "" },
  ]
  assert.equal(textFromRows(withEmpty), "Stir.")
})
```

- [ ] **Step 3: Add the test file to the web app's `test` script and run it to see it fail**

Append `src/features/recipes/steps-editor/step-rows.test.ts` to the `node --test` list in `apps/web/package.json`.

Run: `pnpm --filter @merran/web test`
Expected: FAIL, `Cannot find module` for `./step-rows.ts`.

- [ ] **Step 4: Implement `step-rows.ts`**

No imports (the file runs under `node --test`, which knows neither `@/` nor `@merran/shared`). The rules the tests don't spell out:

- A line or a step's text starting with `#` is a section: its text is the rest with every leading `#` and the spaces after them taken off. The server also drops a trailing `:` from a section; leave that to it.
- `rowsFromLines` trims each line, skips blank ones, and gives the n-th row `previous[n]?.key` when there is one, so going to text and back keeps the keys and react-hook-form doesn't count it as a change. It never returns an empty list: no rows gives one empty step.
- `linesFromRows` gives exactly one line per row: a step's text, `# Name`, or `#` for a section with no name.
- `textFromRows` is `linesFromRows` of the rows without empty steps, joined with `\n`. `rowsFromText` splits on `\r?\n` and calls `rowsFromLines` with `previous`.
- `splitAtLineBreaks` is what a line break typed into a box does (Enter on any keyboard). It replaces the row with one row for every line of `value`, blank lines included, each trimmed. The first keeps the row's key and kind; the rest are steps unless they start with `#`. The focus goes to the line the caret is on, at its offset in that line less the spaces trimmed off its start, never below 0.
- `pasteLines` returns `null` when `pasted` has no line break, so the browser pastes as usual. Otherwise it takes the row's text before `start`, then `pasted`, splits that into lines, and puts the row's text after `end` on the end of the last line. In a section, the first line gets `# ` in front. Blank lines are dropped (pasted steps are often a blank line apart). The first row keeps the row's key. Focus: the last row, at its length less the trimmed text that came after `end`, never below 0. If nothing but blank lines is left, the row becomes an empty step with its key.
- `joinWithPrevious` only joins a step into a step: a space between them when both have text, the cursor where the second one starts. Under a heading it removes an empty step and puts the cursor at the end of the heading; otherwise it returns `null`, and so does the first row.
- `removeRow` puts the cursor at the end of the row before it, or at the start of the next one when it was first. With nothing left, it adds one empty step.
- `setText` sets a row's text. A step whose new text starts with `#` becomes a section; only then is there a focus, at the end of its text, because the box becomes a different field.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm --filter @merran/web test`
Expected: PASS, every test, including the ones that were there.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/recipes/steps-editor apps/web/package.json
git commit -m "Add the rows behind editing steps in a box each, with their edits tested"
```

---

### Task 2: The boxes in the editor, and everything that describes them

**Files:**
- Create: `apps/web/src/features/recipes/steps-editor/use-steps-as-text.ts`
- Create: `apps/web/src/features/recipes/steps-editor/step-row.tsx`
- Create: `apps/web/src/features/recipes/steps-editor/steps-editor.tsx`
- Modify: `apps/web/src/features/recipes/recipe-editor.tsx` (the `Form` type, `startingValues`, `toInput`, the error mapping in `onSubmit`, the Steps card)
- Modify: `apps/web/src/locales/en.json` (`recipes.editor`)
- Modify: `docs/features.md`, `docs/README.md`, `docs/recipe-editor.md`, `apps/docs/src/content/docs/docs/use/recipes.md`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `useStepsAsText(): readonly [boolean, (next: boolean) => void]`, remembered on the device under the `localStorage` key `merran-steps-as-text`, in the shape of `use-unit-system.ts` (reads and writes in `try`, defaults to `false`).
  - `type StepErrors = { list?: string; rows: readonly (string | undefined)[] }`
  - `StepsEditor({ value, onChange, errors }: { value: StepRow[]; onChange: (rows: StepRow[]) => void; errors: StepErrors }): JSX.Element`, which renders the whole Steps card.

- [ ] **Step 1: Add the words**

In `en.json`, under `recipes.editor`, exactly:

```json
"stepsBoxesHint": "Enter starts the next step. Paste several lines to add a step for each.",
"editAsText": "Edit as text",
"stepLabel": "Step {{number}}",
"stepPlaceholder": "Heat the oven to 400°F.",
"stepOptions": "Options for step {{number}}",
"sectionName": "Section name",
"sectionOptions": "Options for this section",
"moveUp": "Move up",
"moveDown": "Move down",
"addSectionAbove": "Add a section above",
"deleteRow": "Delete",
"addStep": "Add step",
"addSection": "Add section"
```

`stepsHint` and `stepsPlaceholder` stay, for text mode.

- [ ] **Step 2: Write `use-steps-as-text.ts`** to the interface above.

- [ ] **Step 3: Write `step-row.tsx`: one row**

Wrapped in `React.memo`, with handlers the parent keeps stable (by row key), so typing in one box re-renders only that row.

- **A step:** its number in a small circle on the start side (`aria-hidden`, styled like `StepList`'s but `size-7`), then a `Textarea` labelled `stepLabel` (`aria-label`), `rows={1}`, with a smaller minimum height than the default `min-h-16` so a short step is one line high. The first step shows `stepPlaceholder` while empty.
  - `onChange`: when the value has a line break, `splitAtLineBreaks(value, event.target.selectionStart)`; otherwise `setText`.
  - `onPaste`: read `text/plain`; if `pasteLines(selectionStart, selectionEnd, …)` isn't `null`, `preventDefault()` and apply it.
  - `onKeyDown`: Backspace with the selection at 0 to 0, and not `event.nativeEvent.isComposing`: if `joinWithPrevious` isn't `null`, `preventDefault()` and apply it. Phones' keyboards may not send this key; the menu's Delete always works.
- **A section:** an `Input` labelled and with the placeholder `sectionName`, in `font-semibold`, no number. Enter, when not composing, calls `preventDefault()` (otherwise it submits the form) and then `splitAtLineBreaks` with a `\n` put in at the caret. Paste is as for a step. Change calls `setText`.
- **Its error** under the box with `FieldError`, the box `aria-invalid`.
- **The ⋮ menu** at the end of the row: `DropdownMenu`, its trigger a ghost icon `Button` with `MoreVerticalIcon` (Hugeicons), labelled `stepOptions` or `sectionOptions`, content `align="end"`. Items: `moveUp` (disabled on the first row), `moveDown` (disabled on the last), `addSectionAbove` (steps only), `deleteRow`. No confirmation.

- [ ] **Step 4: Write `steps-editor.tsx`: the card**

- `Card` with `CardTitle` `recipes.fields.steps`, `CardDescription` `stepsBoxesHint` (or `stepsHint` in text mode), and in `CardAction` a `Switch` labelled `editAsText`, from `useStepsAsText`.
- **Boxes:** the rows, each with its number from `stepNumbers`, then `addStep` and `addSection` as outline buttons with `PlusSignIcon`. `errors.list` shows under the list.
- **Text:** a `TextareaField` (label `recipes.fields.steps`, `hideLabel`, `min-h-48`, placeholder `stepsPlaceholder`) holding the text in local state. It starts from `textFromRows(value)` whenever text mode is turned on, including on a device that remembers it, and each change calls `onChange(rowsFromText(text, value, newRowKey))`. Its error is `errors.list` or else the first row error.
- **Applying a `Change`:** call `onChange(change.rows)` and keep `change.focus` in a ref. A `useLayoutEffect` on `value` then finds that row's field (a `Map` of refs by key), calls `focus({ preventScroll: true })`, `setSelectionRange(caret, caret)` and `scrollIntoView({ block: "nearest" })`, so the page doesn't jump while a phone's keyboard is open. Moving gives no focus: the row's DOM moves with its key, and Base UI hands focus back to the menu's trigger.

- [ ] **Step 5: Wire it into `recipe-editor.tsx`**

- `Form.steps` becomes `StepRow[]`; `startingValues` gives `rowsFromLines(recipe ? joinSections(recipe.steps) : [], newRowKey)`; `toInput` sends `linesFromRows(form.steps)`.
- The Steps card becomes `<Controller name="steps" …>` rendering `StepsEditor`. Its `onChange` calls `form.clearErrors("steps")` and then `field.onChange(rows)`. Its `errors` are `{ list: errors.steps?.message, rows: field.value.map((_, index) => errors.steps?.[index]?.text?.message) }`.
- In `onSubmit`'s error loop: `steps` becomes `form.setError("steps", { message })`, `steps.N` becomes `form.setError(\`steps.${N}.text\`, { message })`, and every other field stays as it is.
- "Leave without saving" needs nothing new: `isDirty` compares the rows.

- [ ] **Step 6: Run the checks**

Run: `pnpm typecheck`, `pnpm format` then `pnpm format:check`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales`
Expected: all pass, with no new type errors and no formatting changes left.

- [ ] **Step 7: Check it in the browser**

Run the worktree's own dev server (a configuration in its `.claude/launch.json` on free ports; the main checkout's servers run other code), sign in with the test admin account, and open a recipe with sections and a long step under Edit. Check, at desktop width and at the `mobile` preset:

1. The steps show numbered right through the sections, and long steps wrap inside their own box.
2. Typing a new recipe: type, Enter, type, without the mouse. Enter in the middle splits; Backspace at the start joins, with a space.
3. Pasting four lines with a blank line and a `# Sauce` line between makes three steps and a section.
4. Enter in a section's field adds a step under it and doesn't save the recipe.
5. Typing `#` at the start of a step turns it into a section, with the cursor still in it.
6. Move up, Move down, Add a section above and Delete each do what they say; deleting a heading moves its steps to the section above.
7. Edit as text shows the same lines; editing there and switching back shows the edit; reloading keeps the mode.
8. Opening the editor and switching to text and back without editing, then Cancel, leaves without asking.
9. Saving gives the same steps on the recipe page. A step over 5,000 characters shows "Keep each step under 5,000 characters." under that step's box.
10. At the `mobile` preset, Enter typed into a box (with `computer` type `"\n"`) splits it, and the page doesn't jump.
11. In a recipe of 100 steps (paste them in text mode), typing in one box keeps up.
12. With the document's `dir` set to `rtl` (javascript_tool, for the check only), numbers and menus sit on the right.

Fix what doesn't hold, re-run Step 6, and take a screenshot of the boxes for the pull request.

- [ ] **Step 8: Update the docs**

- `docs/features.md`, under Recipes: a row `| Steps edited in a box each, or as text | Detail | Built | Enter starts the next step and Backspace joins; pasting lines adds a step for each; sections as heading rows; a menu to move, add a section or delete; Edit as text, remembered on the device; [plan](recipe-editor.md) (November 14, 2026) |`.
- `docs/README.md`: a row for `[recipe-editor.md](recipe-editor.md)` in The docs table: "Editing steps in a box each: Enter, Backspace, pasting, sections, and Edit as text (November 14, 2026)".
- `docs/recipe-editor.md`: its first line becomes "Decided with the user, November 14, 2026, and built on <the day it's built>."
- `apps/docs/src/content/docs/docs/use/recipes.md`: in "Type one in", step 3 says to enter one ingredient per line (a line starting with `#` for a section), and to type each step in its own box: **Enter** starts the next one, pasting several lines adds a step for each, and **Add section** adds a heading such as "For the sauce". In "Edit and organize", say what the ⋮ menu on a step offers (**Move up**, **Move down**, **Add a section above**, **Delete**) and that **Edit as text** shows the steps one per line, as before. Quote the labels exactly as in Step 1, and mark nothing as not released.

- [ ] **Step 9: Build the site**

Run: `pnpm docs:build`
Expected: it builds, with every link checked.

- [ ] **Step 10: Commit**

```bash
git add apps/web docs apps/docs
git commit -m "Edit recipe steps in a box each, with sections as headings and Edit as text"
```
