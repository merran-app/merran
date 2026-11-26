/**
 * Where the next page of an offset-paged list starts: after what's loaded,
 * while the last page says there's more. A page that came back empty ends it
 * even if its total says otherwise, since the list shrank between pages and
 * asking again would only get another empty page.
 */
export function nextOffset<Page extends { total: number }>(
  pages: readonly Page[],
  count: (page: Page) => number
): number | undefined {
  const last = pages[pages.length - 1]
  if (!last || count(last) === 0) return undefined

  const loaded = pages.reduce((sum, page) => sum + count(page), 0)
  return loaded < last.total ? loaded : undefined
}

/**
 * Each item once, the first of its id, in order. A list that changes between
 * pages (a recipe imported in another tab) can repeat a card across two pages.
 */
export function uniqueById<Item extends { id: string }>(
  items: readonly Item[]
): Item[] {
  const seen = new Set<string>()
  const unique: Item[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    unique.push(item)
  }
  return unique
}
