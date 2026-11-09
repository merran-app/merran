import { createFileRoute } from "@tanstack/react-router"

import { SharedPage } from "@/features/sharing/shared-page"
import { WithSharedRecipe } from "@/features/sharing/shared-unavailable"

/**
 * A recipe shared by link, for anyone who has it, signed in or not. Outside
 * the signed-in layout, so it starts none of the household's queries.
 */
export const Route = createFileRoute("/r/$token/")({
  component: SharedRecipePage,
})

function SharedRecipePage() {
  const { token } = Route.useParams()
  return (
    <WithSharedRecipe token={token}>
      {(shared) => <SharedPage token={token} shared={shared} />}
    </WithSharedRecipe>
  )
}
