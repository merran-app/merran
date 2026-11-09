import { CookingPotIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMinutes, sourceName } from "@/features/recipes/format"
import {
  convertible,
  IngredientList,
  ServingsStepper,
  UnitToggle,
  useServings,
} from "@/features/recipes/ingredient-list"
import { NutritionSection } from "@/features/recipes/nutrition-section"
import type { Recipe } from "@/features/recipes/queries"
import { StepList } from "@/features/recipes/step-list"
import { useUnitSystem } from "@/features/recipes/use-unit-system"

import { asGuestRecipe, type SharedRecipe } from "./guest-recipe"

/**
 * A shared recipe, for anyone with its link: read it, scale it, switch its
 * units and start cooking. Nothing on it changes the recipe or asks the
 * server for anything but the recipe and its photo.
 */
export function SharedPage({
  token,
  shared,
}: {
  token: string
  shared: SharedRecipe
}) {
  const { t } = useTranslation()
  // The same recipe, as the recipe page's parts take it.
  const recipe = React.useMemo(
    () => asGuestRecipe(shared, token),
    [shared, token]
  )
  const servings = useServings(recipe)
  const [system, setSystem] = useUnitSystem()

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Logo />
        <p className="text-sm text-muted-foreground">
          {t("sharing.page.sharedBy", { household: shared.household.name })}
        </p>
      </header>

      <article className="grid flex-1 gap-8 pt-2 pb-10">
        {/* The photo on the left, and what the recipe is on the right. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          {recipe.photo && (
            <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
              <img
                src={recipe.photo.full}
                alt={t("recipes.photo.alt", { name: recipe.name })}
                className="size-full object-cover"
              />
            </div>
          )}
          <div className="grid content-start gap-4">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
              {recipe.name}
            </h1>
            {recipe.description && (
              <p className="text-lg text-muted-foreground lg:line-clamp-5">
                {recipe.description}
              </p>
            )}
            <RecipeFacts recipe={recipe} />
            <div className="pt-2">
              <Button
                size="lg"
                render={
                  <Link
                    to="/r/$token/cook"
                    params={{ token }}
                    search={
                      servings.changed
                        ? { scale: Math.round(servings.factor * 1000) / 1000 }
                        : {}
                    }
                  />
                }
              >
                <HugeiconsIcon
                  icon={CookingPotIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("recipes.startCooking")}
              </Button>
            </div>
          </div>
        </div>

        {/* Ingredients in a tall column on the left, the steps beside them. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl font-semibold">
                {t("recipes.fields.ingredients")}
              </CardTitle>
              {recipe.ingredients.length > 0 && (
                <ServingsStepper servings={servings} />
              )}
              {convertible(recipe.ingredients) && (
                <UnitToggle
                  system={system}
                  onChange={setSystem}
                  className="w-full"
                />
              )}
            </CardHeader>
            <CardContent>
              {recipe.ingredients.length === 0 ? (
                <p className="text-muted-foreground">
                  {t("recipes.noIngredients")}
                </p>
              ) : (
                <IngredientList
                  lines={recipe.ingredients}
                  factor={servings.factor}
                  system={system}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid content-start gap-8">
            <section className="grid gap-4">
              <h2 className="text-2xl font-semibold">
                {t("recipes.fields.steps")}
              </h2>
              {recipe.steps.length === 0 ? (
                <p className="text-muted-foreground">{t("recipes.noSteps")}</p>
              ) : (
                <StepList steps={recipe.steps} system={system} />
              )}
            </section>
            <NutritionSection recipe={recipe} guest />
            <SourceLink url={recipe.sourceUrl} />
          </div>
        </div>
      </article>

      <footer className="grid justify-items-center gap-1 border-t py-6 text-center text-sm text-muted-foreground">
        <a
          href="https://merran.app"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("sharing.page.madeWith")}
        </a>
        <p>{t("sharing.page.recipeAppHint")}</p>
      </footer>
    </div>
  )
}

/** Prep, cook and total times, and what it makes, where the recipe says. */
function RecipeFacts({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()
  const facts = [
    recipe.prepMinutes !== null && [
      t("recipes.facts.prep"),
      formatMinutes(t, recipe.prepMinutes),
    ],
    recipe.cookMinutes !== null && [
      t("recipes.facts.cook"),
      formatMinutes(t, recipe.cookMinutes),
    ],
    recipe.totalMinutes !== null && [
      t("recipes.facts.total"),
      formatMinutes(t, recipe.totalMinutes),
    ],
    recipe.yieldText && [t("recipes.facts.makes"), recipe.yieldText],
  ].filter((fact): fact is [string, string] => Boolean(fact))

  if (facts.length === 0) return null

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Whether a recipe's source is a web page, and safe to link to. */
function isWebPage(url: string) {
  try {
    const { protocol } = new URL(url)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

/**
 * Where the recipe came from, by its site's name. Left out when there's no
 * address or it isn't a web page's.
 */
function SourceLink({ url }: { url: string | null }) {
  const { t } = useTranslation()
  if (!url || !isWebPage(url)) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <HugeiconsIcon
        icon={LinkSquare02Icon}
        strokeWidth={2}
        className="size-4"
      />
      {t("recipes.original", { site: sourceName(url) })}
    </a>
  )
}
