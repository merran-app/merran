// A recipe's steps or ingredients as the editor shows them: a box for each
// line, and a heading row for each section. The API takes them as lines, a
// "#" line starting a
// section, so these turn lines into rows and back, and make every edit on
// them. Plain functions, so they can be tested without a screen; none of them
// changes the rows it's given.

/** A step or an ingredient, or the heading that starts a section. */
export type LineRow = { key: string; kind: "line" | "section"; text: string }

/** Where the cursor goes after an edit: a row, and a place in its text. */
export type Focus = { key: string; caret: number }

/** Rows after an edit, and where the cursor goes, if anywhere. */
export type Change = { rows: LineRow[]; focus: Focus | null }

let lastKey = 0

/**
 * A key for a new row. A counter, not crypto.randomUUID(), which only works
 * over https, and many servers are plain http on the home network.
 */
export function newRowKey() {
  lastKey += 1
  return `row-${lastKey}`
}

function emptyLine(key: string): LineRow {
  return { key, kind: "line", text: "" }
}

/** A line as a row: "# For the sauce" is a section, anything else a line. */
function parseLine(line: string, key: string): LineRow {
  const text = line.trim()
  if (text.startsWith("#")) {
    return { key, kind: "section", text: withoutHashes(text) }
  }
  return { key, kind: "line", text }
}

