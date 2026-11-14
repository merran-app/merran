import assert from "node:assert/strict"
import { test } from "node:test"
import {
  appendSection,
  appendStep,
  insertSectionBefore,
  joinWithPrevious,
  linesFromRows,
  moveRow,
  pasteLines,
  removeRow,
  rowsFromLines,
  rowsFromText,
  setText,
  splitAtLineBreaks,
  stepNumbers,
  textFromRows,
  type StepRow,
} from "./step-rows.ts"

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
function exactly(...lines: string[]): StepRow[] {
  const keys = counter()
  return lines.map((line): StepRow => {
    if (line === "") return { key: keys(), kind: "step", text: "" }
    return rowsFromLines([line], keys)[0]!
  })
}

test("rows and lines go both ways, with a bare # ending a section", () => {
  const lines = ["Heat the oven.", "# For the sauce", "Whisk.", "#", "Serve."]
  const result = rows(...lines)
  assert.deepEqual(
    result.map((row) => row.kind),
    ["step", "section", "step", "section", "step"]
  )
  assert.equal(result[1]?.text, "For the sauce")
  assert.equal(result[3]?.text, "")
  assert.deepEqual(linesFromRows(result), lines)
  assert.equal(rows("## For the sauce")[0]?.text, "For the sauce")
})

test("blank lines are skipped, and there's always a row to type in", () => {
  assert.deepEqual(linesFromRows(rows("", "  Stir.  ", " ")), ["Stir."])
  assert.deepEqual(rowsFromLines([], counter()), [
    { key: "k1", kind: "step", text: "" },
  ])
})

test("empty steps stay as empty lines, so a server error's index is the row's", () => {
  const list: StepRow[] = [
    { key: "a", kind: "step", text: "Stir." },
    { key: "b", kind: "step", text: "" },
    { key: "c", kind: "step", text: "Serve." },
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
  assert.equal(change.rows[1]?.kind, "step")
  assert.deepEqual(change.focus, { key: change.rows[1]?.key, caret: 0 })
})

test("Backspace at the start joins a step to the one above", () => {
  const two = rows("Heat the oven.", "Toss.")
  const joined = joinWithPrevious(two, "k2")
  assert.deepEqual(linesFromRows(joined?.rows ?? []), ["Heat the oven. Toss."])
  assert.deepEqual(joined?.focus, { key: "k1", caret: 15 })

  const empty = joinWithPrevious(exactly("Stir.", ""), "k2")
  assert.deepEqual(linesFromRows(empty?.rows ?? []), ["Stir."])
  assert.deepEqual(empty?.focus, { key: "k1", caret: 5 })

  const intoEmpty = joinWithPrevious(exactly("", "Stir."), "k2")
  assert.deepEqual(linesFromRows(intoEmpty?.rows ?? []), ["Stir."])
  assert.deepEqual(intoEmpty?.focus, { key: "k1", caret: 0 })
})

test("Backspace leaves the first row and a heading alone, but removes an empty step", () => {
  assert.equal(joinWithPrevious(rows("Stir."), "k1"), null)
  assert.equal(joinWithPrevious(rows("# Sauce", "Whisk."), "k2"), null)
  const removed = joinWithPrevious(exactly("# Sauce", ""), "k2")
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
  const step = appendStep(rows("a"), counter("n"))
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
  const numbers = stepNumbers(rows("a", "# S", "b", "c"))
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
  const withEmpty: StepRow[] = [
    { key: "a", kind: "step", text: "Stir." },
    { key: "b", kind: "step", text: "" },
  ]
  assert.equal(textFromRows(withEmpty), "Stir.")
})
