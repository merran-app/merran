---
title: First-run setup
description: Claim a fresh server with its setup code and create your household.
---

## Find the setup code

On a fresh installation, Merran prints a setup code in its server log. For Compose:

```bash
docker compose logs merran
```

For a standalone container:

```bash
docker logs merran
```

The code prevents someone who merely finds the address from claiming an unconfigured server. Copy it from your own logs.

## Create your account

Open Merran at your server's address, enter the setup code, and follow the setup form to create your account and household. The first account is the server administrator.

Your household holds the shared recipes, plan, pantry, and shopping lists. Merran can host multiple households, and a person can belong to more than one.

## Find the right settings

- **This server** controls server-wide configuration and optional modules.
- **Household** controls the household's preferences and shared setup.
- Personal settings apply to your account.

Start with the core meal workflow. You can configure AI providers, stores, nutrition, and voice later as needed. Some features require an enabled module, external credentials, or another service.

Next: [your first week](../first-week/).
