import {
  normalizeIngredientLine,
  parseIngredient,
} from "../ingredients/parse.ts"

// Words that describe an ingredient, or how much of it, rather than name it.
const DESCRIPTIVE = new Set(
  (
    "all purpose fresh large small medium extra virgin chopped minced diced " +
    "sliced ground whole dried finely roughly thinly freshly packed softened " +
    "melted cold warm room temperature boneless skinless optional divided " +
    "plus more less for serving taste and the into pieces piece about natural " +
    "can cans tin tins jar jars pack packet bunch handful pinch heaped level " +
    "good few some red green yellow white black brown light dark"
  ).split(" ")
)

/** What a recipe makes, as a section of it: "Orange sauce", "For the glaze". */
const PREPARATIONS = new Set(
  (
    "sauce dressing marinade glaze batter dough filling topping coating " +
    "crust rub frosting icing gravy syrup mixture mix paste seasoning"
  ).split(" ")
)

/** A word's singular, so "cloves" in a step is the clove of "garlic clove". */
function stem(word: string) {
  if (word.length <= 3 || word.endsWith("ss")) return word
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (/(?:oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2)
  return word.endsWith("s") ? word.slice(0, -1) : word
}

/** Whether a word can name a food: not a describing word, nor a short one. */
const naming = (word: string) => word.length >= 3 && !DESCRIPTIVE.has(word)

/**
 * The names a line's food goes by, each as its words: "cornflour /
 * cornstarch" is cornflour or cornstarch, "salt and pepper" is salt and
 * pepper, "large garlic cloves" is garlic clove.
 */
export function foodNames(food: string): string[][] {
  return food
    .toLowerCase()
    .split(/\s*(?:\/|&|,|\bor\b|\band\b)\s*/)
    .map((part) =>
      part
        .split(/[^a-z]+/)
        .filter(naming)
        .map(stem)
    )
    .filter((words) => words.length > 0)
}

/** A step's words that can name a food, in order, with whether each is in an "except" clause. */
function stepWords(text: string) {
  const excepted: [number, number][] = []
  for (const clause of text.matchAll(EXCEPT)) {
    excepted.push([clause.index, clause.index + clause[0].length])
  }
  return [...text.toLowerCase().matchAll(/[a-z]+/g)]
    .filter((word) => naming(word[0]))
    .map((word) => ({
      stem: stem(word[0]),
      excepted: excepted.some(
        ([start, end]) => word.index >= start && word.index < end
      ),
    }))
}

/** "except garlic and orange zest": what's named after it isn't used now. */
const EXCEPT =
  /\b(?:except(?:\s+for)?|other than|apart from|aside from|save for|but not)\b[^.;!?]*/gi

/** Words for the rest of a section's ingredients: "whisk in everything else". */
const EVERYTHING_ELSE =
  /\b(?:everything else|(?:all )?(?:the )?(?:remaining|other|rest of the) ingredients)\b/i

/** "Orange sauce – Whisk the…": the few words a step starts with, before a dash or colon. */
const LEAD_IN = /^\s*([a-z][a-z ,&'-]{1,40}?)\s*(?:[–—:]|\s-)\s+/i

/** A section's name as compared: "For the Orange sauce:" is "orange sauce". */
const sectionKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/^\s*(?:for|to make)\s+(?:the\s+)?/, "")
    .replace(/[:\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim()

export type StepLine = {
  id: string
  food: string | null
  section?: string | null
  quantity?: number | null
  /** Its unit's id: "tablespoon". */
  unit?: string | null
}

export type RecipeStep = { text: string; section?: string | null }

/** The ingredient section a name is for: "Make the orange sauce" is "orange sauce". */
function sectionFor(
  name: string | null | undefined,
  sections: ReadonlySet<string>
) {
  if (!name) return null
  const key = sectionKey(name)
  for (const section of sections) {
    if (key === section || key.endsWith(` ${section}`)) return section
  }
  return null
}

/**
 * The ingredient section a step is about: the one its own section is
 * named for, or the one its first words name ("Orange sauce – Whisk…"),
 * with those first words when they're what names it.
 */
function stepSection(step: RecipeStep, sections: ReadonlySet<string>) {
  const own = sectionFor(step.section, sections)
  if (own) return { section: own, heading: null }
  const lead = step.text.match(LEAD_IN)
  const named = sectionFor(lead?.[1], sections)
  return { section: named, heading: named ? lead![0] : null }
}

/** The amounts a step gives: "the 2 tablespoons of cornflour" is 2 tablespoons. */
function statedAmounts(text: string) {
  const line = normalizeIngredientLine(text)
  const amounts: { quantity: number; unit: string }[] = []
  for (const number of line.matchAll(/(?<![\d/.,])\d/g)) {
    const { quantity, unitId } = parseIngredient(line.slice(number.index))
    if (quantity !== null && unitId) amounts.push({ quantity, unit: unitId })
  }
  return amounts
}

/**
 * A line's food named in the step's words, from `start`, and how well:
 * a whole name ranks by its length, a food's last word ("the ginger" for
 * grated ginger) like a whole one-word name, and another word of it ("the
 * chicken" for chicken thighs) below that.
 */
type Match = { line: StepLine; start: number; length: number; rank: number }

/**
 * Where each line's food is named in the step's words. What a section
 * makes doesn't stand for a food ending in the same word: in a recipe
 * with an orange sauce, "the sauce" is that sauce, not soy sauce.
 */
function findMatches(
  words: readonly { stem: string }[],
  lines: readonly StepLine[],
  made: ReadonlySet<string>
) {
  const matches: Match[] = []
  for (const line of lines) {
    if (!line.food) continue
    for (const name of foodNames(line.food)) {
      const last = name.at(-1)
      for (let start = 0; start < words.length; start++) {
        const whole = name.every(
          (word, offset) => words[start + offset]?.stem === word
        )
        if (whole) {
          const length = name.length
          matches.push({ line, start, length, rank: length * 2 + 1 })
          continue
        }
        const word = words[start]!.stem
        if (!name.includes(word)) continue
        if (word === last && made.has(word)) continue
        matches.push({ line, start, length: 1, rank: word === last ? 3 : 2 })
      }
    }
  }
  return matches
}

/**
 * The lines the step means where its words fit several: the best fit,
 * then the step's own section's, or else the ones no other step's section
 * claims, then the ones with an amount the step gives.
 */
function bestFits(
  fits: readonly Match[],
  context: {
    section: string | null
    claimed: ReadonlySet<string>
    amounts: readonly { quantity: number; unit: string }[]
  }
) {
  const top = Math.max(...fits.map((fit) => fit.rank))
  let lines = [
    ...new Set(fits.filter((fit) => fit.rank === top).map((fit) => fit.line)),
  ]

  const keyOf = (line: StepLine) =>
    line.section ? sectionKey(line.section) : null
  const prefer = (keep: (line: StepLine) => boolean) => {
    const kept = lines.filter(keep)
    if (kept.length > 0) lines = kept
  }
  if (context.section) prefer((line) => keyOf(line) === context.section)
  else prefer((line) => !context.claimed.has(keyOf(line) ?? ""))
  prefer((line) =>
    context.amounts.some(
      (amount) =>
        amount.unit === line.unit &&
        Math.abs(amount.quantity - (line.quantity ?? NaN)) < 0.01
    )
  )
  return lines
}

/**
 * The ingredients a step uses, by id: "Add the garlic" is the garlic.
 * With the recipe's other steps, a step about one of its sections finds
 * that section's lines among lines for the same food ("the soy sauce" of
 * the sauce, not of the marinade), and "everything else" is the rest of
 * that section.
 */
export function ingredientsInStep(
  step: string | RecipeStep,
  ingredients: readonly StepLine[],
  steps: readonly RecipeStep[] = []
) {
  const current = typeof step === "string" ? { text: step } : step
  const sections = new Set(
    ingredients.flatMap((line) =>
      line.section ? [sectionKey(line.section)] : []
    )
  )
  const { section, heading } = stepSection(current, sections)
  const claimed = new Set(
    steps.flatMap((other) => stepSection(other, sections).section ?? [])
  )
  const made = new Set(
    [...sections, ...steps.map((other) => other.section ?? "")].flatMap(
      (name) => {
        const word = foodNames(name).at(-1)?.at(-1)
        return word && PREPARATIONS.has(word) ? [word] : []
      }
    )
  )

  // First words naming the section are its heading, not food it uses.
  const text = heading ? current.text.slice(heading.length) : current.text
  const words = stepWords(text)
  const context = { section, claimed, amounts: statedAmounts(text) }

  const matches = findMatches(words, ingredients, made)
  const used = new Set<string>()
  const excepted = new Set<string>()
  words.forEach((word, at) => {
    const fits = matches.filter(
      (match) => at >= match.start && at < match.start + match.length
    )
    if (fits.length === 0) return
    for (const line of bestFits(fits, context)) {
      ;(word.excepted ? excepted : used).add(line.id)
    }
  })

  if (section && EVERYTHING_ELSE.test(text)) {
    for (const line of ingredients) {
      const inSection = line.section && sectionKey(line.section) === section
      if (inSection && !excepted.has(line.id)) used.add(line.id)
    }
  }
  return used
}
