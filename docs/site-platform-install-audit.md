# Host-manager installation documentation — October 17, 2026

Added explicit TrueNAS Docker-based Apps, Dockge and Portainer Docker Standalone deployment examples to the existing installation page. Downloadable, self-contained Compose files live at apps/docs/public/deploy. No root Compose, Dockerfile, environment default, server behavior or deployment workflow changed.

## Evidence

- [TrueNAS custom apps](https://apps.truenas.com/managing-apps/installing-custom-apps/): Apps/Discover/Install via YAML, host-path datasets, setup before deployment, and the apps numeric identity 568:568.
- [TrueNAS 24.10 notes](https://www.truenas.com/docs/scale/24.10/printview/): Docker-based Apps replace the older Kubernetes system. The guide excludes CORE and older Kubernetes releases rather than suggesting Docker be manually installed on the appliance.
- [Dockge official README](https://github.com/louislam/dockge#how-to-install) and frontend/backend stack implementation: the stacks directory must have matching absolute paths inside Dockge and on its Docker host. Save a new stack first, then create its data subdirectory, then deploy. Pre-creating the stack directory before adding it can conflict with new-stack validation.
- [Portainer add stack](https://docs.portainer.io/user/docker/stacks/add) and [edit stack](https://docs.portainer.io/user/docker/stacks/edit): Docker Standalone web editor/upload, deployment, logs and updates. The example uses a stable absolute path on the endpoint, not Portainer's internal working directory or Swarm.
- Merran Dockerfile, docker/entrypoint.sh, compose.yaml and .env.example: listens on 3000; /data is persistent; root entrypoint prepares ownership then drops to PUID/PGID; supplying user bypasses this setup. Existing image health check remains inherited. Example moving tag next is documented; explicit tags can be selected.

## Boundaries

The examples are SQLite-only. Existing Postgres, HTTPS and backup guides remain the expanded paths for those deployments. NAS SQLite storage is a local dataset, not an SMB/NFS mount. Bind paths must exist, ports must be free, and operators must select numeric identities/ACL permissions appropriate to the endpoint. No chmod 777, privileged mode, Docker socket mount or host networking is required by the Merran examples.

Downloading or copying the example does not preserve data by itself: actual /data host directories and generated secrets must be backed up. The same image/layout can run under a manager, but this documentation is not acceptance testing of its UI, dataset ACLs or update behavior.

## Validation

Docker Compose v5.0.1 accepted all three download files with config --quiet. Each inline YAML block and its downloadable file produced identical resolved Compose JSON with an explicit shared project directory/name; image, container port, /data target and create_host_path=false were also checked. Prettier and git diff --check passed. Docs typecheck reported zero errors, warnings or hints, and the production build checked 90,808 local links/assets across 281 pages, including the new anchors and three downloadable files. Existing duplicate-404 and Node url.parse build warnings remain. No TrueNAS, Dockge or Portainer instance was deployed during this pass.
