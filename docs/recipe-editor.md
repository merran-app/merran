# Editing steps and ingredients

Decided with the user, November 14, 2026, and built the same day: steps first, then ingredients the same way.

## Why

Steps are typed one per line in one big box. Long steps wrap, so in the box it's hard to tell where one step ends and the next begins, and easy to mistype or change the wrong one. Lines suit agents, which write recipes through the API; people need to see steps as steps.

## What changes

In the recipe editor (`apps/web/src/features/recipes/recipe-editor.tsx`), the Steps card becomes a box for each step, numbered right through the sections the way the recipe page numbers them.

```
Steps                                  Edit as text
 1  [ Heat the oven to 400°F.                  ]  ⋮
 2  [ Toss the vegetables with the oil and     ]  ⋮
    [ salt, then spread them on a sheet pan.   ]
 ── For the sauce ──────────────────────────────  ⋮
 3  [ Whisk the cream and mustard together.    ]  ⋮
    + Add step    + Add section
```

- **Each step has its own box,** which grows with its text (the app's `Textarea` already does, through `field-sizing`; in a browser without it, the box is sized to its text by script). Screen readers hear it as "Step 3".
- **Enter splits the step at the cursor:** what's after the cursor becomes a new step below, and the cursor goes with it. At the end of a step that's just a new, empty step, so typing a recipe stays type, Enter, type.
- **Backspace at the very start of a step joins it to the one above,** with a space between and the cursor at the join. In an empty step, that removes it.
- **Pasting several lines into a step makes a step of each,** from the cursor on, and a line starting with `#` becomes a section, as in the box today. Pasting one line works as usual.
- **A section is a heading row** between steps, with its own field ("Section name"). The steps under it are in that section until the next heading. A heading with no name ends the section, which is a bare `#` line, as today. Typing `#` at the start of a step turns it into a heading, because a line starting with `#` is saved as a section anyway, and Backspace at the start of a heading turns it back into a step. Enter in a heading starts a step under it, wherever the cursor is, and leaves the heading as it is.
- **The ⋮ menu** on a step has Move up, Move down, Add a section above and Delete. On a heading it has Move up, Move down and Delete; deleting a heading puts its steps in the section above. Focus stays on what moved. Deleting asks nothing: Cancel and "Leave without saving" already guard the whole edit, and each save keeps a version.
- **Add step and Add section** sit under the list.
- **Empty steps are left out** when saving, as blank lines are now.
- **Edit as text** switches the card to today's box, with the same lines, and back. Nothing can be lost either way, because both are the same lines. The device remembers which you used last.
- **Errors land on the step:** the server names the line (`steps.12`), so the editor shows its message under that step's box.

## Ingredients

Ingredients are saved the same way as steps: one line each, with `# Name` lines for sections, and the server names a line's problem the same way (`ingredients.12`). So one editor serves both cards, and the Ingredients card gets everything above: a box each, Enter, Backspace, pasting, `#` for a heading, heading rows, the ⋮ menu, **Add ingredient** and **Add section**, **Edit as text**, and errors under their line.

```
Ingredients                            Edit as text
 •  [ 2 cups flour                             ]  ⋮
 •  [ 1 tsp salt                               ]  ⋮
 ── For the glaze ──────────────────────────────  ⋮
 •  [ 1 cup powdered sugar                     ]  ⋮
    + Add ingredient    + Add section
```

Where they differ:

- **No numbers:** a small dot instead, since "3" beside "2 cups flour" would read as an amount.
- **A box starts one line high,** as most lines are short, and grows only when a line wraps.
- **Each card remembers its own Edit as text,** since someone may paste ingredient lists as text but type steps in boxes.
- **Their own words:** screen readers hear "Ingredient 3", and the hint says "Enter starts the next ingredient. Paste several lines to add one for each."
- **The limits stay the server's:** 300 lines, 500 characters each.

Saving still sends lines, so how Merran reads each line, the marks Tidy up gives them, the list and nutrition are as before.

Not this round: showing in each box what Merran reads from the line (amount, unit, food), which would catch a typo before saving. It's a feature of its own.

## What stays the same

- **Saving.** The editor still sends lines, with a `#` line for each section, to `POST /api/recipes` and `PUT /api/recipes/{recipe}`. Nothing changes in the API, the schema, the assistant, MCP or imports, and agents keep writing lines.
- **A step is one paragraph.** In the API a line is a step, so there are no paragraph breaks inside one.

## Not this round

- Dragging steps to reorder. Move up and Move down cover it; the app has no drag library, and the plan's drag code is its own.
- Swiping editor rows ([mobile-gestures.md](mobile-gestures.md) left them out too).
- Taking "1." or "Step 1:" off pasted lines.

## What would make it a failure

- **Typing a recipe gets slower than the box.** Enter and Backspace must work without a mouse, with the cursor where you'd expect.
- **Text goes missing.** Switching to text and back, splitting, joining and pasting must never drop or reorder a word.
- **The page jumps on a phone.** A new step mustn't scroll away from where you're typing while the keyboard is open.

## Constraints

- Phones get the same layout. The ⋮ menu uses the app's menus, and anything that opens a dialog on a computer opens a drawer on a phone (AGENTS.md).
- Right-to-left: the number sits on the start side, with logical classes only.
- Words go in `en.json`. The steps hint's meaning changes, so it gets a new key.
- The limits stay the server's: 200 steps, 5,000 characters each.

## Approaches

| Approach | Trade-off | |
|---|---|---|
| **A box for each step** | Fixes both reading and editing; the most work of the three | Chosen |
| Keep the one box, number its lines | Typing stays as it is, but a plain box can't number or indent wrapped lines, so it needs a code-editor component, heavy and fiddly on phones; editing inside a long step stays cramped | |
| Read the steps, tap one to edit it in a drawer | Easiest to read; slow for typing a whole new recipe | |

For ingredients, there was one sensible way: the same editor, since the lines, sections and errors are the same. A separate ingredient editor would only repeat it, and leaving ingredients as one box would have two ways of editing a list side by side.

## Left to the builder

- How the form holds the steps (a react-hook-form field array or a list of its own). "Leave without saving" must still notice every change.
- Whether the arrow keys move between boxes at a step's first and last line.
- The exact labels, in the app's voice.
- The parts in a folder of their own under `features/recipes/`.

## Kept current in the same pull request

- `docs/features.md`, and this doc in the table in `docs/README.md`.
- The recipes guide, `apps/docs/src/content/docs/docs/use/recipes.md` ("Type one in" and "Edit and organize"), quoting the new labels exactly.
- Any other guide that says to type ingredients or steps one per line.
