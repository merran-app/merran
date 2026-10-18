---
title: Troubleshooting
description: Diagnose startup, imports, background jobs, and connection failures.
sidebar:
  order: 5
---

Start with the exact error and the version you are running. These steps follow the repository implementation; fresh-install and workflow checks against a published release remain outstanding.

## Before you begin

You need access to the deployment's logs for startup problems and a server-administrator account for **Settings → This server → Jobs**. Household import controls require a household owner or admin. Read [roles and permissions](../household-roles/) if controls are missing.

For the supplied Compose installation, run these from the directory containing `compose.yaml`:

```bash
docker compose ps
docker compose logs --tail 200 merran
```

Record the time, version/image tag, action, and error. Logs can include setup codes, addresses, or personal data: redact them before sharing. If normal logs are insufficient, temporarily set `MERRAN_LOG_LEVEL=debug` in the container environment, recreate with `docker compose up -d`, reproduce once, then restore the previous level.

## Merran will not start

| Error or symptom                                | Check and action                                                                                                                                                                                                                                                                | Expected result                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| “Merran can't start, because of these settings” | Correct each named environment variable using the [settings reference](../settings-reference/). Empty variables count as unset. Recreate the container after editing its environment.                                                                                           | Settings validation passes and startup continues.           |
| “Couldn't open the database”                    | For SQLite, check the data mount, write permissions, free space, and logged database path. For Postgres, check `DATABASE_URL`, service availability, and connectivity from the Merran container. The same message can accompany a migration failure: read the underlying error. | Startup opens the intended database and applies migrations. |
| Port already allocated or address in use        | Check which process/container owns the port. With supplied Compose, change the published `MERRAN_PORT` if needed; internal `PORT` and the container mapping must agree.                                                                                                         | The service starts and answers at the chosen host port.     |
| Setup appears again after a restart             | Check that the original persistent data directory/database is mounted. Stop and correct the mount before creating a replacement account.                                                                                                                                        | The original accounts and household return.                 |
| Saved credentials become unreadable             | Check that the original data directory's `secret` file, or the original external `MERRAN_SECRET`, was restored with the database. Do not replace the secret as a repair.                                                                                                        | Credentials decrypt with their original secret.             |

