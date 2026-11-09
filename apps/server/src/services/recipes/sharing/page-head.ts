import type { SharedRecipe } from "./shared-recipe.ts"

const PREVIEW_LENGTH = 200

/** Text for an HTML attribute or element: nothing in it can end either. */
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** The summary on one line and at most 200 characters, for a link preview. */
export function previewDescription(shared: SharedRecipe) {
  const summary = (shared.description ?? "").replace(/\s+/g, " ").trim()
  if (!summary) return `A recipe from ${shared.household.name}`
  if (summary.length <= PREVIEW_LENGTH) return summary
  return `${summary.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`
}

/** Minutes as ISO 8601, which recipe apps read: 90 is "PT1H30M". */
function isoDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) return undefined
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return `PT${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`
}

/** What a serving holds, in the words schema.org's importers read. */
function nutritionData(nutrition: NonNullable<SharedRecipe["nutrition"]>) {
  const data: Record<string, unknown> = {
    "@type": "NutritionInformation",
  }
  if (nutrition.calories !== undefined) {
    data.calories = `${nutrition.calories} calories`
  }
  if (nutrition.protein !== undefined) {
    data.proteinContent = `${nutrition.protein} g`
  }
  if (nutrition.carbs !== undefined) {
    data.carbohydrateContent = `${nutrition.carbs} g`
  }
  if (nutrition.fat !== undefined) {
    data.fatContent = `${nutrition.fat} g`
  }
  if (nutrition.fiber !== undefined) {
    data.fiberContent = `${nutrition.fiber} g`
  }
  if (nutrition.sugar !== undefined) {
    data.sugarContent = `${nutrition.sugar} g`
  }
  if (nutrition.sodium !== undefined) {
    data.sodiumContent = `${nutrition.sodium} mg`
  }
  return Object.keys(data).length > 1 ? data : undefined
}

/**
 * The steps as HowToSteps. Steps in a section are grouped in a HowToSection,
 * a new one wherever the section's name changes.
 */
function instructionsData(steps: SharedRecipe["steps"]) {
  const instructions: Record<string, unknown>[] = []
  let current: { name: string; items: Record<string, unknown>[] } | null = null

  for (const step of steps) {
    const howTo = { "@type": "HowToStep", text: step.text }
    if (!step.section) {
      current = null
      instructions.push(howTo)
      continue
    }
    if (!current || current.name !== step.section) {
      current = { name: step.section, items: [] }
      instructions.push({
        "@type": "HowToSection",
        name: current.name,
        itemListElement: current.items,
      })
    }
    current.items.push(howTo)
  }
  return instructions
}

/** The photo's full link, from the server's own public address. */
function photoUrl(shared: SharedRecipe, base: string) {
  return shared.photo ? `${base}${shared.photo.full}` : null
}

/** schema.org's Recipe, which other recipe apps import from a page. */
export function recipeJsonLd(
  shared: SharedRecipe,
  pageUrl: string,
  base: string
): Record<string, unknown> {
  const yieldText =
    shared.yieldText ??
    (shared.servings ? `${shared.servings} servings` : undefined)

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: shared.name,
    description: shared.description ?? undefined,
    image: photoUrl(shared, base) ?? undefined,
    recipeYield: yieldText,
    prepTime: isoDuration(shared.prepMinutes),
    cookTime: isoDuration(shared.cookMinutes),
    totalTime: isoDuration(shared.totalMinutes),
    recipeIngredient: shared.ingredients.map((line) => line.text),
    recipeInstructions: instructionsData(shared.steps),
    nutrition: shared.nutrition ? nutritionData(shared.nutrition) : undefined,
    author: { "@type": "Organization", name: shared.household.name },
    url: pageUrl,
  }
}

/** JSON for inside a script tag: `<` is escaped, so "</script>" can't end it. */
function scriptJson(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/** The head's title, link-preview tags and recipe data for a shared recipe. */
export function sharedPageHead(
  shared: SharedRecipe,
  pageUrl: string,
  base: string
) {
  const image = photoUrl(shared, base)
  const meta = (kind: "property" | "name", key: string, value: string) =>
    `<meta ${kind}="${key}" content="${escapeHtml(value)}">`
  const jsonLd = scriptJson(recipeJsonLd(shared, pageUrl, base))

  const tags = [
    `<title>${escapeHtml(shared.name)}</title>`,
    meta("property", "og:title", shared.name),
    meta("property", "og:description", previewDescription(shared)),
    ...(image ? [meta("property", "og:image", image)] : []),
    meta("property", "og:url", pageUrl),
    meta("property", "og:type", "article"),
    meta("name", "twitter:card", image ? "summary_large_image" : "summary"),
    meta("name", "robots", "noindex"),
    `<script type="application/ld+json">${jsonLd}</script>`,
  ]
  return tags.join("\n    ")
}

/** The page with `head` in place of its title. */
export function withHead(index: string, head: string) {
  // A function, so a "$" in the head isn't read as a replacement pattern.
  if (/<title>[\s\S]*?<\/title>/i.test(index)) {
    return index.replace(/<title>[\s\S]*?<\/title>/i, () => head)
  }
  return index.replace(/<\/head>/i, () => `${head}\n  </head>`)
}
