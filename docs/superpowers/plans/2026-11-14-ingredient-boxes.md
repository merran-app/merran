# Ingredient Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit a recipe's ingredients in a box each, the way steps already are, with the same editor.

**Architecture:** The steps editor (`apps/web/src/features/recipes/steps-editor/`) becomes a lines editor that both cards use: first a rename with no change in behavior, then a `list` prop (`"steps"` or `"ingredients"`) that picks the words, the number or dot, and the remembered Edit as text setting. Ingredients are lines with `#` sections, like steps, so the row functions and their tests carry over unchanged.

**Tech Stack:** React 19, react-hook-form, Base UI through the app's shadcn/ui components, react-i18next, `node:test`.

**Spec:** [docs/recipe-editor.md](../../recipe-editor.md), its Ingredients section. The steps were built from [2026-11-14-step-boxes.md](2026-11-14-step-boxes.md), on this same branch.

## Global Constraints

- Web app only: no change to the API, schemas, `openapi.json`, the database or how lines are parsed. Saving sends lines, `# Name` for a section.
- Ingredients: a small dot where a step has its number; screen readers hear "Ingredient 3"; each card remembers its own Edit as text.
- Words in `apps/web/src/locales/en.json`; `recipes.editor.ingredientsHint` and `ingredientsPlaceholder` keep their meaning, for text mode.
- Logical classes only (`ms-*`, `ps-*`, `start-*`), menus not dialogs, Prettier from the root (`pnpm format`).
- Work on `feat/step-boxes` in its worktree (`.claude/worktrees/step-boxes`); the PR isn't open yet. Commit messages are plain English.

## Review Focus

- **A server error on an ingredient** ("Keep each line under 500 characters.") must show under that ingredient's box, with headings counted in the index. Checked in Task 2, Step 6.
- **A tidied recipe keeps its marks** (needed, swappable, optional) and the foods Tidy up chose, on lines that weren't changed, after a save from the boxes. The server keeps them by matching a line's text, so unchanged lines must go back exactly as loaded: the round-trip test "rows and lines go both ways" in `line-rows.test.ts` pins that, and Task 2, Step 6 compares the lines sent with the lines loaded.
- **The two cards' Edit as text are independent:** switching one leaves the other, and each is remembered after a reload. Checked in Task 2, Step 6.
- **Enter from a phone's keyboard in an ingredient** adds an ingredient below it, and pasting a list makes one of each. Checked in Task 2, Step 6.
- **Typing in a long ingredient list** (60 lines) keeps up: one row redraws per key. Checked in Task 2, Step 6.

---

### Task 1: The steps editor becomes a lines editor

A rename only: what the person sees doesn't change.

**Files:**
- Move: `apps/web/src/features/recipes/steps-editor/` to `apps/web/src/features/recipes/lines-editor/`, with `step-rows.ts` → `line-rows.ts`, `step-rows.test.ts` → `line-rows.test.ts`, `step-row.tsx` → `line-row.tsx`, `steps-editor.tsx` → `lines-editor.tsx`. `use-steps-as-text.ts` and `use-grow-with-text.ts` keep their names for now.
- Modify: `apps/web/src/features/recipes/recipe-editor.tsx` (imports), `apps/web/package.json` (the test's path)

**Interfaces:**
- Produces, renamed from what's there:
  - `type LineRow = { key: string; kind: "line" | "section"; text: string }` (was `StepRow`, kind `"step"`)
  - `lineNumbers(rows: readonly LineRow[]): Map<string, number>` (was `stepNumbers`)
  - The component `LineRow` (was `StepRow`), its props type `LineRowProps`, and `LinesEditor` (was `StepsEditor`). `StepErrors` becomes `LineErrors`.
  - Every other function in `line-rows.ts` keeps its name and signature, with `LineRow` for `StepRow`.

- [ ] **Step 1: Move the files** with `git mv`, so the history follows them.

- [ ] **Step 2: Rename the identifiers** listed above everywhere they're used, the kind `"step"` included (in the tests' expected rows too), and the comments that say "step" where they now mean any line. Comments about what Enter, Backspace and pasting do keep their examples.

- [ ] **Step 3: Run the checks**

