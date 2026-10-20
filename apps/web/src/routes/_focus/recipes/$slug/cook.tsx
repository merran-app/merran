import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { CookView } from "@/features/cook/cook-view"
import { tastesQuery } from "@/features/household/queries"
import { recipeQuery } from "@/features/recipes/queries"
import { planEntryQuery, mealRecipe } from "@/features/plan/meal-recipe"

type CookSearch = {
  meal?: string
  /** How many times the recipe, from the servings on its page. */
  scale?: number
  /** A recipe it goes with, cooked with it. */
  with?: string
}

export const Route = createFileRoute("/_focus/recipes/$slug/cook")({
  validateSearch: (search: Record<string, unknown>): CookSearch => {
    const scale = Number(search.scale)
    return {
      ...(typeof search.meal === "string" && search.meal
        ? { meal: search.meal }
        : {}),
      ...(scale > 0 && scale <= 100 && scale !== 1 ? { scale } : {}),
      ...(typeof search.with === "string" && search.with
        ? { with: search.with }
        : {}),
    }
  },
  loaderDeps: ({ search }) => ({ with: search.with, meal: search.meal }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      // What's left out for the household's dislikes.
      context.queryClient.ensureQueryData(tastesQuery).catch(() => null),
      context.queryClient.ensureQueryData(recipeQuery(params.slug)),
      deps.meal
        ? context.queryClient.ensureQueryData(planEntryQuery(deps.meal))
        : null,
      // A pairing that's gone just means cooking the recipe alone.
      deps.with
        ? context.queryClient
            .ensureQueryData(recipeQuery(deps.with))
            .catch(() => null)
        : null,
    ]),
  component: CookPage,
})

function CookPage() {
  const { t } = useTranslation()
  const { slug } = Route.useParams()
  const { scale = 1, with: withSlug, meal } = Route.useSearch()
  const { data: entry } = useQuery({
    ...planEntryQuery(meal ?? ""),
    enabled: Boolean(meal),
  })
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  const { data: paired } = useQuery({
    ...recipeQuery(withSlug ?? ""),
    enabled: Boolean(withSlug),
  })
  const pairing = paired && paired.id !== recipe.id ? paired : undefined
  if (entry && entry.recipe?.id !== recipe.id)
    return <p role="alert">{t("shopping.contextMismatch")}</p>
  const cookingRecipe = mealRecipe(recipe, entry)
  const cookingScale =
    entry?.servings != null && cookingRecipe.servings
      ? entry.servings / cookingRecipe.servings
      : scale
  // Fresh for each recipe, pairing and scale, picking up where that was left.
  return (
    <CookView
      key={`${recipe.id}-${pairing?.id ?? ""}-${scale}-${meal ?? ""}`}
      recipe={cookingRecipe}
      paired={pairing ? mealRecipe(pairing, entry) : undefined}
      mealId={entry?.id}
      scale={cookingScale}
    />
  )
}
