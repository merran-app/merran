// A search fills a row of four tiles while it works, so the page doesn't
// jump as recipes arrive.
const ROW = 4

/** How many skeleton cards follow the recipes found so far. */
export function placeholders(search: {
  status: string
  recipes: readonly unknown[]
}): number {
  if (search.status !== "searching") return 0
  return Math.max(0, ROW - search.recipes.length)
}
