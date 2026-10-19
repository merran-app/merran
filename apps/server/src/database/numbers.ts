/** A double column, which the database driver may hand back as text. */
export const toNumber = (value: string | number | null | undefined) =>
  value == null ? null : Number(value)
