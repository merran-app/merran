// Recipes that are probably the same one: from the same page under any
// address, or with the same name by its words. No AI: a household sees
// why each pair matched, and says when two aren't the same.

export type DuplicateReason = "link" | "name"

/** What matching needs to know of a recipe. */
export type DuplicateCandidate = {
  name: string
  sourceUrl: string | null
  /** Its ingredients' foods, each passed through `foodWord`. */
  foods: readonly string[]
}

/** Parameters added to links for tracking, which say nothing about the page. */
export const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|igsh|si|feature|_r|_t)$/i

/** Parameters that ask for another version of the same page. */
const VERSION_PARAM = /^(amp|print)$/i

/**
 * A link reduced to the page it's for: no scheme, no "www.", "m." or
 * "amp.", no trailing slash, print or AMP ending, tracking or #part. So
 * "https://www.example.com/lemon-chicken/print/" and
 * "http://example.com/lemon-chicken" are one page. Null for anything that
 * isn't a web link.
 */
export function linkKey(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  const host = parsed.hostname.toLowerCase().replace(/^(www|m|amp)\./, "")
  const path = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\/(amp|print)$/i, "")
    .replace(/\/+$/, "")
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key) && !VERSION_PARAM.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = new URLSearchParams(params).toString()
  return `${host}${path}${query ? `?${query}` : ""}`
}

/** Words that say nothing about which dish a recipe is. */
const FILLER = new Set([
  "a",
  "an",
  "and",
  "the",
  "with",
  "of",
  "in",
  "on",
  "for",
  "my",
  "our",
  "your",
  "easy",
  "best",
  "quick",
  "simple",
  "homemade",
  "perfect",
  "ultimate",
  "recipe",
  "recipes",
])

/**
 * A word made singular, near enough: both sides of a match go through it,
 * so it only needs to be the same for "chicken" and "chickens".
 */
function singular(word: string) {
  if (word.length <= 3) return word
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.endsWith("oes")) return word.slice(0, -2)
  if (/(s|x|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (/(ss|us|is)$/.test(word)) return word
  if (word.endsWith("s")) return word.slice(0, -1)
  return word
}

/** Lowercase words of letters and digits, accents dropped. */
function words(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

/**
 * The words a name is about: no filler, each singular. "Easy Lemon
 * Chickens" and "The chicken with lemon" are both {lemon, chicken}.
 */
export function nameWords(name: string): Set<string> {
  return new Set(
    words(name)
      .filter((word) => !FILLER.has(word))
      .map(singular)
  )
}

/** A food, as matching compares it: "Chicken Thighs" is "chicken thigh". */
export function foodWord(food: string): string {
  return words(food).map(singular).join(" ")
}

/** The fewest foods, and the share of the smaller recipe's, two must share. */
const MIN_SHARED_FOODS = 3
const MIN_SHARED_PART = 0.7

/** Whether two recipes' ingredients agree enough for a name inside another. */
function foodsAgree(a: readonly string[], b: readonly string[]) {
  const first = new Set(a)
  const second = new Set(b)
  const [fewer, more] =
    first.size <= second.size ? [first, second] : [second, first]
  if (fewer.size === 0) return false
  const shared = [...fewer].filter((food) => more.has(food)).length
  return shared >= MIN_SHARED_FOODS && shared / fewer.size >= MIN_SHARED_PART
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((word) => b.has(word))

const inside = (small: Set<string>, large: Set<string>) =>
  small.size < large.size && [...small].every((word) => large.has(word))

/** Whether two names match: the same words, or one inside the other with foods to back it. */
function namesMatch(a: DuplicateCandidate, b: DuplicateCandidate) {
  const first = nameWords(a.name)
  const second = nameWords(b.name)
  if (first.size === 0 || second.size === 0) return false
  if (sameSet(first, second)) return true
  if (inside(first, second) || inside(second, first)) {
    return foodsAgree(a.foods, b.foods)
  }
  return false
}

/** Why two recipes may be the same one, link first; empty when they aren't. */
export function duplicateReasons(
  a: DuplicateCandidate,
  b: DuplicateCandidate
): DuplicateReason[] {
  const reasons: DuplicateReason[] = []
  const firstKey = a.sourceUrl ? linkKey(a.sourceUrl) : null
  if (firstKey && b.sourceUrl && firstKey === linkKey(b.sourceUrl)) {
    reasons.push("link")
  }
  if (namesMatch(a, b)) reasons.push("name")
  return reasons
}

/** Adds an item to a map of lists. */
function addTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Every pair of recipes that may be the same one, each once, with `a` the
 * earlier in the list. Only recipes sharing a link key, a set of name
 * words, or the rarest word of the shorter name are compared, so a big
 * library isn't compared pair by pair.
 */
export function findDuplicatePairs(
  recipes: readonly (DuplicateCandidate & { id: string })[]
): { a: string; b: string; reasons: DuplicateReason[] }[] {
  const byWord = new Map<string, number[]>()
  const candidates = new Map<string, [number, number]>()
  const consider = (i: number, j: number) => {
    if (i === j) return
    const [first, second] = i < j ? [i, j] : [j, i]
    candidates.set(`${first}:${second}`, [first, second])
  }

  // Same link, or the same words: every two in a group are candidates.
  const groups = new Map<string, number[]>()
  const wordSets = recipes.map((recipe) => nameWords(recipe.name))
  recipes.forEach((recipe, i) => {
    const key = recipe.sourceUrl ? linkKey(recipe.sourceUrl) : null
    if (key) addTo(groups, `link:${key}`, i)
    const nameKey = [...wordSets[i]!].sort().join(" ")
    if (nameKey) addTo(groups, `name:${nameKey}`, i)
    for (const word of wordSets[i]!) addTo(byWord, word, i)
  })
  for (const group of groups.values()) {
    for (let x = 0; x < group.length; x++) {
      for (let y = x + 1; y < group.length; y++) consider(group[x]!, group[y]!)
    }
  }

  // A name inside another: only recipes with this name's rarest word, and
  // more words, can hold all of its words.
  wordSets.forEach((set, i) => {
    if (set.size === 0) return
    const rarest = [...set].reduce((best, word) =>
      byWord.get(word)!.length < byWord.get(best)!.length ? word : best
    )
    for (const j of byWord.get(rarest)!) {
      if (j !== i && inside(set, wordSets[j]!)) consider(i, j)
    }
  })

  const pairs: { a: string; b: string; reasons: DuplicateReason[] }[] = []
  const ordered = [...candidates.values()].sort(
    ([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2
  )
  for (const [i, j] of ordered) {
    const reasons = duplicateReasons(recipes[i]!, recipes[j]!)
    if (reasons.length > 0) {
      pairs.push({ a: recipes[i]!.id, b: recipes[j]!.id, reasons })
    }
  }
  return pairs
}