Run: `pnpm --filter @merran/web test`, `pnpm --filter @merran/web typecheck`, `pnpm format:check`
Expected: 154 tests pass, no type errors, nothing to format.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "Make the steps editor a lines editor, ready for ingredients"
```

---

### Task 2: Ingredients in a box each

**Files:**
- Modify: `lines-editor/line-row.tsx`, `lines-editor/lines-editor.tsx`, `lines-editor/use-steps-as-text.ts` (→ `use-as-text.ts`)
- Modify: `apps/web/src/features/recipes/recipe-editor.tsx`, `apps/web/src/locales/en.json`
- Modify: `docs/features.md`, `docs/README.md`, `apps/docs/src/content/docs/docs/use/recipes.md`, and any other guide that says ingredients go one per line

**Interfaces:**
- Consumes: Task 1's names.
- Produces:
  - `type LineList = "steps" | "ingredients"`
  - `useAsText(list: LineList): readonly [boolean, (next: boolean) => void]`, under the `localStorage` keys `merran-steps-as-text` and `merran-ingredients-as-text`
  - `LinesEditor({ list, value, onChange, errors }: { list: LineList; value: LineRow[]; onChange: (rows: LineRow[]) => void; errors: LineErrors })`
  - `LineRow` takes `list: LineList` in place of anything list-specific, a string so the memo's comparison (`sameProps`) still holds; add it there.

- [ ] **Step 1: Add the words** under `recipes.editor` in `en.json`, exactly:

```json
"ingredientsBoxesHint": "Enter starts the next ingredient. Paste several lines to add one for each.",
"ingredientLabel": "Ingredient {{number}}",
"ingredientPlaceholder": "2 cups flour",
"ingredientOptions": "Options for ingredient {{number}}",
"addIngredient": "Add ingredient"
```

- [ ] **Step 2: Give the editor its `list`**

- `use-as-text.ts`: `useAsText(list)`, each list under its own key. Rename the file with `git mv`.
- `LinesEditor` picks by `list`: the title (`recipes.fields.steps` or `recipes.fields.ingredients`), the boxes' hint (`stepsBoxesHint` or `ingredientsBoxesHint`), the text mode's hint and placeholder (`stepsHint`/`stepsPlaceholder` or `ingredientsHint`/`ingredientsPlaceholder`), the first row's placeholder (`stepPlaceholder` or `ingredientPlaceholder`) and the add button (`addStep` or `addIngredient`). **Add section** is the same for both.
- `LineRow` picks by `list`: for steps, the number in its circle as now; for ingredients, a small dot (`size-1.5 rounded-full bg-muted-foreground`) centred in a column the circle's width, so the boxes line up the same way. The box's label (`stepLabel` or `ingredientLabel`) and the menu's (`stepOptions` or `ingredientOptions`) both take the row's number from `lineNumbers`.

- [ ] **Step 3: Wire ingredients into `recipe-editor.tsx`**

- `Form.ingredients` becomes `LineRow[]`, from `rowsFromLines(recipe ? joinSections(recipe.ingredients) : [], newRowKey)`, sent as `linesFromRows(form.ingredients)`.
- The Ingredients card becomes a `Controller` rendering `<LinesEditor list="ingredients" …>`, like the steps' one, clearing `ingredients` errors only when there are some.
- In `onSubmit`, `ingredients.N` goes to `ingredients.${N}.text` the way `steps.N` does, and a bare `ingredients` to `ingredients`. One branch for both lists, by name.

- [ ] **Step 4: Run the checks**

Run: `pnpm --filter @merran/web typecheck`, `pnpm format` then `pnpm format:check`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales`
Expected: all pass, 154 tests.

- [ ] **Step 5: Look at it** on the throwaway pair described in Step 6: open the recipe under Edit and take a screenshot of the Ingredients card, at desktop width and at the `mobile` preset. (The user's test server at http://pr.localhost:5191 runs the same worktree, so it picks the change up by itself.)

- [ ] **Step 6: Check the Review Focus in the browser**, on a throwaway pair like the step-boxes checks used: the worktree's API with an empty data folder in the scratchpad and its Vite on free ports, claimed from the page with a password the page makes, a recipe with ingredient sections added by `POST /api/recipes`. Never the copy of the user's data, which only they sign in to.

1. An ingredient over 500 characters, below a heading, shows "Keep each line under 500 characters." under its own box after Save.
2. Watching the `PUT /api/recipes/{recipe}` request (read_network_requests), a save that changes one ingredient sends every other line exactly as `GET` returned it (`joinSections` of its ingredients).
3. Switching Ingredients to text leaves Steps in boxes; after a reload each is as it was left.
4. At the `mobile` preset, a `"\n"` typed into an ingredient adds one below with the cursor in it; pasting four lines with a blank one and `# For the glaze` makes three ingredients and a heading.
5. In 60 ingredient lines (pasted in text mode), one key redraws one row: count `LineRow` renders as in the step-boxes check, then take the counter out.

- [ ] **Step 7: Update the docs**

- `docs/features.md`: the row becomes `| Steps and ingredients edited in a box each, or as text | Detail | Built | …`, its notes saying ingredients get a dot for a number and each card remembers Edit as text.
- `docs/README.md`: the row for `recipe-editor.md` says "Editing steps and ingredients in a box each: …".
- `apps/docs/src/content/docs/docs/use/recipes.md`: "Type one in" step 3 says to type each ingredient and each step in its own box, with **Enter**, pasting and **Add section** as for steps; "Edit and organize" says the ⋮ menu and **Edit as text** are on both cards, each remembered on its own. Search the guides for "per line" and fix any other that says ingredients go one per line.

- [ ] **Step 8: Build the site**

Run: `pnpm docs:build`
Expected: it builds, with every link checked.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web docs apps/docs
git commit -m "Edit ingredients in a box each, with the same editor as the steps"
```
