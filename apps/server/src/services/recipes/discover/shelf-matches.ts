import { DIETS } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { DiscoveredRecipe } from "../../../database/entities/index.ts"
import { getTastes } from "../../households/tastes.ts"
import { sameDish } from "./dishes.ts"
import { shelfRows, type ShelfRow } from "./sites/shelf-cache.ts"
import { coursesOf, wordPattern } from "./sites/shelf.ts"
import { describeShelfRecipe, libraryByUrl, suits } from "./sites/sites.ts"

// The first part of a Discover search: what the shelf already has for the
// theme, found by its words and shown at once, without asking the AI.

/** The most recipes a round takes from the shelf. */
export const FROM_SHELF = 4

/**
 * Words in a theme that say how someone feels or when they cook, not what
 * they want to eat. Only English ones are known, so another language's
 * theme is matched more strictly. The course words ("dinner", "mains")
 * aren't here: they match a recipe's course.
 */
const FILLER = new Set(
  [
    // Articles and small words.
    "a an and or the with for of in on to my our your some something anything new more other like",
    // Moods.
    "cozy cosy comforting comfort hearty cheap budget easy quick simple fast lazy weeknight weekend everyday family healthy light fresh delicious tasty best favorite favourite classic perfect",
    // Seasons and times.
    "fall autumn winter spring summer seasonal holiday tonight today",
    // Words for recipes themselves.
    "recipe recipes idea ideas dish dishes food foods meal meals",
  ]
    .join(" ")
    .split(" ")
)

/**
 * The words of a theme that can be matched, lowercase, with the filler
 * left out. A hyphenated word stays whole when it's a diet label
 * ("gluten-free") and is split otherwise ("sheet-pan"). Single letters
 * ("Vitamin C") are left out too: a word is matched in its forms of two
 * letters or more, so a single letter would match any name.
 */
export function themeWords(theme: string) {
  const words: string[] = []
  for (const word of theme.toLowerCase().split(/[^\p{L}-]+/u)) {
    const parts = (DIETS as readonly string[]).includes(word)
      ? [word]
      : word.split("-")
    for (const part of parts) {
      if (part.length > 1 && !FILLER.has(part) && !words.includes(part)) {
        words.push(part)
      }
    }
  }
  return words
}

/** A word as written, and without a final "s" or "es": "tomatoes" is "tomato". */
function forms(word: string) {
  const found = [word]
  if (word.endsWith("es")) found.push(word.slice(0, -2))
  if (word.endsWith("s")) found.push(word.slice(0, -1))
  return found.filter((form) => form.length > 1)
}

/**
 * Whether a recipe fits every word of a theme: each is a diet it has, a
 * course it's in, or a whole word in its name or keywords. No words fit
 * nothing, so a theme of only moods doesn't match the whole shelf.
 */
export function fitsTheme(
  words: readonly string[],
  recipe: Pick<ShelfRow, "name" | "keywords" | "courses" | "diets">
) {
  if (words.length === 0) return false
  const said = [recipe.name ?? "", ...recipe.keywords].join("\n")
  return words.every((word) => {
    if (recipe.diets.includes(word)) return true
    if (coursesOf([word]).some((course) => recipe.courses.includes(course))) {
      return true
    }
    return wordPattern(forms(word)).test(said)
  })
}

/**
 * Up to four recipes from the shelf for a theme, newest first: ones that
 * suit the household, aren't in its library, aren't at a link in `skip`,
 * and aren't the same dish as one in `avoid` or as each other.
 */
export async function shelfMatches(
  em: EntityManager,
  householdId: string,
  theme: string,
  options: { avoid: readonly string[]; skip: readonly string[] }
): Promise<DiscoveredRecipe[]> {
  const words = themeWords(theme)
  if (words.length === 0) return []

  // Words first, in memory, so the library and tastes are only looked up
  // for the few that fit. The shelf is kept in memory (shelf-cache.ts).
  const shelf = await shelfRows(em)
  const fitting = shelf.filter(
    (row) =>
      row.name && fitsTheme(words, row) && !options.skip.includes(row.url)
  )
  if (fitting.length === 0) return []
  const [library, tastes] = await Promise.all([
    libraryByUrl(
      em,
      fitting.map((row) => row.url)
    ),
    getTastes(em, householdId),
  ])

  const found: DiscoveredRecipe[] = []
  const names = [...options.avoid]
  for (const row of fitting) {
    if (found.length === FROM_SHELF) break
    if (library.has(row.url) || !suits(row, tastes)) continue
    if (names.some((name) => sameDish(name, row.name!))) continue
    const shown = describeShelfRecipe(row, { inLibrary: null, suits: true })
    found.push({
      url: row.url,
      name: shown.name,
      site: shown.site,
      minutes: shown.minutes,
      photo: shown.photo,
      why: (shown.description ?? "").slice(0, 300),
      photoKey: null,
      shelfId: row.id,
    })
    names.push(shown.name)
  }
  return found
}
