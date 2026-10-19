---
title: Run with Postgres
description: Start a new Postgres installation, check database selection, and understand migration limits.
sidebar:
  order: 8
---

SQLite remains the simplest installation. Use Postgres when it suits your existing database operations. The published **0.1.0-alpha.1** image was smoke-tested with the supplied Compose Postgres 18 service on Linux AMD64 containers under Docker Desktop, including fresh setup and a logical database restore. This is not a performance or high-availability certification.

## Before you start

Use Docker Compose, a new installation directory, and a backup location. For an existing SQLite household, read [moving an existing installation](#moving-an-existing-installation) first. Merely setting `DATABASE_URL` does not transfer SQLite data.

## Start a new installation

1. Download `compose.yaml` from the [release tag](https://github.com/merran-app/merran/blob/v0.1.0-alpha.4/compose.yaml), rather than mixing a pinned image with an unreviewed future Compose file.
2. Create `.env` beside it:

   ```dotenv
   MERRAN_IMAGE=ghcr.io/merran-app/merran:0.1.0-alpha.4
   COMPOSE_PROFILES=postgres
   POSTGRES_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_URL_SAFE_PASSWORD
   DATABASE_URL=postgres://merran:REPLACE_WITH_THE_SAME_PASSWORD@db:5432/merran
   ```

   Use the same password in both places. URL-encode reserved characters in the URL's password, or generate a long random password using URL-safe characters. Keep `.env` private and out of source control. Changing `POSTGRES_PASSWORD` does not change a role's password in an already initialized database.

3. Start the profile:

   ```bash
   docker compose --profile postgres up -d
   docker compose --profile postgres ps
   docker compose logs --tail 100 merran
   ```

4. Wait for the database to become healthy and Merran to finish migrations. Check `http://localhost:3000/api/health/ready`; it should report `database: "postgres"` and `status: "ready"`.
5. Complete [account setup](../../get-started/setup/) using the setup code in the log. After signing in, **Settings → This server** should identify Postgres.

**Expected result:** Merran stores relational data in Postgres and keeps app files and its secret in `./data/app`. The supplied Postgres 18 service stores its files under `./data/postgres`, mounted at `/var/lib/postgresql`. Keep this version-specific mount; older Postgres examples often use a different directory. The database has no host port published by this Compose file.

`COMPOSE_PROFILES=postgres` keeps the database included in later Compose commands without repeating `--profile postgres`. To include Kokoro too, use `COMPOSE_PROFILES=postgres,voice` and the voice settings in [the installation guide](../../get-started/install/#optional-services-with-compose). For TrueNAS, Dockge or Portainer, that guide includes complete stacks without profile flags or an external `.env` file.

## Use an existing database service

Create a dedicated database and login on your Postgres server, provide the privileges needed to create and migrate Merran's schema, and set `DATABASE_URL` to that database. Start only Merran; do not enable the local `postgres` profile unnecessarily. The hostname must be reachable from the Merran container. `localhost` inside that container refers to itself.

Follow your database provider's TLS requirements and credential-handling guidance. External managed databases and certificate configurations were not included in the release smoke test. Verify readiness, migrations, and a backup/restore before moving real data.

## Moving an existing installation

There is no documented, verified in-place SQLite-to-Postgres migration command in alpha.4. Setting `DATABASE_URL` selects another database; if it is empty, Merran offers setup. It does not mean your original SQLite data was deleted.

Keep the original deployment and a full backup. For household recipe portability, use the supported household export/import on a separately initialized destination and review its supported contents. A household export is not a server migration: do not assume it transfers accounts, credentials, every setting, or all operational history. A complete cross-database migration needs a separately tested procedure before retiring the source.

## Troubleshooting and recovery

| Symptom                        | Check                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Merran starts on SQLite        | `DATABASE_URL` did not reach the app. Inspect the `.env` location and recreate Merran. Avoid printing secrets in shared diagnostics.          |
| Database never becomes healthy | Database logs, password on first initialization, disk permissions, storage space, and the Postgres 18 volume path.                            |
| Connection refused             | Hostname/service name, port 5432, network reachability, and profile selection.                                                                |
| Authentication fails           | URL encoding and the actual database role password; changing `.env` alone does not alter an existing role.                                    |
| Setup unexpectedly appears     | Stop and inspect the database name and app mount. Do not create a replacement household until the intended data is located.                   |
| Migration fails                | Preserve logs and backup, keep the app stopped, and follow [troubleshooting](../troubleshooting/). Do not downgrade over a migrated database. |

Use the [backup and restore walkthrough](../backup-restore/) for both the logical database dump and app files. Changing a Postgres major version is a database upgrade requiring its own plan; it is not a routine Merran image update.
