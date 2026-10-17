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

Merran generates a secret in its data directory when no explicit secret is supplied. Keep it with your backups: it protects saved credentials. Do not replace it casually.

Keep provider keys, passwords, .env files, and personal data out of public issues and repository commits.

## Remote access

For a public address, configure HTTPS at your reverse proxy or tunnel, set MERRAN_PUBLIC_URL, and configure trusted proxies to match your deployment. The supplied Compose file includes an optional Cloudflare Tunnel profile; read its comments before enabling it.

## Next steps

Use [troubleshooting](../troubleshooting/) for startup, connection, import, or job failures. Read [updating, backups, and recovery](../updating-and-backups/) before changing versions or restoring data.
