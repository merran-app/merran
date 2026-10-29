import { load, type CheerioAPI } from "cheerio"

// What a recipe plugin's card on the page shows that its recipe data leaves
// out. WordPress Recipe Maker, which a great many food blogs use, keeps the
// names of its ingredient groups ("Orange sauce:"), the recipe's notes (that
// its ingredients and steps point to: "Note 2") and the summary's paragraphs
// only in its card.

export type RecipeCard = {
  /** The card's ingredient groups in order: each one's name and how many lines it has. */
  groups: { name: string | null; size: number }[]
  /** The recipe's notes, as paragraphs. */
  notes: string[]
  /** The summary at the top of the card, as paragraphs. */
  summary: string[]
}

/** Parts of a card's text that start a new line. */
const BLOCKS =
  'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, span[style*="block"]'

const collapse = (text: string) => text.replace(/\s+/g, " ").trim()

/** A card's block of text as its paragraphs, list items marked with "- ". */
function paragraphs(html: string | null | undefined): string[] {
  if (!html) return []
  const $ = load(`<main>${html}</main>`)
  $("br").replaceWith("\n")
  $("li").prepend("- ")
  $(BLOCKS).after("\n")
  return $("main").text().split("\n").map(collapse).filter(Boolean)
}

/**
 * The WordPress Recipe Maker card for the recipe named, or null when the
 * page has none. A page with several cards (a round-up) gives the one with
 * the recipe's name.
 */
export function readRecipeCard($: CheerioAPI, name: string): RecipeCard | null {
  const cards = $(".wprm-recipe-container").toArray()
  const named = cards.find(
    (card) =>
      collapse($(card).find(".wprm-recipe-name").first().text()) === name
  )
  const element = named ?? (cards.length === 1 ? cards[0] : undefined)
  if (!element) return null
  const card = $(element)

  const groups = card
    .find(".wprm-recipe-ingredient-group")
    .toArray()
    .map((group) => {
      const title = collapse(
        $(group).find(".wprm-recipe-group-name").first().text()
      ).replace(/:$/, "")
      return {
        name: title || null,
        size: $(group).find(".wprm-recipe-ingredient").length,
      }
    })

  return {
    groups,
    notes: paragraphs(card.find(".wprm-recipe-notes").first().html()),
    summary: paragraphs(card.find(".wprm-recipe-summary").first().html()),
  }
}

/**
 * Ingredient lines with "# Group" lines before each of the card's named
 * groups. The card lists the same lines as the recipe data, in the same
 * order; when the counts differ, the lines are left as they are.
 */
export function inGroups(
  lines: readonly string[],
  groups: RecipeCard["groups"]
): string[] {
  const counted = groups.reduce((sum, group) => sum + group.size, 0)
  if (counted !== lines.length || !groups.some((group) => group.name)) {
    return [...lines]
  }
  const grouped: string[] = []
  let at = 0
  for (const group of groups) {
    if (group.size === 0) continue
    // A group with no name after a named one has no section: "#" ends it.
    if (group.name) grouped.push(`# ${group.name}`)
    else if (grouped.length > 0) grouped.push("#")
    grouped.push(...lines.slice(at, at + group.size))
    at += group.size
  }
  return grouped
}
