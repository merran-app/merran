---
title: FlareSolverr
description: Import recipes from sites that turn servers away, through your own FlareSolverr, and what Merran never uses it for.
sidebar:
  order: 6
---

:::caution[Not released yet]
FlareSolverr support was built after 0.1.0-alpha.6 and isn't in a release yet. Releases up to alpha.6 ignore `MERRAN_FLARESOLVERR_URL` and have no **FlareSolverr** card. These steps describe the next release.
:::

Some recipe sites turn servers away, often with Cloudflare's "Just a moment..." check. Importing one of their links then fails with **That site turned Merran away. Type the recipe in instead.** [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) opens the page in a real browser and waits out that check. With your own FlareSolverr beside Merran, those imports can still come in.

The [browser extension](../browser-extension/) imports from these sites too, from your own browser, with no FlareSolverr. FlareSolverr covers what the extension can't: links shared from a phone, pasted links, and the API.

## What Merran uses it for

Merran asks FlareSolverr for a page only when someone imports a link and the site turned Merran away:

- **Add from link**, and pasting many links at once
- Links shared from a phone, through [Android or an iPhone Shortcut](../phone-sharing/)
- Imports through the [API](../../api/), and recipe links an AI app suggests, once someone applies them in **Review**

It never uses FlareSolverr for:

- Reading followed and suggested recipe sites, or filling starter collections. Those reads stay as Merran and follow `robots.txt`.
- Discover's AI searches.
- Photos. FlareSolverr hands back the page, not its images, so Merran asks for the photo itself. When the site turns that away too, the recipe comes in without one.

Merran checks every link before sending it to FlareSolverr, and refuses a page that FlareSolverr ended up on at a private network address.

## Before you start

- A server admin account in Merran.
- FlareSolverr, reachable from Merran's container. It needs no account or key.
- Memory to spare: FlareSolverr starts a browser for each import.

## If you already run FlareSolverr

Media setups with Prowlarr or Jackett often have FlareSolverr running already.

1. Work out an address Merran's container can reach. On the same Docker network, that's the container's name, like `http://flaresolverr:8191`. On another machine, use that machine's address, like `http://192.168.1.20:8191`. `localhost` inside Merran's container is Merran itself.
2. Open **Settings → This server → FlareSolverr**, enter the address under **Address**, and choose **Save**.
3. Choose **Test**. A message like **FlareSolverr 3.3.21 is ready.** means Merran reached it.

When FlareSolverr is in another Compose project, put Merran on its network too. `docker network ls` lists the networks; then, in Merran's `compose.yaml`:

```yaml
services:
  merran:
    networks: [default, media]

networks:
  media:
    external: true
    name: media_default # the network FlareSolverr is on
```

Recreate Merran with `docker compose up -d`, then use `http://flaresolverr:8191`, or whatever FlareSolverr's container is called.

## With Merran's compose.yaml

The project's `compose.yaml` has FlareSolverr behind the `flaresolverr` profile.

1. In `.env` beside `compose.yaml`, add:

   ```dotenv
   COMPOSE_PROFILES=flaresolverr
   MERRAN_FLARESOLVERR_URL=http://flaresolverr:8191
   ```

   If `.env` already lists profiles, add `flaresolverr` to that line instead, like `COMPOSE_PROFILES=postgres,voice,flaresolverr`.

2. Start it, and check its log:

   ```bash
   docker compose up -d
   docker compose logs --tail 50 flaresolverr
   ```

3. In **Settings → This server → FlareSolverr**, choose **Test**. The address comes from `.env`, so it's locked in Settings.

## In your own Compose file

For TrueNAS, Dockge, Portainer or a file of your own, add FlareSolverr beside Merran, and give Merran its address:

```yaml
services:
  merran:
    # ...as before, plus:
    environment:
      MERRAN_FLARESOLVERR_URL: http://flaresolverr:8191

  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    restart: unless-stopped
    environment:
      TZ: UTC
    # No published ports: only Merran talks to it.
```

Services in one Compose file share a network, so Merran reaches it by its name.

## With docker run

Put both containers on one network:

```bash
docker network create merran-net
docker network connect merran-net merran
docker run -d --name flaresolverr --network merran-net --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
```

Then set the address to `http://flaresolverr:8191`.

## Check it works

Import a link from a site that turned Merran away before, with **Add from link**.

**Expected result:** the recipe comes in, though it can take most of a minute while FlareSolverr's browser starts and waits out the check. Check its ingredients and steps against the page, as with any import. A missing photo means the site turned the photo away too.

Some checks want a person, like a puzzle to solve, and FlareSolverr can't get past those. Then the import says **That site turned Merran away, even through FlareSolverr. Import it with the browser extension, or type it in.**

## Keep it to your network

FlareSolverr's browser can reach whatever its container can, and FlareSolverr answers anything that can reach it. Don't publish its port. If you'd rather it couldn't reach other machines at home, like your router's admin page, give it a Docker network that only Merran shares.

## Be a good visitor

Sites turn servers away on purpose. Merran uses FlareSolverr only when someone asks for a recipe, one page at a time, as a browser would, and never reads sites in the background through it.

## When it doesn't work

| What you see                                                   | What to check                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Couldn't reach FlareSolverr at …**                           | FlareSolverr is running (its log), the address works from inside Merran's container, and both share a network.    |
| **That address answered, but not like FlareSolverr does.**     | The address points at something else. FlareSolverr answers on port 8191 unless you changed it.                    |
| **That site turned Merran away, even through FlareSolverr. …** | The site's check wants a person, or FlareSolverr is out of date: pull its image again. Use the extension instead. |
| **That site turned Merran away. Type the recipe in instead.**  | FlareSolverr isn't set up on this server: the card says **Off**.                                                  |

To turn FlareSolverr off, clear **Address** and choose **Save**, or remove `MERRAN_FLARESOLVERR_URL` and recreate Merran.

Next: the [settings reference](../../run/settings-reference/) for `MERRAN_FLARESOLVERR_URL`, and [import troubleshooting](../../run/troubleshooting/#an-import-fails).
