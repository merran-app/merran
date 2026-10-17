# Public site implementation

The public site lives in apps/docs and uses Astro, Starlight, and the supplied Merran landing-page export. GitHub Actions builds it; GitHub Pages hosts the static output. A live demo needs separate hosting.

## First milestone

- [x] Separate workspace package and local development command.
- [x] Import the existing landing-page design and browser interactions.
- [x] Replace placeholder navigation with documentation destinations.
- [x] Bundle fonts locally.
- [x] Add installation, setup, and first-week guides.
- [x] Add initial configuration, update, and backup instructions.
- [x] Generate API reference from the committed OpenAPI schema; expose its download.
- [x] Build the site and validate local links in CI.
- [ ] Verify installation and first-week instructions on a fresh released container.
- [ ] Audit every marketing claim and comparison against the intended release.
- [ ] Review homepage keyboard and mobile behavior.
- [ ] Configure the domain and GitHub Pages; publish after the launch review.

## Remaining page inventory

| Area | Pages | Priority | Source |
| --- | --- | --- | --- |
| Product | Dedicated feature overview and links from each demo to its guide | P0 | features.md, verified app |
| Use | Recipes/imports, plan, list, pantry, cook mode | P0 | Verified app workflows |
| AI | Provider setup, key ownership, limits, costs, proposal review | P0 | Platform plan and implementation |
| Run | Troubleshooting, household roles, generated settings reference | P0 | Server code, operations plan |
| API | Expanded permissions/conventions, pagination/errors, live events | P0 | OpenAPI and middleware |
| Project | Privacy/external services, support, credits, releases | P0 | Project policies and actual releases |
| Integrations | Extension, stores, voice, phone sharing | P1 | Module code, extension README |
| Run | Postgres and migration, reverse proxies, remote access | P1 | Tested deployment recipes |
| Contribute | Architecture, tests, adding stores/importers/providers | P1 | Repository conventions |
| Integrations | Webhooks and MCP guides | P2 | Implementation when shipped |

P0 is needed for a complete public launch, P1 follows the essentials, and P2 depends on product work.

## Release and content policy

The current site is a development foundation. Do not present it as release-verified documentation until the milestone review is complete. The initial edition should describe the current published alpha; development-only and experimental behavior must be labeled.

Keep planning and decision records in the repository's docs directory. Write public tutorials as complete tasks. Generate technical reference from code, and update affected guides in the same change as behavior.

The homepage was supplied as a self-contained HTML export. Its header, main content, footer, icon definitions, styles, and script are now separate source files. Continue extracting individual sections into Astro components as their content changes.

## Validation and deployment

Run the docs typecheck and build. The build validates local links, fragments, and assets. Review desktop and mobile layouts, theme switching, tabs, cooking controls, and search in the browser.

The Pages workflow builds PRs and main, but deployment is manual and restricted to main. Set SITE_URL and SITE_BASE repository variables when using a project Pages URL. For merran.app use SITE_URL=https://merran.app and SITE_BASE=/. Enable GitHub Actions as the repository Pages source and configure DNS/custom domain before publishing.

Public text is intended to use CC BY 4.0 under the existing project plan; the code remains AGPL-3.0-or-later.
