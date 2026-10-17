# Roadmap research — October 17, 2026

Purpose: identify useful additions to Merran's public roadmap after the first alpha. Compared official product/help pages with the code audited at d77b75b (PR #8). This is desk research, not hands-on testing of competing apps. Sources describe current documented workflows, not certified version-by-version capabilities or absence claims. Six candidates were added to Exploring; none was promoted to Planned or In progress.

## Sources and observations

| App | Official source | Observed workflow |
| --- | --- | --- |
| Mealie | [Features](https://mealie.io/documentation/getting-started/features/), [roadmap](https://mealie.io/documentation/getting-started/roadmap/) | Strong recipe/import/meal/list coverage overlaps with Merran. The roadmap directs feature requests to GitHub; it does not establish Merran's priorities. |
| Tandoor | [Features and roadmap](https://docs.tandoor.dev/), [sharing configuration](https://docs.tandoor.dev/system/configuration/) | Cookbooks and collaboration; optional public recipe links. Its roadmap links issues/milestones and includes quality, documentation and data portability. |
| Paprika | [Windows guide: Menus](https://www.paprikaapp.com/help/windows/) | Named menus may contain multiple days and can be added to the planner with a new start day. |
| Plan to Eat | [Freezer Cooking](https://learn.plantoeat.com/help/app-freezer-cooking), [planner tour](https://www.plantoeat.com/tour/meal-planner/) | Prepared-meal inventory includes servings, meal quantities and frozen dates; frozen meals can return to the plan. |
| AnyList | [Calendar subscriptions](https://help.anylist.com/articles/meal-plan-icalendar-overview/), [feature list](https://www.anylist.com/features) | Read-only iCalendar subscription makes planned meals visible in external calendar apps. |
| Grocy | [Official feature overview](https://grocy.info/) | Minimum stock amounts support replenishment; also documents barcode entry and due-stock recipe suggestions. Merran already has due-soon planning and barcode scanning is already exploratory. |
| Recipe Keeper | [Official feature overview](https://recipekeeperonline.com/) | Printable/shareable PDF cookbooks can include cover, chapters and recipe layouts. |

## Recommended candidates

Relative effort is an initial engineering estimate, not a schedule. Priorities below are recommendations for discussion; the public page makes no new ordering commitment.

| Candidate | Smallest useful first slice | Merran gap checked | Relative effort |
| --- | --- | --- | --- |
| Calendar subscriptions | Opt-in household feed with meal title/date, recipe URL, token revocation and no write access. | No calendar feed/export route or text/calendar response in server routes. Existing SSE is a different protocol. External refresh intervals must be documented. | Small–medium |
| Saved menus/plans | Save a named week's recipes/notes/servings; preview before applying on new dates and define collision behavior. | services/plan/plan.ts repeats last week; PlanEntry represents dated/pool meals, not a reusable named template. | Medium |
| Prepared meals/freezer portions | Record recipe, cooked quantity, remaining portions and date; schedule eating it without deducting raw ingredients twice. | PantryItem tracks ingredients/storage/use-by/reservations. Plan notes can say leftovers, and use-soon marks uncooked ingredients from missed meals; neither is a cooked-batch ledger. | Large |
| Minimum-stock reminders | Target quantity per food; show a reviewable shortage that accounts for measured amounts, units and stock reserved for meals. | PantryItem has no reorder threshold. Every-week, always-on-hand and usual-buy concepts already exist and should remain distinct. Unknown quantities cannot reliably trigger automatic top-ups. | Medium |
| Recipe-only sharing | Read-only revocable token for one recipe, with optional expiry and operator controls. | Recipe GET uses household authentication/key permissions; existing Share to Merran imports inbound content rather than publishing an outbound recipe link. No broad household access for recipients. | Medium |
| Print and cookbook views | Accessible print CSS/views for one recipe, weekly plan and list; later combine selected recipes into a printable cookbook. | No deliberate print view/window.print/print CSS in the audited recipe/plan/list UI. Structured household export and the browser's generic Print command do not supply a designed cookbook. | Small first slice; medium–large for books |

## Fit for Merran

Calendar feeds and saved plans offer contained additions. Prepared-meal inventory is the strongest larger extension of the existing plan → shop → cook loop: cook once, record portions, eat later without repurchasing ingredients. These are product judgments inferred from the comparison, not evidence of measured user demand. Feedback should determine which is promoted next.

An original follow-on idea is a weekly prep checklist combining common work across planned recipes (for example, chop the onions once for several dishes). Another is a coordinated multi-dish timeline. Merran already supports recipe pairings, cook steps and timers; a useful addition would need dependency/order and equipment modeling, rather than relabeling those existing capabilities. These remain research notes rather than extra public promises.

## Roadmap presentation

Show a reviewed date, released capabilities, selected planned work and a concise Exploring list. Link items to scoped GitHub issues once created; use In progress only for work actually started. Move completed work into release notes and record shipped versions. Do not add dates, completion percentages or activity labels merely to signal momentum. A visible record of shipped improvements and candid status changes provides evidence of activity.

Broader social networks, calorie-goal coaching and household chores were not added in this pass: they need separate product decisions and would spread the scope beyond the current cooking/planning focus. Native widgets and watches also need a platform strategy first.

## Validation

Public roadmap formatting and docs typecheck passed with zero diagnostics. Production build and link validation passed: 277 pages and 88,712 local links/assets. No runtime features or deployment settings were changed.
