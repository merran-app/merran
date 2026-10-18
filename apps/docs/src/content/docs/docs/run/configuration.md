---
title: Configuration
description: Understand environment settings, optional modules, and configuration ownership.
sidebar:
  order: 1
---

A default SQLite installation needs no external services. Configure optional features as you begin using them.

Use the [generated settings reference](../settings-reference/) for the registered keys, environment variables, scopes, types, defaults, and choices. It is generated from source definitions each site build; it does not read your deployment's values.

## Compose environment

The repository's [.env.example](https://github.com/merran-app/merran/blob/main/.env.example) documents common deployment settings. Put your .env beside compose.yaml.

For a first installation, use the [copyable starter .env](../../get-started/install/#environment-variables) or [download it](../../../deploy/merran.env.example). It selects the `:next` alpha release channel and shows the host port, time zone and user/group IDs together. The self-contained TrueNAS, Dockge and Portainer examples put environment values directly in YAML instead of loading this file.

| Setting           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| MERRAN_PORT       | Published host port; 3000 by default                           |
| TZ                | Container time zone                                            |
| MERRAN_PUBLIC_URL | Address people use to reach Merran, used for links and sign-in |
| MERRAN_LOG_LEVEL  | Logging detail                                                 |
| MERRAN_IMAGE      | Container image or release tag                                 |
| DATABASE_URL      | Postgres connection string, when using Postgres                |

Apply environment changes by recreating the container:

```bash
docker compose up -d
```

MERRAN_PORT is a Compose setting for the published port; Merran's internal server port is PORT. Keep the supplied container mapping unless you intentionally change both.

## Optional modules

Open **Settings → This server** to configure modules such as AI, stores, nutrition, or voice. Values supplied through the environment can lock the corresponding settings in the app.

Some settings belong to the household or account rather than the server. Use household settings for shared household preferences and personal settings for your own preferences.

See [household roles and permissions](../household-roles/) for who can change each scope. Server administration and household ownership are separate roles.

For AI, follow [AI setup and costs](../ai-setup/) to connect providers, select models, manage shared and household keys, and troubleshoot requests. Read [AI privacy and data flow](../../project/ai-privacy/) before enabling external processing.

## Secrets and data

### Email transport (not released yet)

In **Settings → This server → Email**, enter **SMTP host**, **SMTP port**, **SMTP username**, **SMTP password or API key**, and **Sender email address**. Save with **Save**, turn on **Enable email**, then choose **Send test email**. Tests go to your account's email address. Check your inbox and spam folder; provider acceptance does not guarantee inbox delivery. This first implementation sends test messages; email invitations and password recovery are still being built. Continue using invite links and operator password recovery.

For [Resend](https://resend.com/docs/send-with-smtp), verify a domain you own, use host `smtp.resend.com`, port `465`, turn on **Use TLS from the start**, set username `resend`, and use a sending API key as the password. The sender address must be allowed by your provider. Other services use the same fields with their own SMTP credentials.

For port `587`, leave **Use TLS from the start** off: Merran requires STARTTLS. Both modes require encryption and valid certificates. A trusted relay can omit both username and password. Use **Remove saved SMTP credentials** to clear both; environment-locked fields must be changed in the server environment.

The equivalent environment variables are `MERRAN_EMAIL_ENABLED`, `MERRAN_SMTP_HOST`, `MERRAN_SMTP_PORT`, `MERRAN_SMTP_SECURITY` (`tls` or `starttls`), `MERRAN_SMTP_USERNAME`, `MERRAN_SMTP_PASSWORD`, and `MERRAN_EMAIL_FROM`. Setting them locks those fields in the app. Email defaults to off. Before invitation or recovery links are enabled in a future change, configure `MERRAN_PUBLIC_URL` to an address recipients can reach.

Merran generates a secret in its data directory when no explicit secret is supplied. Keep it with your backups: it protects saved credentials. Do not replace it casually.

Keep provider keys, passwords, .env files, and personal data out of public issues and repository commits.

## Remote access

For a public address, configure HTTPS at your reverse proxy or tunnel, set MERRAN_PUBLIC_URL, and configure trusted proxies to match your deployment. The supplied Compose file includes an optional Cloudflare Tunnel profile; read its comments before enabling it.

## Next steps

### Repeat setup during development (not released yet)

From a source checkout, set `MERRAN_DEV_SETUP=on` before starting the server. Each start uses a fresh temporary SQLite database and a fresh secret, even if `DATABASE_URL` normally points to Postgres. Existing accounts, files and database settings are untouched. The startup warning prints the temporary data directory. A process restart repeats actual claiming, telemetry consent and onboarding; a browser refresh keeps the current test session.

PowerShell, from the repository root:

```powershell
$env:MERRAN_DEV_SETUP = 'on'
pnpm dev
# After stopping the dev servers:
Remove-Item Env:MERRAN_DEV_SETUP
```

On a Unix shell, run `MERRAN_DEV_SETUP=on pnpm dev`. The flag is refused with `NODE_ENV=production` or `MERRAN_INSTALL_METHOD=docker`; it cannot reopen claiming on an existing installation. This tests SQLite; Postgres claiming is covered separately by server tests. A separate CLI invocation must have the flag unset and `MERRAN_DATA_DIR` pointing at the logged temporary directory to operate on that instance. For an existing account, use **Help → Show getting started and tours again** to replay guidance without starting over.

Use [troubleshooting](../troubleshooting/) for startup, connection, import, or job failures. Read [updating, backups, and recovery](../updating-and-backups/) before changing versions or restoring data.
