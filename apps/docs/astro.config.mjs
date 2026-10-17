import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi"

export default defineConfig({
  site: process.env.SITE_URL || "https://merran.app",
  base: process.env.SITE_BASE || "/",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Merran",
      description:
        "Install, use, and build on Merran, the self-hosted meal planner.",
      logo: { src: "./src/assets/mark.svg", replacesTitle: false },
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/merran-app/merran",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/merran-app/merran/edit/main/apps/docs/",
      },
      customCss: ["./src/styles/docs.css"],
      components: {
        Header: "./src/components/DocsHeader.astro",
        Head: "./src/components/DocsHead.astro",
        PageTitle: "./src/components/DocsPageTitle.astro",
        Footer: "./src/components/DocsFooter.astro",
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Welcome", slug: "docs" },
            { label: "Install Merran", slug: "docs/get-started/install" },
            { label: "First-run setup", slug: "docs/get-started/setup" },
            { label: "Your first week", slug: "docs/get-started/first-week" },
          ],
        },
        {
          label: "Use Merran",
          items: [
            { label: "Recipes", slug: "docs/use/recipes" },
            { label: "Planning", slug: "docs/use/planning" },
            {
              label: "Shopping and pantry",
              slug: "docs/use/shopping-and-pantry",
            },
            { label: "Cooking", slug: "docs/use/cooking" },
            { label: "Assistant and approvals", slug: "docs/use/assistant" },
          ],
        },
        {
          label: "Integrations",
          items: [{ autogenerate: { directory: "docs/integrations" } }],
        },
        {
          label: "Run Merran",
          items: [{ autogenerate: { directory: "docs/run" } }],
        },
        {
          label: "API",
          collapsed: true,
          items: [
            { label: "Make your first request", slug: "docs/api" },
            {
              label: "Build a recipe index",
              slug: "docs/api/practical-integration",
            },
            { label: "Listen for live changes", slug: "docs/api/live-events" },
            ...openAPISidebarGroups,
          ],
        },
        {
          label: "Project",
          items: [{ autogenerate: { directory: "docs/project" } }],
        },
      ],
      plugins: [
        starlightOpenAPI([
          {
            base: "docs/api/reference",
            schema: "../server/src/http/openapi/openapi.json",
            label: "Endpoint reference",
          },
        ]),
      ],
    }),
  ],
})
