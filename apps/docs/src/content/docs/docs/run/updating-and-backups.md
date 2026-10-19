---
title: Updating and backups
description: Preserve your data before changing Merran versions.
sidebar:
  order: 4
---

## Back up before updating

You need access to the deployment's files and container controls, and to database backup/restore tools if using Postgres. A stopped SQLite restore and Postgres logical restore were smoke-tested against **0.1.0-alpha.1** with synthetic data. See the [backup/restore walkthrough](../backup-restore/) for commands and the [verification record](../../project/release-verification/) for coverage and remaining limits.

Keep a copy of the application's complete data directory, configuration, and any externally supplied secrets.

:::note[Development testing]
`MERRAN_DEV_SETUP=on` is a source-development flag for disposable setup tests, not an update or restore option. Each start uses a new temporary SQLite database and secret; the real data directory is untouched. It is refused in production and Docker. Unset the flag to return to your normal database. See [configuration](../configuration/#repeat-setup-during-development).
:::

With the supplied SQLite Compose setup, stop Merran before copying **./data/app** so the database and its files form a consistent snapshot:

```bash
docker compose stop merran
```

Copy the directory to a separate backup location using your backup tool. Include compose.yaml and .env, store secrets securely, then restart:

```bash
docker compose start merran
```

For the standalone Docker command, the application's directory is **./data** instead. Postgres installations also need a consistent database backup; copying only the app directory is insufficient.

Automatic backups are not part of this initial guide. Arrange and verify your own backups.

A household export is not a full server backup: it does not replace accounts, server configuration, saved credentials, the database, and the original server secret. Record the running image tag or digest with each backup so you can restore the matching version.

## Update a Compose installation

:::note[Not released yet: development image builds]
The `edge` image will be published after checks pass for changes affecting the application image on main. Documentation-only changes will not publish another image. The `next` and versioned release channels are unchanged.
:::

If using the project Compose file's optional database, voice or tunnel, keep the matching `COMPOSE_PROFILES` value in `.env` (for example `postgres,voice`), or pass the same `--profile` flags when pulling and starting. The self-contained host-manager stacks have no profiles. Postgres backups need both a database dump and app files; Kokoro does not replace either. See [the complete installation examples](../../get-started/install/#optional-services-with-compose).

Read the [release notes](https://github.com/merran-app/merran/releases), make a backup, then run from the Compose directory:

The installation guide uses `:next` during alpha. Pulling and recreating installs the newest published release on that channel. If you chose a specific version tag instead, change `MERRAN_IMAGE` in `.env` or your host-manager YAML's `image` tag to your chosen release before pulling. Preserve the same data directory and original server secret throughout the update.

```bash
docker compose pull
docker compose up -d
docker compose logs --tail 100 merran
```

Open Merran and check that your household, recipes, and plan are present. Merran applies database migrations during startup.

If startup reports `ERR_MODULE_NOT_FOUND` for `zod` imported from shared telemetry, the image has a packaging defect. Update to a release containing the runtime dependency fix; pulling an unchanged defective image will not repair it. Keep the database, app files and original secret. You do not need to delete data or install packages inside the container.

## Restore

Downgrades are not supported. To return to an earlier version, restore the complete backup made before the update and use the matching image version.

Stop Merran before restoring files. Keep a copy of the current data, restore the saved data and configuration to their original paths, and start the matching version. For Postgres, restore its database backup as well.

1. Stop Merran and preserve the failed installation's data and logs separately.
2. Select a complete backup and the matching image version. Restore the complete app directory, including its `secret` file. If you supplied `MERRAN_SECRET` externally, restore that exact value instead.
3. For Postgres, restore the corresponding database backup while Merran remains stopped. Check that configuration points to the restored database.
4. Check volume mounts and file permissions. Set the intended image version in your deployment configuration, then run `docker compose up -d` for the supplied Compose setup.
5. Review `docker compose logs --tail 100 merran`. Sign in and verify the expected household, recipes, images, plan, list, and pantry. Test a saved connection if you use one, and inspect **Settings → This server → Jobs** for interrupted work that resumes.

**Expected result:** Merran opens the restored data, accounts can sign in, and saved credentials remain readable with the matching secret. If setup appears again or credentials are unreadable, stop and recheck the mount, database selection, and secret before making new data.

Test a restore on an isolated installation before relying on the backup.

Keep an isolated restore off public traffic and prevent it from making unwanted external requests or running household automation while testing. Restored settings and jobs can resume background work.

## Next steps

Authentication changes after alpha.4 also store passkeys, encrypted authenticators and OAuth grants in the database. Preserve the matching server secret and public hostname when restoring. Use the documented [authentication recovery and rotation commands](../authentication/#operator-recovery-and-backups); do not replace the secret file by hand.

For failed startup or migrations, missing data, and job errors, follow [troubleshooting](../troubleshooting/). Check [configuration](../configuration/) and the [settings reference](../settings-reference/) when moving an installation to a new address or host.
