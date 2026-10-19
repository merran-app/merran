import assert from "node:assert/strict"
import { test } from "node:test"
import { diffLines, diffRows } from "./line-diff.ts"

test("diff preserves both versions with duplicates, moves and empty sections", () => {
  const examples = [
    [[], ["salt"]],
    [["salt"], []],
    [
      ["salt", "salt", "pepper"],
      ["salt", "pepper"],
    ],
    [
      ["# Sauce", "Mix", "Bake"],
      ["# Sauce", "Bake", "Mix"],
    ],
    [
      ["1 cup milk", "Stir"],
      ["2 cups milk", "Stir"],
    ],
  ] as const
  for (const [before, after] of examples) {
    const result = diffLines(before, after)
    assert.deepEqual(
      result.filter((line) => line.kind !== "added").map((line) => line.text),
      before
    )
    assert.deepEqual(
      result.filter((line) => line.kind !== "removed").map((line) => line.text),
      after
    )
  }
})

test("an inserted line does not mark subsequent unchanged lines as changed", () => {
  assert.deepEqual(diffLines(["Mix", "Bake"], ["Mix", "Rest", "Bake"]), [
    { text: "Mix", kind: "kept" },
    { text: "Rest", kind: "added" },
    { text: "Bake", kind: "kept" },
  ])
})

test("pairs consecutive replacements and leaves extra additions in their own row", () => {
  assert.deepEqual(
    diffRows(
      ["1 cup milk", "1 egg", "Stir"],
      ["2 cups milk", "2 eggs", "Salt", "Stir"]
    ),
    [
      { before: "1 cup milk", after: "2 cups milk", kind: "changed" },
      { before: "1 egg", after: "2 eggs", kind: "changed" },
      { before: null, after: "Salt", kind: "added" },
      { before: "Stir", after: "Stir", kind: "kept" },
    ]
  )
})

test("unchanged lines separate unrelated removals and additions", () => {
  assert.deepEqual(diffRows(["Milk", "Stir"], ["Stir", "Serve"]), [
    { before: "Milk", after: null, kind: "removed" },
    { before: "Stir", after: "Stir", kind: "kept" },
    { before: null, after: "Serve", kind: "added" },
  ])
})

test("paired rows preserve duplicate lines, empty strings and both complete versions", () => {
  const examples = [
    [[], ["Salt"]],
    [["Salt"], []],
    [
      ["Salt", "Salt", "Pepper"],
      ["Salt", "Pepper"],
    ],
    [
      ["Mix", "Bake"],
      ["Bake", "Mix"],
    ],
    [["", "Old", "Extra"], ["New"]],
  ] as const
  for (const [before, after] of examples) {
    const rows = diffRows(before, after)
    assert.deepEqual(
      rows.flatMap((row) => (row.before === null ? [] : [row.before])),
      before
    )
    assert.deepEqual(
      rows.flatMap((row) => (row.after === null ? [] : [row.after])),
      after
    )
  }
})
