---
title: Welcome to Merran
description: A kitchen on your own server. Start with installation, your first week, or the API.
---

Merran brings your household's recipes, meal plan, shopping list, and pantry together. Run it on your own server and use it from a phone, tablet, or desktop. An AI assistant is optional; the core works without a provider key.

Merran is currently **alpha**. Keep backups and expect changes between releases. This initial documentation follows the implementation in this repository; check the release notes for the image you run.

## Start with a working kitchen

1. [Install Merran](./get-started/install/) with Docker Compose or Docker.
2. [Set up your account and household](./get-started/setup/).
3. [Plan, shop, and cook your first week](./get-started/first-week/).

## Use Merran every day

Follow the everyday workflow: [Recipes](./use/recipes/) → [Planning](./use/planning/) → [Shopping and pantry](./use/shopping-and-pantry/) → [Cooking](./use/cooking/). Each guide includes prerequisites, steps, expected results, limits, and troubleshooting.

## Connect your kitchen

Install the [browser extension](./integrations/browser-extension/) or set up [phone sharing](./integrations/phone-sharing/). For store carts, follow [Kroger](./integrations/kroger/) or [experimental Walmart](./integrations/walmart/). [Optional modules](./integrations/optional-modules/) covers nutrition, video imports, generated photos, and server voices.

## Operate your server

For optional AI, start with [provider setup and costs](./run/ai-setup/), then read [privacy and data flow](./project/ai-privacy/) and [assistant proposals and approvals](./use/assistant/).

[Configuration](./run/configuration/) explains the server, household, and personal settings. Read [updating and backups](./run/updating-and-backups/) before changing your installation.

Administrators can use [household roles and permissions](./run/household-roles/), the [generated settings reference](./run/settings-reference/), and [troubleshooting](./run/troubleshooting/) for day-to-day operations and recovery.

For deployment, follow [HTTPS and remote access](./run/https-and-remote-access/), [Postgres](./run/postgres/), and the [backup/restore walkthrough](./run/backup-restore/). The [release verification record](./project/release-verification/) distinguishes tested release behavior from remaining checks.

## Build an integration

[Make your first API request](./api/), browse the [generated endpoint reference](./api/reference/), or download the <a href="../openapi.json" download="merran-openapi.json">OpenAPI specification</a>.

Continue with a [working recipe-index script](./api/practical-integration/) and [live events](./api/live-events/) to build an integration.

## Support

For a reproducible bug, [open an issue](https://github.com/merran-app/merran/issues). Include your Merran version, installation method, and relevant logs with secrets removed. To work on Merran, start with [the contributor guide](./project/contribute/).
