import type { PhotoStyle } from "../../../modules/photos/settings.ts"

/** Each style's look, said the same way every time. */
export const STYLE_PROMPTS: Record<PhotoStyle, string> = {
  marble: `Style: a realistic, appetizing food photograph for a modern cookbook.
- Dishware, all matte charcoal-black stoneware: a plate for most food; a bowl for a soup, stew, curry, noodles or salad; for a sauce, dressing, dip or spread, a small ramekin with a little spoon in it, shot a little closer; a simple glass for a drink.
- It sits on a white Carrara marble counter with soft grey veining.
- Soft natural daylight from the left with gentle shadows, shot from about 45 degrees with a shallow depth of field, the dish filling most of the frame.
- Minimal styling: at most a folded linen napkin or a fresh garnish that belongs in the recipe. True-to-life colors.`,
  rustic: `Style: a realistic, appetizing food photograph for a farmhouse cookbook.
- Dishware: handmade earthenware in warm, speckled glazes; a bowl for a soup, stew, curry, noodles or salad; a small dish for a sauce or dip; a jar or tumbler for a drink.
- It sits on a weathered oak table, with a rumpled oatmeal linen cloth to one side.
- Warm window light from the side, shot from about 45 degrees with a shallow depth of field, the dish filling most of the frame.
- Homely styling: a wooden spoon, or a few of the fresh ingredients, nothing more. True-to-life colors.`,
  bright: `Style: a bright, airy, realistic food photograph for a fresh modern cookbook.
- Dishware: plain white porcelain; a shallow bowl for a soup, stew, curry, noodles or salad; a small dish for a sauce or dip; a clear glass for a drink.
- It sits on a pale linen tablecloth, shot from directly overhead as a clean flat lay.
- Bright, even, soft daylight with barely any shadow, the dish in the middle of the frame with room around it.
- Minimal styling: a fork or spoon and a fresh garnish that belongs in the recipe. Clean, true-to-life colors.`,
  moody: `Style: a dark, moody, realistic food photograph for a restaurant cookbook.
- Dishware: dark slate-grey ceramic; a bowl for a soup, stew, curry, noodles or salad; a small dish for a sauce or dip; a heavy glass for a drink.
- It sits on a black stone surface against a near-black background.
- A single soft light from one side with deep, dramatic shadows, shot from about 30 degrees with a shallow depth of field.
- Spare styling: at most a dark napkin or a scattering of a fresh garnish that belongs in the recipe. Rich, true-to-life colors.`,
}

const ALWAYS = "No text, labels, logos, hands, people or cluttered props."

/** Ingredients that don't say anything about how a dish looks. */
const UNSEEN =
  /^(?:kosher |sea |table )?salt$|^(?:black |white )?pepper$|^water$|^ice$|^cooking spray$|^(?:olive |vegetable |canola |neutral )?oil$/i

/** What to picture: the dish, what's in it, and how it's finished (often the last steps). */
export function photoPrompt(
  recipe: {
    name: string
    description?: string | null
    ingredients: { food?: string | null; rawText: string }[]
    steps: { text: string }[]
  },
  style: PhotoStyle
) {
  const foods = [
    ...new Set(
      recipe.ingredients
        .map((line) => (line.food ?? line.rawText).trim().toLowerCase())
        .filter((food) => food && !UNSEEN.test(food))
    ),
  ].slice(0, 12)
  const finishing = recipe.steps
    .slice(-2)
    .map((step) => step.text)
    .join(" ")
    .slice(0, 500)
  return [
    `A photograph of ${recipe.name}, finished and ready to eat.`,
    recipe.description && `About the dish: ${recipe.description.slice(0, 400)}`,
    foods.length > 0 && `Made with: ${foods.join(", ")}.`,
    finishing && `How it's finished: ${finishing}`,
    STYLE_PROMPTS[style],
    ALWAYS,
  ]
    .filter(Boolean)
    .join("\n\n")
}
