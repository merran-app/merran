# Release smoke-test evidence — October 17, 2026

Current baseline, October 19, 2026: v0.1.0-alpha.4. Public guides and the roadmap now include released SMTP recovery/invitations, onboarding, shopping and planning improvements, and live telemetry. The dated evidence below remains historical; it does not claim fresh alpha.4 image or provider verification. See [the current roadmap audit](site-roadmap-audit.md).

No real household, retailer account or provider credential was used. App ports were loopback-only. No release or site deployment was initiated.

## Operator deployment report — October 19, 2026

The operator reports running Merran on a TrueNAS server deployed through Dockge. Installation was straightforward, and everything used so far has worked. This report was provided during the alpha.4 documentation reconciliation. Exact TrueNAS/Dockge versions, image digest, database backend and individual workflows were not recorded, so it establishes practical installation and initial-use feedback rather than a full platform or integration test matrix.

## Baseline

- Main: f5129c962d632714304f299b417cb138e21ac981.
- Release: v0.1.0-alpha.1 at d0461a5eaadba4b525d001dcc1299ab0948d94d5, published 2026-10-17T22:25:37Z. Subsequent main difference is README links.
- Image: ghcr.io/merran-app/merran:0.1.0-alpha.1, digest sha256:bd4d97da003d5b8ffbc7d55ca764e40809bebfec391a614069db0a19e1ea64ae.
- Docker Desktop 4.57.0, Engine 29.1.3, Linux AMD64 containers on Windows.
- Unchanged release Compose copied to new directories/projects, pinned image, outbound minimal, telemetry off, automatic update/tool checks off.
- Scratch scripts, synthetic credentials and backups: ignored .local/docs-release-qa/. Never commit this directory.

## Observations

1. Fresh SQLite on port 33081: migrations, version and setup code logged; readiness 200. Setup created a synthetic account and household.
2. Added two recipes. Planned a two-serving recipe containing 1 cup rice and 2 cans black beans, with 1 cup rice already in pantry. Add-from-plan returned one added item and inPantry=[rice]. Checked beans, put them away, marked meal cooked: pantry emptied. Saved a four-star cooking note.
3. limit=1, offsets 0 and 1 returned distinct IDs and total=2. recipes-read key received 403 reading list. SSE ready event contained only recipes.
4. Added 3 eggs to pantry and paper towels to list. Stopped app, archived complete app directory using tar, extracted to separate empty directory/project on 33082. Login, existing API key, recipes/rating and eggs persisted.
5. Uploaded sample WebP as raw image body. Initial multipart request was correctly rejected: the photo endpoint requires raw image bytes. Took another stopped archive, restored into another empty project/directory on 33084. Existing account/API checks passed; photo GET returned 200 and bytes; secret matched byte-for-byte. No real encrypted provider credentials were tested.
6. Fresh Postgres 18 profile on 33083: readiness identified Postgres; setup and the same kitchen API workflow passed.
7. Stopped Merran. Ran pg_dump -U merran -d merran -Fc -f /tmp/merran-qa.dump in db container. Copied dump to backup storage, created empty merran_restore database and ran pg_restore -U merran -d merran_restore --no-owner --no-privileges --exit-on-error. Copied stopped app files to app-restored, pointed the app at restored database/files and restarted. Login, existing key, recipes/rating, pagination and permission denial passed. Same database service, not another physical host.
8. Ran public examples/recipe-index.mjs against restored alpha.1: two expected IDs/names/slugs, no writes.
9. Caddy 2.11.7 used tls internal, localhost:34443 and reverse_proxy merran:3000. Node HTTPS explicitly trusted the extracted local CA: homepage, readiness and authenticated recipes returned 200. Windows curl rejected unknown private-CA revocation status; verification succeeded using Node's explicit CA trust, without disabling TLS validation. Public ACME, forwarded-client identity, browser cookie/login and proxy SSE were not certified.
10. Both published Chrome/Firefox archives downloaded with root manifest.json, MV3 and expected popup/background entries. Chrome has alpha.1 version_name and sidePanel; Firefox has minimum 128 and sidebar_action. This is packaging inspection, not installation acceptance. sources.zip is not the installable build.
11. Public site HEAD returned HTTP 200, independently establishing publication.

12. On the restored SQLite test instance, a dedicated fresh recipes-read key allowed 300 requests and rejected request 301 with 429 and positive Retry-After. Revoked that test key afterward. A separate stream received a recipes change after a cooking-note write; a new connection received ready again. This does not test long-running clients or a network interruption through a proxy.

## Pending

Full UI first-week walkthrough; real website imports; interrupted jobs; real encrypted credentials; actual phones/extensions/retailers/providers; ARM64/other hosts; large datasets; public DNS/ACME; tunnel/VPN and proxy sessions; long-running clients and proxy interruption/reconnect; existing accessibility/browser gaps. See the public verification page for the same scope.

## Guide evidence

- Extension: released manifests, extension popup/sidebar/background, lib/merran.ts permissions, page extraction/actions, Walmart browser flow, web extension setup and locale strings.
- Stores: module settings, services/stores/kroger/client.ts and connection.ts, store routes, web store pages/locales. Source confirms product.compact and cart.basic:write/profile.compact scopes; live portal authorization remains untested.
- Sharing: web features/share and server share route/service. Shortcut uses imports-write and multipart file input.
- Media: module settings, UI cards/locales, video tools, photo/nutrition routes and voice services. Fixed UI sample prices are not promises in the guides.
- API: release OpenAPI, auth middleware, key-rate-limit, list schemas, events route, executable example.
- Deployment: release Compose, config/client-address middleware, Docker results and official Caddy docs. Nginx is explicitly an untested example.

## Documentation validation

Docs typecheck: 0 errors, warnings or hints. Docs settings-reference test passed. Prettier check passed. Final build produced 276 pages and checked 88,121 local links/assets. Existing duplicate-404 route and Node url.parse deprecation warnings remain. The new extension guide, release-download table and Postgres guide were sampled at phone width in the existing production preview; document width did not overflow, and the mobile Integrations navigation worked. Broader browser acceptance remains scoped above.

All four test Compose projects and the temporary Caddy container/networks were removed after testing. Bind-mounted synthetic data/backups remain in the ignored local directory. The existing site preview was reused and left running. Unrelated concurrent telemetry planning edits were preserved.