Successful startup logs the database backend and a message that Merran is listening on its port. If an update or migration failed, preserve the current data and logs, then follow [recovery](../updating-and-backups/#restore). Do not delete the database to clear an error or start an older image against migrated data.

## The page or a connection fails

1. Check that the container is running and its logs say it is listening.
2. From the server, try the configured published address. If that works but the public address does not, check the reverse proxy/tunnel, DNS, TLS, and upstream port.
3. Set `MERRAN_PUBLIC_URL` to the address people actually use. Trust only the proxy addresses/ranges you operate with `MERRAN_TRUSTED_PROXIES`; these govern forwarded client addresses.
4. If you can open the app but a request is refused, sign in again and check the active household and permissions before changing network settings.

**Expected result:** the same public address opens Merran, sign-in works, and newly generated links use that address. A connection working from your browser does not prove the server container can reach it.

For optional connections:

| Feature                             | Checks                                                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI provider or custom model address | Follow [AI request troubleshooting](../ai-setup/). Check key access, task/model policy, credit, limits, and the endpoint's reachability from the server.                                                                                                         |
| Kroger                              | Check the server's developer credentials, household store selection, and account link. If the account link expired or was rejected, use **Link again** in the household's **Stores** card. See [shopping and store connections](../../use/shopping-and-pantry/). |
| Kokoro voice                        | Check the configured address from the Merran container. `localhost` there means that container, not a separate Kokoro service. See [cooking](../../use/cooking/).                                                                                                |
| Experimental Walmart connection     | Check the extension and the person's Walmart tab. Site changes or human-verification prompts can interrupt it; it is not a guaranteed background connection.                                                                                                     |

## An import fails

1. Identify the import type and use its matching instructions in [Recipes](../../use/recipes/): a recipe URL, text/photo, exported files, a Merran export, and live Mealie migration use different paths.
2. Read the error or import summary before submitting again. Check the destination household and whether any recipes were already added.
3. For a recipe website, confirm the page is publicly reachable. A page behind a login, blocked by the site, or without usable recipe data may need text/manual entry. AI-dependent extraction also needs eligible AI access.
4. For video, check that video imports are enabled, AI is available, and `yt-dlp` and `ffmpeg` are available to the server. Some sites require cookies; configured cookie files must exist inside the container. External sites can still refuse downloads.
5. For archive/file imports, use the format the importer expects, inspect the reported upload/format limit, and check disk space and write access in the data directory. An HTTP upload rejection before a job appears can also come from the reverse proxy's request-size limit.
6. For live Mealie migration, check the address and credentials from the server's network, and confirm you have both required administrator roles.

**Expected result:** the import summary accounts for imported, skipped, and failed items, and the intended recipes appear in the household. A successful request or a **Done** job alone is not proof that every source item imported. Check the result and a sample of recipes, quantities, images, and notes.

Import failures can leave partial results. Stopping or retrying does not promise rollback. Review what was saved before retrying, and back up before large migrations. If an old import's uploaded file has been cleaned up, submit the source file again rather than repeatedly retrying the old job.

## Background jobs are waiting or failing

Open **Settings → This server → Jobs**. The list shows recent work across households, its status, progress when available, and errors. It is a recent operational view, not a permanent audit history: the list is limited to the latest 100 jobs, and finished jobs older than 30 days are cleaned up.

| Status      | Meaning and action                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Waiting** | Work may be scheduled for later, backing off after a failure, or waiting for capacity. Check **Next at** before treating it as stuck.  |
| **Running** | Check progress and logs. **Stop** requests cancellation; it may take time for the handler to respond and does not undo completed work. |
| **Done**    | The handler finished. For imports, inspect the item-level summary and resulting data.                                                  |
| **Failed**  | Fix the displayed cause first, then choose **Try again** if the job still has the inputs it needs.                                     |
| **Stopped** | A cancelled job can be restarted with **Try again**, subject to the same input and partial-result limits.                              |

Ordinary jobs default to three attempts with increasing delays, but handlers can choose different limits; scheduled jobs use one attempt per run. **Try again** starts a failed/stopped job from the beginning, clearing its previous progress and result. It is refused if an equivalent keyed job is already waiting or running.

A queued scheduled job cannot be stopped from this screen. Stopping a scheduled run does not disable future runs; use the corresponding feature's setting where one exists. Restarting the server requeues interrupted work, so repeated restarts are not a way to cancel a job. Merran runs its job worker in the server process; no separate worker service is required.

If due jobs remain waiting with no progress, look for “The job runner couldn't check for work” and database errors in the server logs. A job saying Merran does not know its kind may reflect a version mismatch; record the kind and image version before retrying or seeking help.

## Email invitations are unavailable (not released yet)

If **Invite by email** says to ask the server administrator to configure Email and the public address, check both prerequisites:

- In **Settings → This server → Email**, turn on **Enable email**, save the SMTP host, port, security, sender and matching credential pair, and use **Send test email**. Resend uses `smtp.resend.com`, port `465`, **Use TLS from the start**, username `resend`, and an API key as the password. Use a sender on a verified domain.
- Set `MERRAN_PUBLIC_URL` to the HTTP(S) address recipients use to open Merran, without a path, query, fragment or embedded credentials. A successful SMTP test does not replace this setting. Check **Address** in **Settings → This server** to see the running server's configured address.

For the repository's Compose file, put the variable in `.env` beside `compose.yaml` and recreate the container with `docker compose up -d`. For self-contained host-manager stacks, put it in Merran's `environment` block and redeploy. For `pnpm dev`, `.env` is not automatically loaded by the API: [set the process environment and restart](../configuration/#source-development-environment). Reload the browser afterward. A localhost address works only on the computer opening that link.

If an invitation is **Accepted by mail service** but missing from the inbox, check spam and the provider's dashboard. This status records SMTP acceptance, not final delivery. Temporary failures retry automatically; **Sending failed** allows **Resend email** after correcting the settings. Copyable invite links remain available without email. See [household invitations](../household-roles/#email-an-invitation-not-released-yet) for expiry, resend limits and cancellation.

## A setting will not save

An environment override takes priority and locks the corresponding app setting. Remove or correct the override, then recreate the container. Removing it may reveal a previously saved value. Environment-only settings are never editable through the settings API. Other validation errors indicate a rejected value or the wrong scope; use the [generated reference](../settings-reference/) and [configuration guide](../configuration/).

## Recovery and further help

:::note[Not released yet]
For a buried setup code, use `docker compose exec merran merran setup-code`, or **Where is my setup code?** on the setup page. For a forgotten password, `docker compose exec -it merran merran reset-password YOUR-USERNAME` prompts privately and revokes that account's sessions; SMTP is not required. These commands are in development and unavailable on older images. See [first-run setup](../../get-started/setup/) for version differences and interrupted-setup recovery.
:::

Use [updating, backups, and recovery](../updating-and-backups/) for a failed update, lost data, or a restore test. A household export is useful for portability but is not a complete server backup.

If the problem persists, [open an issue](https://github.com/merran-app/merran/issues) with the version/image tag, installation method, database backend, reproduction steps, expected and actual results, and a short redacted error excerpt. Include a job kind/status when relevant. Never attach provider keys, session cookies, invitation links, `.env`, a database, or a full household export to a public issue.
