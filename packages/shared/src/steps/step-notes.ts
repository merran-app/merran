/**
 * The recipe's notes a step points to: "(Note 3)" is the note numbered 3,
 * a paragraph of the notes starting "3." or "Note 3", as many recipe
 * sites write them.
 */
export function notesInStep(step: string, notes: string | null | undefined) {
  if (!notes) return []
  const numbers = new Set(
    [...step.matchAll(/\bnotes?\s*#?\s*(\d{1,2})\b/gi)].map(
      (found) => found[1]!
    )
  )
  const paragraphs = notes
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return [...numbers].flatMap((number) => {
    const start = new RegExp(String.raw`^(?:note\s*)?${number}\s*[.):–—-]`, "i")
    const note = paragraphs.find((paragraph) => start.test(paragraph))
    return note ? [note] : []
  })
}
