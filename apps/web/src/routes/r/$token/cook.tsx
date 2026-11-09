import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"

import { CookView } from "@/features/cook/cook-view"
import {
  asGuestRecipe,
  type SharedRecipe,
} from "@/features/sharing/guest-recipe"
import { WithSharedRecipe } from "@/features/sharing/shared-unavailable"

type CookSearch = {
  /** How many times the recipe, from the servings on the shared page. */
  scale?: number
}

/**
 * Cooking a shared recipe, by anyone with its link: steps and timers, saved
 * nowhere but this device.
 */
export const Route = createFileRoute("/r/$token/cook")({
  validateSearch: (search: Record<string, unknown>): CookSearch => {
    const scale = Number(search.scale)
    return scale > 0 && scale <= 100 && scale !== 1 ? { scale } : {}
  },
  component: SharedCookPage,
})

function SharedCookPage() {
  const { token } = Route.useParams()
  const { scale = 1 } = Route.useSearch()
  return (
    <WithSharedRecipe token={token}>
      {(shared) => <GuestCook token={token} shared={shared} scale={scale} />}
    </WithSharedRecipe>
  )
}

function GuestCook({
  token,
  shared,
  scale,
}: {
  token: string
  shared: SharedRecipe
  scale: number
}) {
  const recipe = React.useMemo(
    () => asGuestRecipe(shared, token),
    [shared, token]
  )
  // Fresh for each scale, picking up where that was left.
  return (
    <CookView
      key={`${token}-${scale}`}
      recipe={recipe}
      scale={scale}
      guest={{ token }}
    />
  )
}
