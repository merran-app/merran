import assert from "node:assert/strict"
import { test } from "node:test"
import {
  appendSection,
  appendLine,
  insertSectionBefore,
  backspaceAtStart,
  linesFromRows,
  moveRow,
  pasteLines,
  removeRow,
  rowsFromLines,
  rowsFromText,
  setText,
  splitAtLineBreaks,
  lineNumbers,
  textFromRows,
  type LineRow,
} from "./line-rows.ts"

/**
 * Keys that are the same every run: k1, k2... for the rows a test starts
 * with, n1, n2... for the ones an edit adds, so they never clash.
 */
function counter(prefix = "k") {
  let next = 0
  return () => `${prefix}${++next}`
}

function rows(...lines: string[]) {
  return rowsFromLines(lines, counter())
}

/** Rows for exactly these lines: rows() skips blank ones, this makes them empty steps. */
function exactly(...lines: string[]): LineRow[] {
  const keys = counter()
  return lines.map((line): LineRow => {
    if (line === "") return { key: keys(), kind: "line", text: "" }
    return rowsFromLines([line], keys)[0]!
  })
}

test("rows and lines go both ways, with a bare # ending a section", () => {
  const lines = ["Heat the oven.", "# For the sauce", "Whisk.", "#", "Serve."]
  const result = rows(...lines)
  assert.deepEqual(
    result.map((row) => row.kind),
    ["line", "section", "line", "section", "line"]
  )
  assert.equal(result[1]?.text, "For the sauce")
  assert.equal(result[3]?.text, "")
  assert.deepEqual(linesFromRows(result), lines)
  assert.equal(rows("## For the sauce")[0]?.text, "For the sauce")
})

test("blank lines are skipped, and there's always a row to type in", () => {
  assert.deepEqual(linesFromRows(rows("", "  Stir.  ", " ")), ["Stir."])
  assert.deepEqual(rowsFromLines([], counter()), [
    { key: "k1", kind: "line", text: "" },
  ])
})

test("empty steps stay as empty lines, so a server error's index is the row's", () => {
  const list: LineRow[] = [
    { key: "a", kind: "line", text: "Stir." },
    { key: "b", kind: "line", text: "" },
    { key: "c", kind: "line", text: "Serve." },
  ]
  assert.deepEqual(linesFromRows(list), ["Stir.", "", "Serve."])
})

test("Enter splits a step at the cursor", () => {
  const start = rows("Heat the oven. Toss the vegetables.")
  const change = splitAtLineBreaks(
    start,
    "k1",
    "Heat the oven.\n Toss the vegetables.",
    15,
    counter("n")
  )
  assert.deepEqual(linesFromRows(change.rows), [
    "Heat the oven.",
    "Toss the vegetables.",
  ])
  assert.equal(change.rows[0]?.key, "k1")
  assert.deepEqual(change.focus, { key: change.rows[1]?.key, caret: 0 })
})

test("Enter at the end starts an empty step, and at the start puts one above", () => {
  const atEnd = splitAtLineBreaks(
    rows("Stir."),
    "k1",
    "Stir.\n",
    6,
    counter("n")
  )
  assert.deepEqual(linesFromRows(atEnd.rows), ["Stir.", ""])
  assert.deepEqual(atEnd.focus, { key: atEnd.rows[1]?.key, caret: 0 })

  const atStart = splitAtLineBreaks(
    rows("Stir."),
    "k1",
    "\nStir.",
    1,
    counter("n")
  )
  assert.deepEqual(linesFromRows(atStart.rows), ["", "Stir."])
  assert.deepEqual(atStart.focus, { key: atStart.rows[1]?.key, caret: 0 })
})

test("Enter in a section starts a step under it", () => {
  const change = splitAtLineBreaks(
    rows("# Sauce"),
    "k1",
    "Sauce\n",
    6,
    counter("n")
  )
  assert.deepEqual(linesFromRows(change.rows), ["# Sauce", ""])
  assert.equal(change.rows[1]?.kind, "line")
  assert.deepEqual(change.focus, { key: change.rows[1]?.key, caret: 0 })
})

