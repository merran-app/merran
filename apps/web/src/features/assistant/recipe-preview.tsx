import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"

export type ProposedRecipe = {
  name: string
  ingredients: string[]
  steps: string[]
  description: string | null
  notes: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  tags: string[]
}

/** A proposed recipe reads like a recipe before it becomes part of the library. */
export function RecipePreview({ recipe }: { recipe: ProposedRecipe }) {
  const { t } = useTranslation()
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border bg-card">
      <header className="grid gap-3 border-b p-4 sm:p-6">
        <h3 className="font-heading text-2xl break-words">{recipe.name}</h3>
        {recipe.description && (
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
            {recipe.description}
          </p>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {recipe.servings != null && (
            <div>
              <dt className="text-muted-foreground">
                {t("recipes.fields.servings")}
              </dt>
              <dd className="font-semibold">{recipe.servings}</dd>
            </div>
          )}
          {(["prepMinutes", "cookMinutes", "totalMinutes"] as const).map(
            (field) =>
              recipe[field] != null && (
                <div key={field}>
                  <dt className="text-muted-foreground">
                    {t(`recipes.fields.${field}`)}
                  </dt>
                  <dd className="font-semibold">
                    {t("recipes.review.minutes", { count: recipe[field] })}
                  </dd>
                </div>
              )
          )}
        </dl>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>
      <div className="grid gap-6 p-4 sm:p-6 @xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="min-w-0">
          <h4 className="mb-3 font-semibold">
            {t("recipes.tidy.sections.ingredients")}
          </h4>
          <RecipeLines lines={recipe.ingredients} />
        </section>
        <section className="min-w-0">
          <h4 className="mb-3 font-semibold">
            {t("recipes.tidy.sections.steps")}
          </h4>
          <RecipeLines lines={recipe.steps} numbered />
        </section>
      </div>
      {recipe.notes && (
        <section className="mx-4 mb-4 rounded-xl bg-muted p-4 sm:mx-6 sm:mb-6">
          <h4 className="mb-2 font-semibold">
            {t("recipes.tidy.sections.notes")}
          </h4>
          <p className="leading-relaxed whitespace-pre-line">{recipe.notes}</p>
        </section>
      )}
    </article>
  )
}

function RecipeLines({
  lines,
  numbered = false,
}: {
  lines: string[]
  numbered?: boolean
}) {
  let step = 0
  return (
    <ul className="grid gap-3 text-sm">
      {lines.map((line, index) => {
        if (line.trim().startsWith("#")) {
          return (
            <li key={index} className="border-b pt-3 pb-2 font-semibold">
              {line.replace(/^\s*#+\s*/, "")}
            </li>
          )
        }
        step++
        return (
          <li key={index} className="flex gap-3 leading-relaxed">
            <span
              aria-hidden={!numbered}
              className={
                numbered
                  ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
                  : "text-muted-foreground"
              }
            >
              {numbered ? step : "•"}
            </span>
            <span className="min-w-0 break-words whitespace-pre-line">
              {line}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