function withoutHashes(text: string) {
  return text.replace(/^#+/, "").trim()
}

/** Text typed into a box without the "#"s and spaces in front of it. */
function withoutLeadingHashes(text: string) {
  return text.trimStart().replace(/^#+/, "").trimStart()
}

function indexOf(rows: readonly LineRow[], key: string) {
  const index = rows.findIndex((row) => row.key === key)
  if (index === -1) throw new Error(`No row ${key}`)
  return index
}

/** The rows with the one at `index` swapped for `replacement`. */
function replaceAt(
  rows: readonly LineRow[],
  index: number,
  replacement: readonly LineRow[]
) {
  return [...rows.slice(0, index), ...replacement, ...rows.slice(index + 1)]
}

/**
 * Lines, as the API has them, as rows. Blank lines are skipped. The n-th row
 * takes the key of the n-th of `previous`, so going to text and back keeps
 * the keys, and the form doesn't count it as a change. There's always a row,
 * so there's a box to type in.
 */
export function rowsFromLines(
  lines: readonly string[],
  makeKey: () => string,
  previous: readonly LineRow[] = []
): LineRow[] {
  const filled = lines.filter((line) => line.trim() !== "")
  if (filled.length === 0) return [emptyLine(previous[0]?.key ?? makeKey())]
  return filled.map((line, index) =>
    parseLine(line, previous[index]?.key ?? makeKey())
  )
}

/**
 * The rows as lines, one for each, as the API takes them. A section with no
 * name is a bare "#", which ends the section before it. Empty lines stay,
 * though the server leaves them out, so an error it names by index
 * ("steps.12", "ingredients.12") is about the row at that index.
 */
export function linesFromRows(rows: readonly LineRow[]): string[] {
  return rows.map((row) => {
    if (row.kind === "line") return row.text
    return row.text ? `# ${row.text}` : "#"
  })
}

/** The rows as the text box shows them, without the empty lines. */
export function textFromRows(rows: readonly LineRow[]): string {
  const filled = rows.filter((row) => row.kind === "section" || row.text)
  return linesFromRows(filled).join("\n")
}

/** What's in the text box, back as rows, keeping their keys by position. */
export function rowsFromText(
  text: string,
  previous: readonly LineRow[],
  makeKey: () => string
): LineRow[] {
  return rowsFromLines(text.split(/\r?\n/), makeKey, previous)
}

/**
 * A row's new text. A line typed with a leading "#" becomes a section, as it
 * would be once saved anyway. Its box becomes a heading's field then, so the
 * cursor has to be put back in it.
 */
export function setText(
  rows: readonly LineRow[],
  key: string,
  text: string
): Change {
  const index = indexOf(rows, key)
  const row = rows[index]!
  if (row.kind === "line" && text.trimStart().startsWith("#")) {
    const section: LineRow = {
      key,
      kind: "section",
      text: withoutLeadingHashes(text),
    }
    return {
      rows: replaceAt(rows, index, [section]),
      focus: { key, caret: section.text.length },
    }
  }
  // Until a heading has a name, what's typed may still be the "#"s and the
  // space that made it one ("## Sauce", key by key), which aren't part of
  // it. Once it has one, it keeps whatever's typed, so the cursor stays put.
  const newText =
    row.kind === "section" && row.text === ""
      ? withoutLeadingHashes(text)
      : text
  return {
    rows: replaceAt(rows, index, [{ ...row, text: newText }]),
    focus: null,
  }
}

/**
 * What a line break typed into a box does: Enter, on any keyboard, since a
 * phone's may not say it's Enter. Each line of the box's new value becomes a
 * row, an empty one included, so Enter at the end of a line starts an empty
 * one. The first line keeps the row's key and kind; the others are lines,
 * unless they start with "#". The cursor goes where it was, in its new row.
 */
export function splitAtLineBreaks(
  rows: readonly LineRow[],
  key: string,
  value: string,
  caret: number,
  makeKey: () => string
): Change {
  const index = indexOf(rows, key)
  const row = rows[index]!
  const lines = value.split("\n").map((line) => line.replace(/\r$/, ""))

  // Which line the cursor is on, and where in it.
  let caretLine = lines.length - 1
  let caretOffset = 0
  let lineStart = 0
  for (const [lineIndex, line] of lines.entries()) {
    if (caret <= lineStart + line.length) {
      caretLine = lineIndex
      caretOffset = caret - lineStart
      break
    }
    lineStart += line.length + 1
  }

  const newRows = lines.map((line, lineIndex): LineRow => {
    if (lineIndex === 0) {
      const text = line.trim()
      return row.kind === "section"
        ? { key, kind: "section", text }
        : parseLine(line, key)
    }
    return parseLine(line, makeKey())
  })

  const line = lines[caretLine]!
  const target = newRows[caretLine]!
  const trimmedFromStart = line.length - line.trimStart().length
  const caretInRow = Math.min(
    Math.max(0, caretOffset - trimmedFromStart),
    target.text.length
  )
  return {
    rows: replaceAt(rows, index, newRows),
    focus: { key: target.key, caret: caretInRow },
  }
}

/**
 * Pasting into a box. One line pastes as usual (null). Several make a row of
 * each, from the cursor on: the text before the cursor starts the first, and
 * the text after the selection ends the last. Blank lines are dropped, since
 * pasted lists are often a blank line apart. The cursor goes to the end of
 * what was pasted.
 */
export function pasteLines(
  rows: readonly LineRow[],
  key: string,
  start: number,
  end: number,
  pasted: string,
  makeKey: () => string
): Change | null {
  if (!/\r?\n/.test(pasted)) return null
  const index = indexOf(rows, key)
  const row = rows[index]!
  const after = row.text.slice(end)
  const lines = (row.text.slice(0, start) + pasted).split(/\r?\n/)
  lines[lines.length - 1] += after
  // In a heading, the first line is still the heading.
  if (row.kind === "section") lines[0] = `# ${lines[0]}`

  const filled = lines.filter((line) => line.trim() !== "")
  if (filled.length === 0) {
    return {
      rows: replaceAt(rows, index, [emptyLine(key)]),
      focus: { key, caret: 0 },
    }
  }
  const newRows = filled.map((line, lineIndex) =>
    parseLine(line, lineIndex === 0 ? key : makeKey())
  )
  const last = newRows.at(-1)!
  return {
    rows: replaceAt(rows, index, newRows),
    focus: {
      key: last.key,
      caret: Math.max(0, last.text.length - after.trimEnd().length),
    },
  }
}

/**
 * Backspace at the very start of a row. A heading goes back to being a line,
 * undoing a "#" typed by mistake. A line joins the line above, with a space
 * between, and the cursor where it starts; under a heading it only removes
 * an empty line. Anywhere else it does nothing (null).
 */
export function backspaceAtStart(
  rows: readonly LineRow[],
  key: string
): Change | null {
  const index = indexOf(rows, key)
  const row = rows[index]!
  if (row.kind === "section") {
    return {
      rows: replaceAt(rows, index, [{ ...row, kind: "line" }]),
      focus: { key, caret: 0 },
    }
  }

  const previous = rows[index - 1]
  if (!previous) return null

  const without = rows.filter((other) => other.key !== key)
  if (previous.kind === "section") {
    if (row.text !== "") return null
    return {
      rows: without,
      focus: { key: previous.key, caret: previous.text.length },
    }
  }

  const space = previous.text && row.text ? " " : ""
  const joined: LineRow = {
    ...previous,
    text: previous.text + space + row.text,
  }
  return {
    rows: replaceAt(without, index - 1, [joined]),
    focus: { key: previous.key, caret: previous.text.length + space.length },
  }
}

/** Moves a row up (-1) or down (1). At the top or bottom, nothing moves. */
export function moveRow(
  rows: readonly LineRow[],
  key: string,
  by: -1 | 1
): LineRow[] {
  const index = indexOf(rows, key)
  const other = index + by
  if (other < 0 || other >= rows.length) return [...rows]
  const moved = [...rows]
  moved[index] = rows[other]!
  moved[other] = rows[index]!
  return moved
}

/**
 * Deletes a row. Deleting a heading leaves its lines in the section above.
 * The cursor goes to the end of the row before, or the start of the next one
 * when it was first. With nothing left, there's an empty line to type in.
 */
export function removeRow(
  rows: readonly LineRow[],
  key: string,
  makeKey: () => string
): Change {
  const index = indexOf(rows, key)
  const rest = rows.filter((row) => row.key !== key)
  if (rest.length === 0) {
    const line = emptyLine(makeKey())
    return { rows: [line], focus: { key: line.key, caret: 0 } }
  }
  if (index > 0) {
    const before = rest[index - 1]!
    return { rows: rest, focus: { key: before.key, caret: before.text.length } }
  }
  return { rows: rest, focus: { key: rest[0]!.key, caret: 0 } }
}

/** A heading, with no name yet, just above a row. */
export function insertSectionBefore(
  rows: readonly LineRow[],
  key: string,
  makeKey: () => string
): Change {
  const index = indexOf(rows, key)
  const section: LineRow = { key: makeKey(), kind: "section", text: "" }
  return {
    rows: [...rows.slice(0, index), section, ...rows.slice(index)],
    focus: { key: section.key, caret: 0 },
  }
}

/** An empty line at the end. */
export function appendStep(
  rows: readonly LineRow[],
  makeKey: () => string
): Change {
  const line = emptyLine(makeKey())
  return { rows: [...rows, line], focus: { key: line.key, caret: 0 } }
}

/** A heading, with no name yet, at the end. */
export function appendSection(
  rows: readonly LineRow[],
  makeKey: () => string
): Change {
  const section: LineRow = { key: makeKey(), kind: "section", text: "" }
  return { rows: [...rows, section], focus: { key: section.key, caret: 0 } }
}

/** Each line's number, counted right through the sections, by its key. */
export function lineNumbers(rows: readonly LineRow[]): Map<string, number> {
  const numbers = new Map<string, number>()
  for (const row of rows) {
    if (row.kind === "line") numbers.set(row.key, numbers.size + 1)
  }
  return numbers
}
