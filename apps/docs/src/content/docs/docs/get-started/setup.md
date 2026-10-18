---
title: First-run setup
description: Claim a fresh server with its setup code and create your household.
---

## Find the setup code

:::note[Not released yet]
The `MERRAN SETUP CODE` banner, `setup-code` and `reset-password` commands, password confirmation, household review, persistent checklist and Help tours below are in development. On older images, find the original “Set up Merran in the browser with this code” log line instead; the new commands are unavailable there.
:::

On a new build, choose **Where is my setup code?** on the setup page. You can retrieve the active code without reading the startup output:

```bash
docker compose exec merran merran setup-code
# Standalone container:
docker exec merran merran setup-code
```

For a source installation, run `pnpm merran setup-code` with the same environment and data directory as the server. The command does not make a new code and refuses an already configured server. The operator-only `setup-code` file is removed after claiming or a normal shutdown. Keep access to the data directory restricted, just like the database and logs.

On a fresh installation, Merran prints a setup code in its server log. For Compose:

```bash
docker compose logs merran
```

For a standalone container:

```bash
docker logs merran
```

The code prevents someone who merely finds the address from claiming an unconfigured server. Copy it from your own logs.

Search for **MERRAN SETUP CODE** in the Merran container's logs, not the combined Postgres/Kokoro logs. In TrueNAS, Dockge or Portainer, open the Merran container's log viewer and use its search if available. Avoid limiting output to a few recent lines: migrations and other services can bury the startup message.

On PowerShell, `docker compose logs merran | Select-String 'MERRAN SETUP CODE'` filters the output. On a Unix shell, use `docker compose logs merran | grep 'MERRAN SETUP CODE'`.

Restarting Merran changes the code. Twenty wrong attempts lock setup for fifteen minutes; follow the wait message before trying again.

## Create your account

Open Merran at your server's address, enter the setup code, and follow the setup form to create your account and household. The first account is the server administrator.

The **Account and household** section uses paired columns on desktop and stacks on phones. Enter **Password** and **Confirm password**. **Show** and **Hide** sit inside each password input and let you check either value; paste and password managers remain supported. Passwords must have 10 to 128 characters.

If the connection drops after submitting, use **Account already created? Sign in** before repeating setup. Account, credentials and household creation commit together; sign-in can still fail afterward. A completed claim cannot be repeated with the code.

An email address identifies your account; it does not enable email recovery. If you lose access, the operator can run `docker compose exec -it merran merran reset-password YOUR-USERNAME`. The command prompts privately for the new password twice and signs out every device for that account. It also accepts an email address. Never put a password in the command line.

Your household holds the shared recipes, plan, pantry, and shopping lists. Merran can host multiple households, and a person can belong to more than one.

## Review the household and privacy choice

On **Today**, **Your first meal** stays available after adding a recipe. Choose **Review household preferences** to check **Time zone**, **Week starts on** and the meals to plan. The first review suggests this browser's time zone (UTC if unavailable); changes apply to everyone in the household. **Do this later** leaves the saved defaults in place. Recipe display units are a device choice.

The server administrator is offered **Help improve Merran?** after claiming. **See exactly what would be sent** previews the report. Choose **Yes, send it** or **No thanks**; no answer leaves telemetry off unless the operator explicitly configured it. Environment settings take priority. See [telemetry](../../run/telemetry/) for details and the earlier release availability.

Follow the checklist through adding a recipe, planning a meal, building a list, and cooking. **Hide getting started** hides it for your account. **Help → Show getting started and tours again** restores it and resets your tour history. A short tour starts automatically the first time you open each main page, after loading and any open dialogs finish. The top-right **×** (**Skip this tour**) skips that page's tour. **Don't show tours**, the small link at the top, disables future automatic tours on your other devices too. **Previous** and **Next** sit at the bottom. Replay a page from **Help → Show me around this page**. Tours never start automatically during cooking.

Invite household members from **Settings → Household**. They use the invite link, not the server setup code. Shared checklist progress belongs to the household; tour history and dismissal belong to each person.

**Help** keeps the tour controls, **Your first week guide**, and **What's new** together. **What's new** opens the latest release on GitHub. Definitions are available in the [glossary](../../use/glossary/) and beside the features they explain.

## Find the right settings

- **This server** controls server-wide configuration and optional modules.
- **Household** controls the household's preferences and shared setup.
- Personal settings apply to your account.

Start with the core meal workflow. You can configure AI providers, stores, nutrition, and voice later as needed. Some features require an enabled module, external credentials, or another service.

Next: [your first week](../first-week/).
