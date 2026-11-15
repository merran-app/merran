import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Where a link import's page used to be, as old share answers and webhooks
 * link it: an import's id is its job's, so it opens on the Imports page.
 */
export const Route = createFileRoute("/_app/recipes/import/$importId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/recipes/imports/$importId",
      params: { importId: params.importId },
      replace: true,
    })
  },
})
