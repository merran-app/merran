---
title: Install Merran
description: Run Merran with Docker Compose, TrueNAS, Dockge, Portainer, or a single container.
---

Merran runs as one container, with SQLite included. You need Docker, disk space for your recipes and photos, and a browser that can reach the server. Docker Compose is recommended for keeping the configuration in one file.

AI keys and a separate database are optional. The Docker commands below use a shell on the Docker host; the TrueNAS, Dockge, and Portainer examples use their management interfaces.

:::note[Setup improvements not released yet]
New builds show a searchable **MERRAN SETUP CODE** banner after listening. If it is buried, run `docker compose exec merran merran setup-code` (or `docker exec merran merran setup-code` for a standalone container). Older images require the original log line. Follow [first-run setup](../setup/) for passwords, household preferences and recovery.
:::

Fresh SQLite and Postgres Compose installations of **0.1.0-alpha.1** were smoke-tested on Linux AMD64 containers under Docker Desktop. See [release verification](../../project/release-verification/) for the exact scope; this does not verify every device, provider, or optional integration. To reproduce that version, download Compose and `.env.example` from the `v0.1.0-alpha.1` tag and set `MERRAN_IMAGE=ghcr.io/merran-app/merran:0.1.0-alpha.1` in `.env`. The commands below follow `main` and the moving `next` image tag.

## Choose your installation

