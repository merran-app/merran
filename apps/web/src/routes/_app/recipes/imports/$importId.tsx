import { createFileRoute } from "@tanstack/react-router"

import { ImportPage } from "@/features/imports/import-page"

/** One import: how it went, and what came of each link or recipe. */
export const Route = createFileRoute("/_app/recipes/imports/$importId")({
  component: ImportRoute,
})

function ImportRoute() {
  const { importId } = Route.useParams()
  return <ImportPage importId={importId} />
}
