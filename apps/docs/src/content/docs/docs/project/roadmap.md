---
title: Roadmap
description: What is next for Merran, what is planned, and ideas we are exploring.
sidebar:
  order: 1
---

Merran is in alpha. This roadmap describes our direction, not a delivery schedule: priorities and scope can change as we learn from people using it. The released features below are available now; planned and exploratory work has no promised release date.

The latest release is [v0.1.0-alpha.6](https://github.com/merran-app/merran/releases/tag/v0.1.0-alpha.6). See the [release verification record](../release-verification/) for what we have tested and what still needs checking.

**Last reviewed:** October 28, 2026. Implementation status is separate from device and provider acceptance.

## Available now

These features ship in alpha.4:

| Area                    | Available today                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everyday cooking        | Recipe imports and migration, scaling and units, weekly and Any day planning, shopping lists, pantry tracking, and cooking timers.                                                            |
| Pantry                  | Fridge, Freezer, and Cupboard locations, use-soon suggestions, and deductions when planned meals are marked cooked.                                                                           |
| Optional integrations   | Browser extension, Android sharing and iPhone Shortcut setup, store connections, AI assistance, nutrition, video import, generated photos, and server voices. Each has its own prerequisites. |
| Accounts and appearance | Separate households, roles and invitations, household switching, three palettes, light/dark mode, and home-screen installation.                                                               |
| Developers              | A documented API, permission-scoped API keys, and a live event stream.                                                                                                                        |
| Running Merran          | SQLite or Postgres, signed release images, encrypted saved secrets, and a secret-rotation command. Manual backup and restore procedures are documented.                                       |

Alpha.4 also includes:

- **Setup and Help:** setup-code retrieval, password confirmation and operator recovery, household review, the persistent first-meal checklist, contextual explanations, a glossary and guided tours.
- **Email delivery and recovery:** optional SMTP tests, address-bound invitations, and single-use 30-minute password-reset links that sign out existing sessions. See [email setup](../../run/configuration/#email-transport), [invitations](../../run/household-roles/#email-an-invitation) and [password recovery](../../run/configuration/#password-recovery). Copyable invite links and operator recovery work without SMTP. Accounts do not need a verification email to sign in.
- **Planning and shopping:** already-planned recipe badges, meal moves by dragging or choosing a destination, shopping mode, ingredient details, contextual substitutions saved for individual meals, per-store shopping progress and review, and marking verified sent purchases bought with Undo. Sending to a store remains separate from buying and pantry put-away. Completion celebrations respect reduced motion.
- **Project telemetry:** the optional receiver and public aggregate totals are live; the app provides a preview of the summary before enabling it.

Start with [the guides](../../) and [integration setup](../../integrations/browser-extension/). The [release verification record](../release-verification/) separates implementation from the device and provider checks still to do.

## In alpha.5

- **MCP:** connect a compatible AI app with a scoped API key or OAuth, let it read permitted kitchen data and send recipe, meal and list suggestions to Review. Every MCP change needs a person to apply it. See [MCP setup](../../integrations/mcp/). Optional direct plan/list application remains future work.
- **Authentication and connected apps:** opt-in passkeys, authenticator-based two-step sign-in, one external OIDC provider, and household-scoped OAuth connections for MCP and REST. An operator confirmed MCP OAuth, recipe proposals and Bitwarden passkey sign-in on TrueNAS/Dockge; other providers, devices and lifecycle checks remain. See [authentication setup](../../run/authentication/) and the [operator verification report](../release-verification/#operator-authentication-report--october-19-2026).
- **Everyday app improvements:** clearer before-and-after proposal previews, grouped settings with section links, and bottom drawers for forms and confirmations on phones.

## In alpha.6

- **Cooking:** change servings in cook view without losing your place; for a planned meal, the new count is saved to the plan and its shopping. Put a step on hold, keep cooking ahead, and come back to it. See [cooking](../../use/cooking/).
- **Meal calendar:** subscribe to the household's meal plan from a calendar app through a revocable, read-only link, with usual meal times and changes for one day. See [the meal calendar](../../use/planning/#subscribe-to-the-meal-calendar). Checks with real calendar apps remain.
- **Shopping:** prepare the product you buy for each food at each connected store, and order from one store on shopping day. **Covered at home** on the list shows what the pantry kept off it, and using up food that meals on the list were counting on offers to put it back. See [shopping and pantry](../../use/shopping-and-pantry/).

## Up next

Our immediate focus is checking the released workflows in real use before choosing the next feature to build.

- **Everyday workflow verification:** exercise the full first-week walkthrough, real recipe imports, and interrupted jobs so households can follow the guides with confidence.
- **Device and integration checks:** test extension installation, phone sharing, store connections, and optional providers on real devices and accounts so setup instructions reflect what people actually encounter.
- **Broader deployment and accessibility checks:** verify more hosting environments, proxy behavior, and assistive technology so Merran is easier to run and use reliably.

Fresh SQLite and Postgres installation and isolated backup/restore smoke tests have already passed; the remaining work broadens that coverage.

## Planned

These are features we intend to build. Their order here does not indicate priority, and none has a promised release date.

- **Swap planned meals:** exchange two meals directly while preserving their details and shopping-list state. Moving a meal to another day or the any-day pool already works.
- **Offline recipes, plans, and shopping lists:** keep previously opened recipes, the week's plan, and shopping lists useful without a connection, with list check-offs syncing when you reconnect.
- **Prep reminders:** help you remember to thaw ingredients, start a marinade, or begin cooking before dinner is due.
- **Webhooks:** let tools such as Home Assistant and n8n react when recipes, plans, lists, or pantry items change.
- **Translations:** make the interface available beyond English, including the planned option to translate recipes as they are imported. Measurement conversion already works.
- **After-cooking pantry checks:** offer a checklist of ingredients that ran out, with an option to put them on the shopping list. Existing planned-meal deductions remain available.
- **Server administration:** add automatic backups before migrations, a consolidated Problems page, an audit log, and a guided SQLite-to-Postgres transfer. Manual restore smoke tests and secret rotation already exist; they do not implement these additions.
- **Distribution and project services:** add an Unraid template and a hosted app demo. The published documentation site and scripted homepage previews are already available.

Password sign-in remains the default, with the additional alpha.5 methods available when an operator enables them. The interface remains English-only. [Scoped API keys](../../api/), [MCP](../../integrations/mcp/) and [live events](../../api/live-events/) do not provide webhook delivery. Cook timers are available, but scheduled prep notifications are not.

Installing Merran on a home screen does not provide offline data access: the current service worker receives shared files, while recipes, plans, and lists still need the server. Likewise, localization infrastructure is present, but English is the only bundled interface language.

## Exploring

These ideas need more feedback and design work before we choose whether or how to build them.

- **Barcode scanning:** make it quicker to identify packaged food when adding it to the pantry.
- **Meaning-based recipe search:** help you find a meal by what you have in mind, even when you do not remember its title or exact ingredients.
- **A limited role for children:** let younger household members take part with permissions suited to their needs.
- **More recipe tools:** consider Tandoor migration, step photos, recipe translations beyond import, and AI-ranked meal suggestions.
- **Larger deployments:** consider household-owned integration keys, OpenTelemetry, and a Helm chart.

### More ideas from everyday kitchens

These are research candidates, not scheduled work. We would like feedback before choosing their scope.

- **Saved meal plans and menus:** keep named plans for a busy week, a holiday, or a camping trip, then reuse them with new dates and serving counts. Repeat last week already works; this would add a reusable library.
- **Prepared meals and freezer portions:** record portions of meals you have already cooked, plan when to eat them, and avoid buying their original ingredients again. Fridge/freezer locations and leftover notes already exist; this would track the prepared food itself.
- **Minimum-stock reminders:** set a target amount for staples and review suggested top-ups when measured pantry stock falls below it. This would complement recurring buys and usual-buy suggestions.
- **Share a recipe with a friend:** create a revocable, read-only link to one recipe without adding the recipient to your household or exposing its other data.
- **Print and keep:** print clean recipes, plans, and shopping lists, with a possible later option to assemble selected recipes into a family cookbook.

Research included [Paprika's reusable menus](https://www.paprikaapp.com/help/windows/), [Plan to Eat's freezer workflow](https://learn.plantoeat.com/help/app-freezer-cooking), [AnyList's calendar subscriptions](https://help.anylist.com/articles/meal-plan-icalendar-overview/), [Grocy's stock thresholds](https://grocy.info/), [Tandoor's sharing controls](https://docs.tandoor.dev/system/configuration/), and [Recipe Keeper's printable cookbooks](https://recipekeeperonline.com/). These examples informed the ideas; they do not set Merran's implementation or delivery dates.

Tell us which problem matters to you and how you handle it today in [GitHub issues](https://github.com/merran-app/merran/issues). We will link individual tracking issues here as they are opened. For current capabilities and setup instructions, start with [your first week](../../get-started/first-week/).
