# Host-manager installation documentation — October 17, 2026

Added explicit TrueNAS Docker-based Apps, Dockge and Portainer Docker Standalone deployment examples to the existing installation page. Downloadable, self-contained Compose files live at apps/docs/public/deploy. No root Compose, Dockerfile, environment default, server behavior or deployment workflow changed.

## Operator deployment report — October 19, 2026

The operator reports running Merran on a TrueNAS server deployed through Dockge. Installation was straightforward, and everything used so far has worked. This report was provided during the alpha.4 documentation reconciliation. Exact TrueNAS/Dockge versions, image digest, database backend and individual workflows were not recorded, so it establishes practical installation and initial-use feedback rather than a full platform or integration test matrix.

## Evidence

October 18, 2026 follow-up: the install page is MDX with Starlight's keyboard-accessible platform tabs and copyable Code components. Previews import all six downloadable YAML files directly. Basic and advanced tabs share a platform selection. The starter .env is downloadable and rendered from the same source, and the recommended image is next during alpha, per user review, with latest intended for the first full release. README and homepage commands match. Root compose.yaml still falls back to next without an override. Existing release verification remains the baseline; the tabbed documentation does not establish acceptance of a host manager's UI or dataset ACLs.

- [TrueNAS custom apps](https://apps.truenas.com/managing-apps/installing-custom-apps/): Apps/Discover/Install via YAML, host-path datasets, setup before deployment, and the apps numeric identity 568:568.
- [TrueNAS 24.10 notes](https://www.truenas.com/docs/scale/24.10/printview/): Docker-based Apps replace the older Kubernetes system. The guide excludes CORE and older Kubernetes releases rather than suggesting Docker be manually installed on the appliance.
- [Dockge official README](https://github.com/louislam/dockge#how-to-install) and frontend/backend stack implementation: the stacks directory must have matching absolute paths inside Dockge and on its Docker host. Save a new stack first, then create its data subdirectory, then deploy. Pre-creating the stack directory before adding it can conflict with new-stack validation.
- [Portainer add stack](https://docs.portainer.io/user/docker/stacks/add) and [edit stack](https://docs.portainer.io/user/docker/stacks/edit): Docker Standalone web editor/upload, deployment, logs and updates. The example uses a stable absolute path on the endpoint, not Portainer's internal working directory or Swarm.
- Merran Dockerfile, docker/entrypoint.sh, compose.yaml and .env.example: listens on 3000; /data is persistent; root entrypoint prepares ownership then drops to PUID/PGID; supplying user bypasses this setup. Existing image health check remains inherited. Example moving tag next is documented; explicit tags can be selected.

## Boundaries

The initial minimal examples are SQLite-only; the optional-service follow-up below adds separate Postgres/Kokoro files. Existing Postgres, HTTPS and backup guides remain the expanded paths for those deployments. NAS SQLite storage is a local dataset, not an SMB/NFS mount. Bind paths must exist, ports must be free, and operators must select numeric identities/ACL permissions appropriate to the endpoint. No chmod 777, privileged mode, Docker socket mount or host networking is required by the Merran examples.

Downloading or copying the example does not preserve data by itself: actual /data host directories and generated secrets must be backed up. The same image/layout can run under a manager, but this documentation is not acceptance testing of its UI, dataset ACLs or update behavior.

## Optional-service follow-up

Added complete Postgres 18 + Kokoro CPU stacks for all three managers, with the Dockge version shown inline. App mount paths and Merran IDs match the prior minimal examples; Postgres gets its own directory and initializes as its own image user. No database or Kokoro host ports are published. db health gates Merran startup; Kokoro service-start order does not assert model readiness. Removing one optional service requires removing its dependency and relevant Merran settings, as documented. These files target fresh Postgres installs; a database URL change is not SQLite migration.

Project-file instructions persist COMPOSE_PROFILES and set both service credentials and app connection/voice settings. The install page also shows tunnel setup and distinguishes API-key/module configuration from containers. Root Compose changes are comments only; .env.example adds commented usage guidance rather than enabling anything by default. README, Postgres, media and updating guides link the procedure.

Sources: [Docker profiles](https://docs.docker.com/compose/how-tos/profiles/), [Postgres image layout](https://hub.docker.com/_/postgres), [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/), and Merran's config/voice implementation. New configuration validation is recorded below; no live Kokoro generation, Cloudflare connection, database switch or host-manager deployment is claimed.

## Validation

Initial minimal examples: Docker Compose v5.0.1 accepted all three download files with config --quiet. Each inline YAML block and its downloadable file produced identical resolved Compose JSON with an explicit shared project directory/name; image, container port, /data target and create_host_path=false were also checked. Prettier and git diff --check passed. Docs typecheck reported zero errors, warnings or hints, and the production build checked 90,808 local links/assets across 281 pages, including the new anchors and three downloadable files.

Optional-service follow-up: all three combined downloads parsed correctly, as did each one's Postgres-only, SQLite+Kokoro, and cloudflared-added variant (12 configurations). The full inline example matched the Dockge file after resolution. All eight profile combinations of the actual project Compose file resolved to the expected services, and DATABASE_URL reached Merran with the same synthetic password used by Postgres. Only synthetic values in an ignored scratch directory were used; no containers were started. Docs typecheck reported zero diagnostics; the production build and link checker passed across 281 pages and 90,844 local links/assets. Public Markdown/YAML formatting and whitespace checks passed.

Existing duplicate-404 and Node url.parse build warnings remain. No TrueNAS, Dockge, Portainer, live Postgres switch, Kokoro speech generation or Cloudflare connection was performed during this pass.

October 18 tabbed-guide validation: all six downloadable configurations passed Docker Compose configuration checks; the project Compose file plus the starter .env selected SQLite and the intended image/port/IDs. All eight optional-profile combinations resolved correctly. A new isolated Docker Desktop Linux container used the cached 0.1.0-alpha.1 image and a new app directory: readiness, setup with the original logged code, account/household creation and a saved recipe passed. The session, account, recipe and original secret survived stop/start and forced recreation with the same image and mount. This was fresh application data, not a clean machine or a cross-version upgrade. The test container/network were removed afterward.

Browser acceptance covered platform switching, arrow-key navigation, remembered selection on reload, synchronized basic/advanced tabs, legacy platform anchors, and the rendered YAML/environment copy payloads. Desktop and phone layouts were checked. Docs typecheck, tests, formatting and the production build/link checker were run; no live host-manager UI or optional provider acceptance is claimed.
