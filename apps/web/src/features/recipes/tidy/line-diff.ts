export type DiffLine = { text: string; kind: "kept" | "added" | "removed" }

export type DiffRow = {
  before: string | null
  after: string | null
  kind: "kept" | "changed" | "added" | "removed"
}

/** Pair replacements within each changed block; unchanged lines anchor the rows. */
export function diffRows(
  before: readonly string[],
  after: readonly string[]
): DiffRow[] {
  const rows: DiffRow[] = []
  let removed: string[] = []
  let added: string[] = []

  function flushChanges() {
    for (
      let index = 0;
      index < Math.max(removed.length, added.length);
      index++
    ) {
      const previous = removed[index] ?? null
      const proposed = added[index] ?? null
      rows.push({
        before: previous,
        after: proposed,
        kind:
          previous === null
            ? "added"
            : proposed === null
              ? "removed"
              : "changed",
      })
    }
    removed = []
    added = []
  }

  for (const line of diffLines(before, after)) {
    if (line.kind === "kept") {
      flushChanges()
      rows.push({ before: line.text, after: line.text, kind: "kept" })
    } else if (line.kind === "removed") {
      removed.push(line.text)
    } else {
      added.push(line.text)
    }
  }
  flushChanges()
  return rows
}

/** Keep matching lines in order, including repeated ingredients and moved steps. */
export function diffLines(
  before: readonly string[],
  after: readonly string[]
): DiffLine[] {
  const lengths = Array.from(
    { length: before.length + 1 },
    () => new Uint32Array(after.length + 1)
  )
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i]![j]! =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      lines.push({ text: before[i++]!, kind: "kept" })
      j++
    } else if (
      i < before.length &&
      (j === after.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
    ) {
      lines.push({ text: before[i++]!, kind: "removed" })
    } else {
      lines.push({ text: after[j++]!, kind: "added" })
    }
  }
  return lines
}