test("Backspace at the start joins a step to the one above", () => {
  const two = rows("Heat the oven.", "Toss.")
  const joined = backspaceAtStart(two, "k2")
  assert.deepEqual(linesFromRows(joined?.rows ?? []), ["Heat the oven. Toss."])
  assert.deepEqual(joined?.focus, { key: "k1", caret: 15 })

  const empty = backspaceAtStart(exactly("Stir.", ""), "k2")
  assert.deepEqual(linesFromRows(empty?.rows ?? []), ["Stir."])
  assert.deepEqual(empty?.focus, { key: "k1", caret: 5 })

  const intoEmpty = backspaceAtStart(exactly("", "Stir."), "k2")
  assert.deepEqual(linesFromRows(intoEmpty?.rows ?? []), ["Stir."])
  assert.deepEqual(intoEmpty?.focus, { key: "k1", caret: 0 })
})

test("Backspace at the start of a heading turns it back into a step", () => {
  const change = backspaceAtStart(rows("Stir.", "# Stir in the cream"), "k2")
  assert.deepEqual(change?.rows[1], {
    key: "k2",
    kind: "line",
    text: "Stir in the cream",
  })
  assert.deepEqual(change?.focus, { key: "k2", caret: 0 })

  const first = backspaceAtStart(rows("# Sauce"), "k1")
  assert.deepEqual(first?.rows, [{ key: "k1", kind: "line", text: "Sauce" }])
})

test("Backspace leaves the first step, and a step under a heading, alone, but removes an empty step", () => {
  assert.equal(backspaceAtStart(rows("Stir."), "k1"), null)
  assert.equal(backspaceAtStart(rows("# Sauce", "Whisk."), "k2"), null)
  const removed = backspaceAtStart(exactly("# Sauce", ""), "k2")
  assert.deepEqual(linesFromRows(removed?.rows ?? []), ["# Sauce"])
  assert.deepEqual(removed?.focus, { key: "k1", caret: 5 })
})

test("pasting several lines makes a step of each, from the cursor on", () => {
  const change = pasteLines(
    rows("Preheat. Serve."),
    "k1",
    9,
    9,
    "Toss.\r\n\r\nBake.\n# Sauce\nWhisk. ",
    counter("n")
  )
  assert.deepEqual(linesFromRows(change?.rows ?? []), [
    "Preheat. Toss.",
    "Bake.",
    "# Sauce",
    "Whisk. Serve.",
  ])
  assert.equal(change?.rows[0]?.key, "k1")
  assert.deepEqual(change?.focus, { key: change?.rows[3]?.key, caret: 7 })

  const replacing = pasteLines(rows("abcdef"), "k1", 2, 4, "X\nY", counter("n"))
  assert.deepEqual(linesFromRows(replacing?.rows ?? []), ["abX", "Yef"])
  assert.deepEqual(replacing?.focus, { key: replacing?.rows[1]?.key, caret: 1 })

  assert.equal(
    pasteLines(rows("Stir."), "k1", 5, 5, " well", counter("n")),
    null
  )
})

test("pasting into a section keeps its first line a heading", () => {
  const change = pasteLines(
    rows("# Sauce"),
    "k1",
    5,
    5,
    "\nWhisk.\nPour.",
    counter("n")
  )
  assert.deepEqual(linesFromRows(change?.rows ?? []), [
    "# Sauce",
    "Whisk.",
    "Pour.",
  ])
})

test("a step typed with a leading # becomes a section", () => {
  const change = setText(rows("Stir."), "k1", "# For the sauce")
  assert.deepEqual(change.rows, [
    { key: "k1", kind: "section", text: "For the sauce" },
  ])
  assert.deepEqual(change.focus, { key: "k1", caret: 13 })
  assert.equal(setText(rows("Stir."), "k1", "Stir well.").focus, null)
})

