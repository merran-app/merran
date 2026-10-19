/** Lines tidied, and kept to the editor's limits. */
export const cleanLines = (values: string[], max: number, length: number) =>
  values
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max)
    .map((line) => line.slice(0, length))
