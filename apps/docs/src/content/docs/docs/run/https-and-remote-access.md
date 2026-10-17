---
title: HTTPS and remote access
description: Put Merran behind Caddy or a reverse proxy, configure its public address, and check live connections.
sidebar:
  order: 7
---

Use HTTPS for remote access, phone installation/sharing, and browser capabilities that need a secure context. Your app server is separate from the public documentation at `merran.app`.

**Verification scope:** alpha.1 was tested through Caddy 2.11.7 using a locally issued certificate trusted explicitly by the test client. The homepage, readiness, and authenticated recipe requests passed. Public DNS/certificate issuance, Cloudflare Tunnel, and VPN deployment have not been tested by this audit. Treat those as operator setup steps to verify, not a claim that every deployment is certified.

## Before you start

Have a working local installation and a [verified backup](../backup-restore/). Choose one stable hostname, such as `food.example.com`. Keep registration restricted and use household invitations as appropriate. A proxy does not replace Merran sign-in.

Set `MERRAN_PUBLIC_URL=https://food.example.com` in `.env`, then recreate Merran. This is the address used for generated links and integrations such as Kroger's callback. Use a dedicated hostname at `/`; a subdirectory installation such as `/merran` is not covered.

## Caddy on the Docker network

Add a Caddy service to the supplied Compose file, sharing its default network:

```yaml
caddy:
  image: caddy:2
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
    - ./data/caddy:/data
    - ./data/caddy-config:/config
  depends_on:
    - merran
```

Create `Caddyfile` beside Compose:

```text
food.example.com {
    reverse_proxy merran:3000
}
```

Point the hostname's DNS at the proxy, arrange inbound ports 80 and 443 according to your network, and avoid another service binding those ports. Remove the Merran service's published `ports` entry when only the proxy should reach it; containers on the network can still use `merran:3000`. Keep Caddy's `/data` persistent so certificates survive recreation.

```bash
docker compose up -d
docker compose logs --tail 100 caddy merran
```

**Expected result:** Caddy obtains a certificate for a reachable public hostname and forwards requests to Merran. Public certificate issuance depends on DNS, network access, and certificate authority requirements; consult [Caddy's HTTPS documentation](https://caddyserver.com/docs/quick-starts/https). The local test used `tls internal` and an explicitly trusted test CA instead of issuing a public certificate. Do not disable certificate verification to make a phone or browser work.

For a proxy running directly on the same host rather than in Docker, publish Merran only on loopback (`MERRAN_PORT=127.0.0.1:3000`) and use `reverse_proxy 127.0.0.1:3000`. A containerized proxy must use the Docker service address, not its own loopback.

## Trust only your proxy

`MERRAN_TRUSTED_PROXIES` is a comma-separated list of IP addresses or CIDR ranges whose forwarded client addresses Merran accepts. Without it, forwarded addresses are ignored for client identification and rate limiting.

Determine the immediate proxy's address as seen by Merran. On Docker, give the proxy a stable address on a dedicated private network, or trust only that controlled network's narrow range. Do not copy a broad private-network range just because an example uses Docker, and do not trust arbitrary internet clients. Recreate Merran after environment changes. Host loopback publishing through Docker may appear to Merran as a bridge/gateway address rather than `127.0.0.1`.

The proxy must preserve the original host and protocol and set forwarded client information. Verify client-address behavior in your topology rather than assuming that HTTPS alone configures it. Caddy's [reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) describes its forwarded-header behavior.

## Other reverse proxies

For Nginx, an equivalent upstream location inside a server block with your own TLS configuration is:

```nginx
location / {
    proxy_pass http://merran:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 300s;
    client_max_body_size 30m;
}
```

This is a configuration example, not a tested Nginx deployment recipe. Use the correct upstream for your network and configure certificates separately. The proxy body limit must accommodate the intended upload; Merran's own per-endpoint limits still apply. Do not cache authenticated API responses. Live events need streaming without buffering and timeouts longer than the roughly 25-second SSE keepalive interval.

## Cloudflare Tunnel or a private network

The supplied Compose file includes a `tunnel` profile. Create a tunnel in your Cloudflare account, route the chosen hostname to `http://merran:3000`, store its token as `CLOUDFLARE_TUNNEL_TOKEN`, set `MERRAN_PUBLIC_URL`, and start:

```bash
docker compose --profile tunnel up -d
```

Keep the token private. Configure trusted proxies for the actual immediate proxy path and verify sign-in and streaming. An additional access gateway can affect extension calls, Shortcuts, and API clients; test each path. Cloudflare is an external intermediary for traffic routed through it. See the [official tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/).

A private VPN is another option: make the server reachable only to authorized devices, then provide an HTTPS hostname/certificate trusted by those devices. A VPN alone does not turn an HTTP origin into a browser secure context. No tunnel or VPN account is needed for local-only use.

## Verify before relying on remote access

1. Load the HTTPS hostname without certificate warnings, sign in, and reload.
2. Check `/api/health/ready` and open a recipe/photo.
3. Open the same household on two devices and confirm a list change appears on the other. Test [API live events](../../api/live-events/) if the proxy appears to buffer updates.
4. Test an import/upload within the documented size limits.
5. Test from outside your home network and reconnect the extension or Shortcut to the canonical hostname.
6. For Kroger, update the registered callback URI to exactly match the new address.

For 502 errors, check the upstream container/network and readiness. For sign-in loops, check the public URL, host/protocol headers, and cookie handling. For uploads rejected before Merran logs them, check proxy limits. For delayed updates, check buffering/timeouts. Continue with [troubleshooting](../troubleshooting/).