test("a heading never starts with spaces, so typing # and then a space leaves none", () => {
  const heading = setText(rows("Stir."), "k1", "#").rows
  assert.deepEqual(setText(heading, "k1", " ").rows[0]?.text, "")
  assert.deepEqual(setText(heading, "k1", " Extra").rows[0]?.text, "Extra")
})

test("a heading with a name keeps what's typed, spaces and all", () => {
  // Backspacing over "For" leaves the space before "the" while it's edited.
  const named = rows("# For the sauce")
  assert.equal(setText(named, "k1", " the sauce").rows[0]?.text, " the sauce")
  // A phrase typed at once into an empty heading keeps its last space.
  const empty = setText(rows("Stir."), "k1", "#").rows
  assert.equal(setText(empty, "k1", "For the ").rows[0]?.text, "For the ")
})

test("the #s typed into an empty heading aren't part of its name", () => {
  const empty = setText(rows("Stir."), "k1", "#").rows
  assert.equal(setText(empty, "k1", "#").rows[0]?.text, "")
  assert.equal(setText(empty, "k1", "# Sauce").rows[0]?.text, "Sauce")
})

test("moving swaps with the neighbour, and does nothing at the ends", () => {
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k2", -1)), [
    "b",
    "a",
    "c",
  ])
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k1", -1)), [
    "a",
    "b",
    "c",
  ])
  assert.deepEqual(linesFromRows(moveRow(rows("a", "b", "c"), "k3", 1)), [
    "a",
    "b",
    "c",
  ])
})

test("deleting a heading puts its steps in the section above", () => {
  const change = removeRow(rows("# One", "a", "# Two", "b"), "k3", counter("n"))
  assert.deepEqual(linesFromRows(change.rows), ["# One", "a", "b"])
  assert.deepEqual(change.focus, { key: "k2", caret: 1 })

  const first = removeRow(rows("a", "b"), "k1", counter("n"))
  assert.deepEqual(first.focus, { key: "k2", caret: 0 })

  const last = removeRow(rows("a"), "k1", counter("n"))
  assert.deepEqual(linesFromRows(last.rows), [""])
  assert.deepEqual(last.focus, { key: last.rows[0]?.key, caret: 0 })
})

test("adding a step or a section puts the cursor in it", () => {
  const step = appendLine(rows("a"), counter("n"))
  assert.deepEqual(linesFromRows(step.rows), ["a", ""])
  assert.deepEqual(step.focus, { key: step.rows[1]?.key, caret: 0 })

  const section = appendSection(rows("a"), counter("n"))
  assert.deepEqual(linesFromRows(section.rows), ["a", "#"])
  assert.deepEqual(section.focus, { key: section.rows[1]?.key, caret: 0 })

  const above = insertSectionBefore(rows("a", "b"), "k2", counter("n"))
  assert.deepEqual(linesFromRows(above.rows), ["a", "#", "b"])
  assert.deepEqual(above.focus, { key: above.rows[1]?.key, caret: 0 })
})

test("steps are numbered right through the sections", () => {
  const numbers = lineNumbers(rows("a", "# S", "b", "c"))
  assert.deepEqual(
    [...numbers],
    [
      ["k1", 1],
      ["k3", 2],
      ["k4", 3],
    ]
  )
})

test("text and back keeps the keys, so nothing looks changed", () => {
  const start = rows("a", "# S", "b")
  const text = textFromRows(start)
  assert.equal(text, "a\n# S\nb")
  assert.deepEqual(rowsFromText(text, start, counter("n")), start)
  const withEmpty: LineRow[] = [
    { key: "a", kind: "line", text: "Stir." },
    { key: "b", kind: "line", text: "" },
  ]
  assert.equal(textFromRows(withEmpty), "Stir.")
})
