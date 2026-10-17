---
title: Install Merran
description: Run Merran with Docker Compose or a single Docker container.
---

Merran runs as one container, with SQLite included. You need Docker, disk space for your recipes and photos, and a browser that can reach the server. Docker Compose is recommended for keeping the configuration in one file.

AI keys and a separate database are optional. The steps below assume a shell on the machine running Docker.

Fresh SQLite and Postgres Compose installations of **0.1.0-alpha.1** were smoke-tested on Linux AMD64 containers under Docker Desktop. See [release verification](../../project/release-verification/) for the exact scope; this does not verify every device, provider, or optional integration. To reproduce that version, download Compose and `.env.example` from the `v0.1.0-alpha.1` tag and set `MERRAN_IMAGE=ghcr.io/merran-app/merran:0.1.0-alpha.1` in `.env`. The commands below follow `main` and the moving `next` image tag.

## Docker Compose

Create a directory for the configuration and persistent data:

```bash
mkdir merran
cd merran
```

Download the project's Compose file and optional environment settings:

```bash
curl -fsSLO https://raw.githubusercontent.com/merran-app/merran/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/merran-app/merran/main/.env.example
```

Review the files, then start Merran:

```bash
docker compose up -d
docker compose logs merran
```

Open **http://localhost:3000** on the Docker host, or **http://YOUR-SERVER:3000** from another device on your network.

The supplied Compose file stores Merran's data under **./data/app**. Keep this directory and the configuration files when recreating the container.

## A single Docker container

Create a data directory first, then run:

```bash
mkdir data
docker run -d --name merran --restart unless-stopped -p 3000:3000 -v ./data:/data ghcr.io/merran-app/merran:next
docker logs merran
```

This form stores the application's data directly in **./data**.

## Choose an image

- **next** follows the newest published release, including alpha releases.
- **edge** follows development on main.
- A specific release tag keeps an installation on that version.

The **latest** tag is reserved for releases from 0.1.0 onward. During alpha, use next or an existing explicit release tag. See [published releases](https://github.com/merran-app/merran/releases) for available versions.

## If the page does not open

Check that the container is running with Docker's container list, then inspect its logs. Confirm that port 3000 is available and your firewall permits access from your device. If you change MERRAN_PORT in the Compose environment file, use that port in the browser.

Continue with [first-run setup](../setup/).
