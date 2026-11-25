# Add a recipe to the list without planning it

Design agreed November 25, 2026. It adds to [A shopping list from the plan](../../features.md#shopping-and-the-pantry), and belongs with the decisions in [shopping-and-planning-feedback.md](../../shopping-and-planning-feedback.md).

## What it's for

The week is planned and on the list. Then something comes up that wasn't planned: a pie for Thanksgiving tomorrow, and a trip to the store this afternoon. Today the only way to get the pie's ingredients on the list is **Plan it**, picking a day and meal, then **Add from plan**, or typing each ingredient by hand. This makes it one step from either end:

- On a recipe's page, **Add to list**.
- On the List, **Add a recipe**, pick one, add it.

Done means:

- One tap on the recipe page puts its ingredients on the list, with Undo.
- From the List, picking a recipe and its servings puts its ingredients on the list, with Undo.
- The lines behave like any planned meal's. They add up with what's already there, and what's always on hand and what's at home are left off. A line's info popup names the recipe. **Covered at home** lists what the pantry kept off, swaps work while shopping, and taking it off takes its share back off the list.

Out of scope:

- Keeping the recipe off the plan entirely. The person said it showing on the plan is fine.
- Adding several recipes at once from select mode.
- Choosing a day. That's **Plan it**, and the meal can be moved to a day afterwards.
- Every-week items. Add from plan brings them along; a one-off trip shouldn't.

## Approaches

1. **It goes in this week's any-day meals, and on the list (picked).** One step makes a plan entry in the week's pool and lists it, as Add from plan would. Everything the list does for planned meals works because it is a planned meal. That covers shares per meal, the info popup, Covered at home, swaps, pantry set-asides, taking it off, cook view and marking it made. The cost is one server route and two places to press it. It shows on the week's plan, which was agreed to be fine.
2. **List only.** The recipe never touches the plan, and list lines gain a second kind of share, "for this recipe". The info popup, Covered at home, swaps, pantry set-asides and removing it would each have to learn it, and marking it made wouldn't exist. Several times the work, for something that wasn't wanted.
3. **Plain lines.** The ingredients are copied in as typed lines. It's the cheapest option, but nothing remembers they're for the pie. There's no taking it off as one, no pantry, and the info popup is blank.

## Behaviour

- **The week** is the one with tomorrow in it, by the household's time zone and first day of the week. On every day but the week's last, that's this week. On its last day it's next week, so shopping on a Sunday for the days coming doesn't leave the meal in a pool that ends that night, to be asked about ("Did you make these?") the next morning. Decided November 25, 2026, after review. Making it that same last day won't match **Made it**, which looks in this week's pool.
- **A meal planned already goes on instead (decided November 25, 2026, after review).** If the recipe is planned, still to make and not on the list yet, from today to the end of that week or in that week's any-day meals, the first such meal is listed rather than a new one made. Otherwise a later **Add from plan** would list it too and buy for two. It takes the servings given, if they differ; its side stays as planned.
- **Otherwise, adding makes a meal.** In one transaction:
  - A plan entry is made in that week's any-day pool.
  - Its meal is the one given, or else dinner if the household plans dinners, or else its first planned meal. That's the same default **Plan it** starts on.
  - It gets the recipe, side and servings given. No servings means the recipe's own.
- **Either way it's listed** with `listMeals`, exactly as Add from plan lists a meal. The lines are added up, always-on-hand is left off, what's at home is set aside, they're merged into lines waiting there, and `listedAt` is set.
- **After that it's an ordinary meal.** A new one shows in the week's pool. Moving it to a day changes nothing on the list. Changing its servings or side, skipping it or removing it changes the list the way any listed meal does. Cook view and marking it made work as usual.
- **Undo** (`POST /api/list/recipes/undo`, with the `undo` the add answered with) removes a meal it made, which takes its share off the list and frees what was set aside. A meal that was planned already stays on the plan, off the list again, with its servings as they were. The toast says which: "It's on this week's plan, any day.", "It's on next week's plan, any day." or "It was planned for Friday, Nov 27."
- **The same recipe again.** Adding a recipe that's already planned and on the list this week adds a second share (two pies). It isn't blocked: the picker shows **Already planned** for this week, and the toast has Undo.
- A recipe in Recently deleted, or one that doesn't exist, is "No such recipe", as for the plan.

## The API

`POST /api/list/recipes`, in `apps/server/src/http/routes/list/recipes/post.ts`:

- `operationId: addRecipeToList`, tag List, summary "Add a recipe to the list".
- The description says it also puts the recipe in the week's any-day meals, and that the list follows that meal from then on.
- Body: `recipe` (id, required), and optionally `withRecipe`, `servings` and `meal`.
- Answers 201 with `entry` (the plan entry, as `PlanEntrySchema`), `made` (whether it made the meal), `undo` (`RecipeOnListUndo`: the meal, `made`, and its servings before), plus `added`, `merged`, `onHand` and `inPantry`, as Add from plan answers them.
- 404 for no such recipe, 400 for a bad body.
- **`POST /api/list/recipes/undo`** (`undoRecipeOnList`) takes that `undo`. It refuses to remove a meal that isn't a pool meal still to make (400), so a list-only key can't use it to delete other meals.
- **Permission: `list:write`** for both (my call). A route takes one permission. This one is asked for as a list change, and the plan entry is how the list keeps track of it. `/api/list/covered` made the same kind of call. Undo has its own route, rather than `DELETE /api/plan/entries/{id}`, because a meal planned already must stay, and so a key that could add can also undo.
- **Live updates:** both change the list, the plan and the pantry, so they get a line in `CHANGES` in `apps/server/src/http/middleware/live.ts`.
- Then `openapi.json` is regenerated, along with both `schema.d.ts` files (web and extension).

## The UI

### The recipe page

- **Add to list** is the first item in the page's **More** (⋯) menu, with a shopping-list icon. It started as a button after **Plan it** and moved into the menu at the person's request, November 25, 2026, to keep the row of buttons short.
- Choosing it adds the recipe, with the servings and side shown on the page, as **Plan it** uses them. The item is disabled while it saves.
- The toast says "Added Pumpkin pie to the list." and "It's in this week's any-day meals.", with **Undo**.

### A recipe card's right-click menu

- **Add to list** goes under **Plan it**, with the recipe's own servings and no side (my call). The menu offers what's on the recipe's page.

### The List

- **Add a recipe** is the first item in the List's **More** (⋯) menu, and an outline button in the empty list's message, beside **Add from plan**. It was planned as a header button; it followed the recipe page's into the menu the same day, to keep the header short.
- It opens the app's `Dialog`, which is a drawer on phones, titled "Add a recipe to the list":
  1. First the recipe picker (`RecipePicker`). Its plan date is today, so **Already planned** shows for this week.
  2. Picking a recipe shows its name, with **Pick another** to go back, a **Servings** field and **Add to list**. The field starts empty, with the recipe's own servings as its placeholder and "Leave it empty for the recipe's 4.", as changing a planned meal does. Empty, or the recipe's own number, sends none (my call: the servings step is there because a holiday often means doubling).
- It shows the same toast as the recipe page.

### Words

New keys in `apps/web/src/locales/en.json`; existing strings aren't reused for a different meaning.

## Keeping everything current

- `docs/features.md`: a new row under Shopping and the pantry, Key, Built.
- `docs/shopping-and-planning-feedback.md`: a dated section recording this decision.
- The site's guides: `use/shopping-and-pantry.md` (Add a recipe) and `use/recipes.md` (Add to list), quoting the labels exactly.
- The API reference comes from `openapi.json`.

## Tests

- **Server:** a route test covering:
  - an any-day entry in the current week, with the default meal and with a given one;
  - lines with shares for that entry;
  - always-on-hand left off, and what's at home set aside;
  - merging into a line already there;
  - every-week items not added;
  - removing the entry taking its share back off;
  - an unknown recipe getting a 404;
  - a key with only `list:write` being able to use it.
- **In the app:** check in the dev server:
  - the recipe page button and its Undo;
  - the List's dialog, at desktop and phone width;
  - the pool on the plan showing the meal;
  - a line's info popup naming it.

## Left to the builder

- The icon.
- The toast's exact wording within the meaning above.
- Where **Add a recipe** sits on phones.