| Host or manager                   | Start here                                              |
| --------------------------------- | ------------------------------------------------------- |
| Linux server with Docker Compose  | [Docker Compose](#docker-compose)                       |
| TrueNAS with Docker-based Apps    | [TrueNAS custom app](#truenas-custom-app)               |
| Dockge (sometimes called Dockage) | [Dockge stack](#dockge-stack)                           |
| Portainer on Docker Standalone    | [Portainer stack](#portainer-stack)                     |
| Docker CLI                        | [A single Docker container](#a-single-docker-container) |

The minimal manager examples below are self-contained **SQLite** deployments: no external `.env`, database service, or Compose profile is needed. Their UI procedures follow the linked platform documentation; deployment through those actual interfaces has not yet been acceptance-tested for Merran.

Want Postgres, Kokoro, or a tunnel? Continue with [Optional services with Compose](#optional-services-with-compose) after choosing your base installation.

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

## Before using a host manager

- **Choose a dedicated data directory on the Docker host.** Everything mounted at `/data` belongs to Merran, including SQLite, uploaded files, and the generated secret. Use local storage for SQLite, such as a local ZFS dataset on TrueNAS, rather than an SMB/NFS-mounted database directory.
- **Check ownership.** Merran's entrypoint prepares `/data` as root, then runs as `PUID:PGID` (default `1000:1000`). It can change ownership within that mount, so mount only Merran's directory. Choose IDs permitted by your host's ownership/ACL configuration; they are not your Merran login. These examples retain the image's entrypoint and do not set Compose `user:`.
- **Choose a free host port.** In `"3000:3000"`, change the left number if needed, for example `"3010:3000"`. Leave the container port on the right as `3000`.
- **Choose the image and time zone.** Examples use `next` and `UTC`; use an existing explicit release tag for a pinned installation, and your preferred IANA time zone if needed.

The bind mounts use `create_host_path: false`: a missing path fails deployment instead of silently creating a directory in the wrong place. Create it first. An empty directory on a different host path starts a fresh Merran; it does not recover the old installation.

## TrueNAS custom app

Use the **Docker-based Apps** system introduced in TrueNAS SCALE 24.10, not TrueNAS CORE or the older Kubernetes app system. Prepare an Apps pool first. See [TrueNAS's custom-app instructions](https://apps.truenas.com/managing-apps/installing-custom-apps/) and [24.10 platform notes](https://www.truenas.com/docs/scale/24.10/printview/) for the applicable workflow.

1. Create a dedicated dataset, for example `tank/apps/merran`, with host path `/mnt/tank/apps/merran`. Replace `tank` with your pool. Grant the intended application identity write access and traversal through parent directories. The example uses `568:568` (`apps`); adjust both IDs and permissions if you use another identity.
2. Open **Apps → Discover Apps → ⋮ → Install via YAML**. Give the app the name `merran`.
3. Paste the following Compose file, changing the dataset path, IDs, host port, and time zone as needed. Save to deploy.

<a href="../../../deploy/merran-truenas.compose.yaml" download="merran-truenas.compose.yaml">Download the TrueNAS Compose example</a>

```yaml
services:
  merran:
    image: ghcr.io/merran-app/merran:next
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: UTC
      PUID: "568"
      PGID: "568"
      # MERRAN_PUBLIC_URL: https://food.example.com
    volumes:
      - type: bind
        source: /mnt/tank/apps/merran
        target: /data
        bind:
          create_host_path: false
```

Open the installed app's container logs to find the setup code. From another device, visit **http://YOUR-NAS-IP:3000** (or the host port you chose), then follow [first-run setup](../setup/).

Use TrueNAS's app editor for later configuration changes and its image-update action when following `next`. Preserve the dataset and exported YAML when recreating the app.

## Dockge stack

These steps assume Dockge is already running. Its default stacks directory is `/opt/stacks`; Dockge's own volume mapping must expose that directory at the **same absolute path** inside its container and on the Docker host. This is a [Dockge requirement](https://github.com/louislam/dockge#how-to-install), including when Dockge itself runs on a NAS.

1. In Dockge, create a new stack named **merran**, paste the YAML below, and **save it without deploying**. Dockge creates the stack directory. Change `PUID`/`PGID` to your chosen host identity.
2. On the Docker host, create the stack's data directory:

   ```bash
   sudo mkdir -p /opt/stacks/merran/data
   ```

3. If your configured stacks directory differs, create `merran/data` under that directory instead. Deploy the saved stack. The `./data` mount resolves beside this stack's Compose file, so the default path is `/opt/stacks/merran/data`.

<a href="../../../deploy/merran-dockge.compose.yaml" download="merran-dockge.compose.yaml">Download the Dockge Compose example</a>

```yaml
services:
  merran:
    image: ghcr.io/merran-app/merran:next
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: UTC
      PUID: "1000"
      PGID: "1000"
      # MERRAN_PUBLIC_URL: https://food.example.com
    volumes:
      - type: bind
        source: ./data
        target: /data
        bind:
          create_host_path: false
```

Read the setup code in the stack logs, then open **http://YOUR-DOCKER-HOST:3000**. Use Dockge's image-update controls to pull and recreate this stack when updating. Keep its `data` directory and Compose file.

If Dockge runs on TrueNAS, use a dataset-backed stacks directory or replace this mount's `source` with an absolute dedicated dataset path as in the TrueNAS example. Give `PUID`/`PGID` access to that path. The storage belongs to the Docker host managing the stack, not the computer displaying Dockge.

## Portainer stack

This example targets **Docker Standalone**, not Swarm. Create `/srv/merran/data` on the selected Docker endpoint first, or choose an existing dedicated path. For a TrueNAS endpoint, use its `/mnt/POOL/...` dataset path instead. Set IDs for that endpoint's permitted identity.

Open **Stacks → Add stack → Web editor**, name it `merran`, paste the following YAML, and choose **Deploy the stack**. Portainer also accepts a Compose file through **Upload**. See [Portainer's stack instructions](https://docs.portainer.io/user/docker/stacks/add).

<a href="../../../deploy/merran-portainer.compose.yaml" download="merran-portainer.compose.yaml">Download the Portainer Compose example</a>

```yaml
services:
  merran:
    image: ghcr.io/merran-app/merran:next
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: UTC
      PUID: "1000"
      PGID: "1000"
      # MERRAN_PUBLIC_URL: https://food.example.com
    volumes:
      - type: bind
        source: /srv/merran/data
        target: /data
        bind:
          create_host_path: false
```

Find the setup code in the `merran` service container's logs and open **http://YOUR-DOCKER-HOST:3000**. To update a web-editor stack, open its **Editor**, choose **Update the stack**, and enable the image re-pull option if following a moving tag. See [Portainer's update instructions](https://docs.portainer.io/user/docker/stacks/edit).

The absolute bind path makes persistence independent of Portainer's internal stack directory. Keep that directory and the YAML when redeploying.

## Optional services with Compose

Choose the services you actually want. Postgres replaces SQLite; Kokoro reads cooking steps aloud; neither is needed for core recipes, planning, or shopping.

| Setup                     | What to run                           | What to configure in Merran                                      |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| SQLite + device speech    | `merran` only                         | Nothing additional                                               |
| Postgres                  | `merran` + `db`                       | `DATABASE_URL`                                                   |
| Self-hosted Kokoro speech | `merran` + `kokoro`                   | `MERRAN_VOICE=kokoro` and `MERRAN_KOKORO_URL=http://kokoro:8880` |
| Both                      | `merran` + `db` + `kokoro`            | Database URL and voice settings                                  |
| Cloudflare Tunnel         | Add `cloudflared` to one of the above | Public hostname, tunnel token, and trusted-proxy configuration   |

**Existing SQLite users:** adding Kokoro can use your existing data. Selecting Postgres does **not** migrate that data: it connects Merran to another database. Use the combined Postgres examples for a **fresh installation**; for an existing household, first read [migration limits](../../run/postgres/#moving-an-existing-installation) and keep your original installation and backup.

### Project Compose file: enable the profiles

This method uses the full `compose.yaml` downloaded in [Docker Compose](#docker-compose), not one of the smaller host-manager files. The full file already defines `db`, `kokoro`, and `cloudflared`, behind profiles.

For a **new Postgres + Kokoro installation**, edit `.env` beside `compose.yaml`. Replace the existing password line rather than adding a duplicate, and add these values:

```dotenv
COMPOSE_PROFILES=postgres,voice
POSTGRES_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_HEX_PASSWORD
DATABASE_URL=postgres://merran:REPLACE_WITH_A_LONG_RANDOM_HEX_PASSWORD@db:5432/merran
MERRAN_VOICE=kokoro
MERRAN_KOKORO_URL=http://kokoro:8880
```

Generate a random password with a password manager or `openssl rand -hex 24`, and replace **both** password placeholders with the same value. Hex avoids reserved URL characters. Keep `.env` private. Then run:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail 100 db kokoro merran
```

Keeping `COMPOSE_PROFILES` in `.env` also enables those services during later `pull`, `up`, and `down` commands. Alternatively, supply `--profile postgres --profile voice` each time. See [Docker's profile behavior](https://docs.docker.com/compose/how-tos/profiles/).

- **Postgres only:** use `COMPOSE_PROFILES=postgres`, keep the password/database URL, and omit the two voice settings.
- **Kokoro with existing SQLite:** use `COMPOSE_PROFILES=voice` and the two voice settings; leave `DATABASE_URL` unset.
- **Postgres and Kokoro:** use the complete settings block above.

The project file uses `./data/app` for Merran and `./data/postgres` for Postgres. Only Merran's port 3000 is published; services reach each other by Docker names `db` and `kokoro`, not `localhost`. The `.env` file supplies both Compose substitutions and Merran's environment through the project's `env_file` entry. These instructions do not make the smaller SQLite examples gain additional services automatically.

### TrueNAS, Dockge, or Portainer: complete stack

For UI-managed stacks, use a full file with **no profiles or external `.env` dependency**. Choose the matching download, replace both password placeholders, and set paths/IDs before deploying:

| Manager   | Download                                                                                | Merran data             | Postgres data                    |
| --------- | --------------------------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| TrueNAS   | [Postgres + Kokoro YAML](../../../deploy/merran-truenas-postgres-kokoro.compose.yaml)   | `/mnt/tank/apps/merran` | `/mnt/tank/apps/merran-postgres` |
| Dockge    | [Postgres + Kokoro YAML](../../../deploy/merran-dockge-postgres-kokoro.compose.yaml)    | `./data`                | `./postgres`                     |
| Portainer | [Postgres + Kokoro YAML](../../../deploy/merran-portainer-postgres-kokoro.compose.yaml) | `/srv/merran/data`      | `/srv/merran/postgres`           |

The **Dockge version** is shown below. It is a complete replacement for the minimal stack, not another `services:` block to append to it:

```yaml
services:
  merran:
    image: ghcr.io/merran-app/merran:next
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      TZ: UTC
      PUID: "1000"
      PGID: "1000"
      DATABASE_URL: postgres://merran:REPLACE_WITH_A_LONG_RANDOM_HEX_PASSWORD@db:5432/merran
      MERRAN_VOICE: kokoro
      MERRAN_KOKORO_URL: http://kokoro:8880
      # MERRAN_PUBLIC_URL: https://food.example.com
    volumes:
      - type: bind
        source: ./data
        target: /data
        bind:
          create_host_path: false
    depends_on:
      db:
        condition: service_healthy
      kokoro:
        condition: service_started

  db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_USER: merran
      POSTGRES_DB: merran
      POSTGRES_PASSWORD: REPLACE_WITH_A_LONG_RANDOM_HEX_PASSWORD
    volumes:
      - type: bind
        source: ./postgres
        target: /var/lib/postgresql
        bind:
          create_host_path: false
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U merran -d merran"]
      interval: 5s
      timeout: 5s
      retries: 10

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    restart: unless-stopped
    # Internal port 8880 only; no GPU or host port required for this example.
```

1. **Prepare storage.** For TrueNAS, create two dedicated local datasets and replace `tank` with your pool. Allow the Merran identity to use its app dataset; Postgres manages its own data ownership, so do not apply Merran's UID to the database dataset. Its startup must be able to initialize and write that dataset. For Dockge, save the stack first, then create `data` and `postgres` beside its Compose file. For Portainer, create both directories on the selected endpoint.
2. **Edit the file.** Replace both password placeholders with the same random hex password, choose permitted Merran `PUID`/`PGID`, and adjust host port/time zone. The database does not use Merran's `PUID`/`PGID` variables. No `5432` or `8880` host mapping is needed.
3. **Deploy the whole stack** using [your manager's steps](#choose-your-installation). The database health check gates Merran startup. Kokoro's container may be started before its model is ready; wait for its logs to show it is serving before testing speech.
4. **Verify Postgres.** Open `http://YOUR-SERVER:3000/api/health/ready` (with your chosen port). Expect `status: "ready"` and `database: "postgres"`, then use Merran's setup code from its logs.
5. **Verify Kokoro.** In **Settings → This server → Voice**, check the provider/address and use **Hear …** to preview a voice. Environment-set values are managed by Compose; change them there and recreate Merran. Kokoro produces speech audio; microphone commands still depend on HTTPS and browser support.

To use **Postgres without Kokoro**, remove the `kokoro` service, its `depends_on` entry, and the two voice environment values. To use **Kokoro with SQLite**, remove the `db` service, its dependency, and `DATABASE_URL`; preserve Merran's existing `/data` mount. There is no automatic cross-database migration in either edit.

Kokoro uses the CPU image in this example, so no GPU/device mapping is required. It adds image/model storage and CPU/RAM use; startup and speech speed depend on the host. See [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) for image/platform options; use a tested release tag if you need a fixed version. If speech falls back to the device, inspect the Kokoro logs and confirm `http://kokoro:8880` is reachable from Merran. The [voice guide](../../integrations/optional-modules/#server-voices) covers playback and provider troubleshooting.

The Postgres 18 image mounts at `/var/lib/postgresql`, not the older `/var/lib/postgresql/data` layout. Keep this major version and mount together; see the [official image notes](https://hub.docker.com/_/postgres). Once initialized, changing the Compose password does not change the database role's password. Back up Postgres with a database dump **and** Merran's app files; do not use the SQLite-only directory-backup procedure for this stack.

### Optional Cloudflare Tunnel

For the **project Compose file**, [create a remotely managed tunnel in Cloudflare](https://developers.cloudflare.com/tunnel/get-started/), set its published hostname's service to `http://merran:3000`, and add these values to `.env`:

```dotenv
# Keep any existing profiles: add tunnel to the comma-separated list.
COMPOSE_PROFILES=postgres,voice,tunnel
CLOUDFLARE_TUNNEL_TOKEN=REPLACE_WITH_YOUR_TUNNEL_TOKEN
MERRAN_PUBLIC_URL=https://food.example.com
```

If using SQLite/device speech, use `COMPOSE_PROFILES=tunnel` instead. Run `docker compose up -d` to start the connector and recreate Merran with its public URL. The hostname must belong to your configured tunnel; `food.example.com` is a placeholder.

For a **UI-managed file**, add this service under its existing `services:` key, alongside `merran`, `db`, and/or `kokoro`:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  restart: unless-stopped
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: REPLACE_WITH_YOUR_TUNNEL_TOKEN
  depends_on:
    - merran
```

Indent this service two spaces to match `merran`. Add `MERRAN_PUBLIC_URL: https://food.example.com` under **Merran's** `environment`, using your real hostname. Keep the token private. Both containers must share the stack's network for `merran:3000` to resolve. Configure trusted proxies and verify sign-in/live updates using [HTTPS and remote access](../../run/https-and-remote-access/); starting a connector alone does not finish DNS/hostname/proxy setup.

### Other optional features

Most modules need settings or credentials, rather than another Compose container:

| Feature                              | Installation/configuration                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI imports, assistant, and discovery | Add supported server/household provider keys through [AI setup](../../run/ai-setup/). Postgres or Kokoro does not provide an AI model.                                                             |
| Nutrition                            | Add a USDA key and/or eligible AI through [Nutrition](../../integrations/optional-modules/#nutrition).                                                                                             |
| Video import                         | The Merran image includes `yt-dlp` and `ffmpeg`; configure the module and AI through [Video imports](../../integrations/optional-modules/#video-imports). No separate tools container is required. |
| Generated photos                     | Enable the module and an eligible image-provider key through [AI recipe photos](../../integrations/optional-modules/#ai-recipe-photos).                                                            |
| OpenAI speech                        | Configure an eligible key and choose OpenAI in Voice; no Kokoro container is needed. See [server voices](../../integrations/optional-modules/#server-voices).                                      |
| Kroger / experimental Walmart        | Follow [Kroger setup](../../integrations/kroger/) or [Walmart setup](../../integrations/walmart/); Walmart also uses the browser extension.                                                        |

These are additional setup paths, not a reason to enable every module. The environment-variable [settings reference](../../run/settings-reference/) lists the supported names. Compose parsing is checked for the examples; the new combined stack and host-manager interfaces have not received live provider/device acceptance testing.

## Backups, updates, and HTTPS

Before an update, stop Merran and back up the **whole directory mounted at `/data`**, plus your Compose configuration. For the examples above, those directories are:

| Example                 | Host directory            |
| ----------------------- | ------------------------- |
| TrueNAS                 | `/mnt/tank/apps/merran`   |
| Dockge (default layout) | `/opt/stacks/merran/data` |
| Portainer               | `/srv/merran/data`        |

Adapt the [backup and restore walkthrough](../../run/backup-restore/) to your actual mount path. For a consistent SQLite dataset snapshot, stop Merran first; keep a separate backup and verify a restore. Recreating a container with the same data does not replace backing it up. Follow [updating and backups](../../run/updating-and-backups/) before changing image versions.

For remote access, follow [HTTPS and remote access](../../run/https-and-remote-access/) and set `MERRAN_PUBLIC_URL` to the address people actually use. The commented `food.example.com` value is a placeholder, not a working hostname. HTTP on your LAN is enough to begin setup; phone installation/sharing and some browser features need HTTPS.

For Postgres and/or Kokoro, use [the complete optional-service setup](#optional-services-with-compose). The [Postgres guide](../../run/postgres/) adds external-database and migration details. The minimal host-manager examples remain SQLite-only.

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

- **Bind source path does not exist:** create the directory on the selected Docker host or correct the YAML path. A path on your laptop is not a path on a remote NAS.
- **Permission denied / operation not permitted:** confirm dataset ACLs, parent traversal, and matching `PUID`/`PGID`. A read-only dataset or ACL that prevents startup ownership changes needs host-side correction; avoid granting access to the whole pool.
- **Address already in use:** change only the published host port, then recreate the container and use that port in your URL.
- **Setup appears again after redeploy:** check the actual `/data` bind source before creating another account. You may have mounted an empty directory rather than your existing installation.

Continue with [first-run setup](../setup/).
