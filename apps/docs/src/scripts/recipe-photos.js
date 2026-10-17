// Generated sample photography, using Merran's default marble photo prompt.
const dishes = new Set([
  "chicken",
  "saag",
  "krapow",
  "rigatoni",
  "salmon",
  "tacos",
  "orzo",
  "pancakes",
  "birria",
  "stew",
  "chickpea",
  "fish-tacos",
  "tinga",
  "scampi",
  "soup",
  "oats",
])

export function recipePhoto(dish, base) {
  if (!dishes.has(dish)) throw new Error(`Unknown recipe photo: ${dish}`)
  const src = `${base}images/recipes/${dish}`
  // Recipe names are adjacent; decorative images avoid repeating those labels.
  return `<img src="${src}-320.webp" srcset="${src}-320.webp 320w, ${src}-960.webp 960w" sizes="(max-width: 600px) 80vw, 400px" width="960" height="720" alt="" loading="lazy" decoding="async">`
}
