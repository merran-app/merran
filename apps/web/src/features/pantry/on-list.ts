/** What a row on the shopping list needs for this: its name, and if it's bought. */
type ListRow = { name: string; checked: boolean }

/** "Basmati  Rice" and " basmati rice " are the same thing on a list. */
function key(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Which of `names` to put on the list, and which are on it already, not
 * yet bought. Putting something on the list twice, by swiping a pantry
 * item again, shouldn't give it two rows.
 */
export function splitOnList(
  names: readonly string[],
  rows: readonly ListRow[]
): { adding: string[]; already: string[] } {
  const onList = new Set(
    rows.filter((row) => !row.checked).map((row) => key(row.name))
  )
  const adding: string[] = []
  const already: string[] = []
  for (const name of names) {
    if (onList.has(key(name))) already.push(name)
    else adding.push(name)
  }
  return { adding, already }
}
