---
title: Roadmap
description: What is next for Merran, what is planned, and ideas we are exploring.
sidebar:
  order: 1
---

Merran is in alpha. This roadmap describes our direction, not a delivery schedule: priorities and scope can change as we learn from people using it. The released features below are available now; planned and exploratory work has no promised release date.

The feature baseline is [v0.1.0-alpha.1](https://github.com/merran-app/merran/releases/tag/v0.1.0-alpha.1). See the [release verification record](../release-verification/) for what we have tested and what still needs checking.

**Last reviewed:** October 17, 2026. Features move to Planned when we choose to build them; In progress will be used only when implementation starts.

## Available now

These features already ship in alpha.1 and are not future roadmap items:

| Area                    | Available today                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everyday cooking        | Recipe imports and migration, scaling and units, weekly and Any day planning, shopping lists, pantry tracking, and cooking timers.                                                            |
| Pantry                  | Fridge, Freezer, and Cupboard locations, use-soon suggestions, and deductions when planned meals are marked cooked.                                                                           |
| Optional integrations   | Browser extension, Android sharing and iPhone Shortcut setup, store connections, AI assistance, nutrition, video import, generated photos, and server voices. Each has its own prerequisites. |
| Accounts and appearance | Separate households, roles and invitations, household switching, three palettes, light/dark mode, and home-screen installation.                                                               |
| Developers              | A documented API, permission-scoped API keys, and a live event stream.                                                                                                                        |
| Running Merran          | SQLite or Postgres, signed release images, encrypted saved secrets, and a secret-rotation command. Manual backup and restore procedures are documented.                                       |

Start with [the guides](../../) and [integration setup](../../integrations/browser-extension/). The [release verification record](../release-verification/) separates implementation from the device and provider checks still to do.

## Up next

**Built since alpha.1, not released yet:** shopping progress on **List**, including per-store sent/ready/attention counts, selected products, review over the list, cart links, and marking sent purchases bought. Changed quantities or products prompt a retailer-cart review. Sending remains separate from buying and pantry put-away.

Our immediate focus is checking the released workflows in real use before choosing the next feature to build.

- **Everyday workflow verification:** exercise the full first-week walkthrough, real recipe imports, and interrupted jobs so households can follow the guides with confidence.
- **Device and integration checks:** test extension installation, phone sharing, store connections, and optional providers on real devices and accounts so setup instructions reflect what people actually encounter.
- **Broader deployment and accessibility checks:** verify more hosting environments, proxy behavior, and assistive technology so Merran is easier to run and use reliably.

Fresh SQLite and Postgres installation and isolated backup/restore smoke tests have already passed; the remaining work broadens that coverage.

## Planned

These are features we intend to build. Their order here does not indicate priority, and none has a promised release date.

- **Offline recipes, plans, and shopping lists:** keep previously opened recipes, the week's plan, and shopping lists useful without a connection, with list check-offs syncing when you reconnect.
- **Prep reminders:** help you remember to thaw ingredients, start a marinade, or begin cooking before dinner is due.
- **More sign-in options:** add passkeys, authenticator-based two-step sign-in, and OIDC single sign-on so you can choose a sign-in method that fits your household or server.
- **Webhooks:** let tools such as Home Assistant and n8n react when recipes, plans, lists, or pantry items change.
- **MCP support:** let compatible external AI tools work with your household's recipes, plan, and list, with proposed changes reviewed before they are applied.
- **Translations:** make the interface available beyond English, including the planned option to translate recipes as they are imported. Measurement conversion already works.
- **Email delivery:** send invitations and password-reset messages through an operator-configured SMTP server. Invitation links already work.
- **Guided onboarding (in progress, not released):** clearer setup-code retrieval, password confirmation and operator recovery, household review, a persistent first-meal checklist, Help and Driver.js tours. Expand contextual explanations and complete device/host-manager acceptance. See [first-run setup](../../get-started/setup/).
- **After-cooking pantry checks:** offer a checklist of ingredients that ran out, with an option to put them on the shopping list. Existing planned-meal deductions remain available.
- **Server administration:** add automatic backups before migrations, a consolidated Problems page, an audit log, and a guided SQLite-to-Postgres transfer. Manual restore smoke tests and secret rotation already exist; they do not implement these additions.
- **Distribution and project services:** add an Unraid template, a hosted app demo, and a telemetry receiver with public aggregate totals. The published documentation site and scripted homepage previews are already available.

Today, Merran uses password sign-in and an English interface. Its [scoped API keys](../../api/) and [live events](../../api/live-events/) are available now; they are not webhook delivery or an MCP server. Cook timers are available, but scheduled prep notifications are not.

Installing Merran on a home screen does not provide offline data access: the current service worker receives shared files, while recipes, plans, and lists still need the server. Likewise, localization infrastructure is present, but English is the only bundled interface language.

## Exploring

These ideas need more feedback and design work before we choose whether or how to build them.

- **Barcode scanning:** make it quicker to identify packaged food when adding it to the pantry.
- **Meaning-based recipe search:** help you find a meal by what you have in mind, even when you do not remember its title or exact ingredients.
- **A limited role for children:** let younger household members take part with permissions suited to their needs.
- **OAuth connections for external AI apps:** make connecting supported remote AI clients easier without manually copying an API key.
- **More recipe tools:** consider Tandoor migration, step photos, recipe translations beyond import, and AI-ranked meal suggestions.
- **Larger deployments:** consider household-owned integration keys, OpenTelemetry, and a Helm chart.

### More ideas from everyday kitchens

These are research candidates, not scheduled work. We would like feedback before choosing their scope.

- **Saved meal plans and menus:** keep named plans for a busy week, a holiday, or a camping trip, then reuse them with new dates and serving counts. Repeat last week already works; this would add a reusable library.
- **Prepared meals and freezer portions:** record portions of meals you have already cooked, plan when to eat them, and avoid buying their original ingredients again. Fridge/freezer locations and leftover notes already exist; this would track the prepared food itself.
- **Calendar subscriptions:** show the meal plan in your preferred calendar through an optional read-only iCalendar feed with a revocable link. Calendar apps control how often they refresh it.
- **Minimum-stock reminders:** set a target amount for staples and review suggested top-ups when measured pantry stock falls below it. This would complement recurring buys and usual-buy suggestions.
- **Share a recipe with a friend:** create a revocable, read-only link to one recipe without adding the recipient to your household or exposing its other data.
- **Print and keep:** print clean recipes, plans, and shopping lists, with a possible later option to assemble selected recipes into a family cookbook.

Research included [Paprika's reusable menus](https://www.paprikaapp.com/help/windows/), [Plan to Eat's freezer workflow](https://learn.plantoeat.com/help/app-freezer-cooking), [AnyList's calendar subscriptions](https://help.anylist.com/articles/meal-plan-icalendar-overview/), [Grocy's stock thresholds](https://grocy.info/), [Tandoor's sharing controls](https://docs.tandoor.dev/system/configuration/), and [Recipe Keeper's printable cookbooks](https://recipekeeperonline.com/). These examples informed the ideas; they do not set Merran's implementation or delivery dates.

Tell us which problem matters to you and how you handle it today in [GitHub issues](https://github.com/merran-app/merran/issues). We will link individual tracking issues here as they are opened. For current capabilities and setup instructions, start with [your first week](../../get-started/first-week/).
