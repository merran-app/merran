import type { Database } from "../../database/orm.ts"

/** Kysely's plugin type, taken from MikroORM's Kysely so the server needn't depend on Kysely itself. */
type KyselyPlugin = Parameters<
  ReturnType<Database["em"]["getKysely"]>["withPlugin"]
>[0]

/** How Better Auth's adapter names a joined table's columns: `_joined_user_created_at`. */
const JOINED_PREFIX = "_joined_"

/**
 * Better Auth on Postgres expects dates from the database, but MikroORM has
 * Postgres hand back timestamps as strings. Better Auth compares them as they
 * come, and a string is never less than a date, so an expired session kept
 * working. This turns the columns that hold dates back into dates in what
 * Better Auth reads, and leaves what it writes alone.
 *
 * SQLite needs none of this: Better Auth converts its dates itself there.
 */
export function readPostgresDates(database: Database): KyselyPlugin {
  const isDateColumn = dateColumnMatcher(dateColumns(database))

  return {
    transformQuery: ({ node }) => node,
    transformResult: async ({ result }) => ({
      ...result,
      rows: result.rows.map((row) => withDates(row, isDateColumn)),
    }),
  }
}

/**
 * Every column that holds a date, by name. A name that holds a date in one
 * table and something else in another is left out, so nothing that isn't a
 * date is ever turned into one.
 */
function dateColumns(database: Database): Set<string> {
  const dates = new Set<string>()
  const others = new Set<string>()

  for (const entity of database.getMetadata().getAll().values()) {
    for (const property of entity.props) {
      const names = property.runtimeType === "Date" ? dates : others
      for (const column of property.fieldNames ?? []) {
        names.add(column)
      }
    }
  }

  return new Set([...dates].filter((column) => !others.has(column)))
}

/** Whether a result's key is a date column, on its own table or a joined one. */
function dateColumnMatcher(columns: Set<string>) {
  const known = new Map<string, boolean>()

  return (key: string) => {
    let isDate = known.get(key)
    if (isDate === undefined) {
      isDate =
        columns.has(key) ||
        (key.startsWith(JOINED_PREFIX) &&
          [...columns].some((column) => key.endsWith(`_${column}`)))
      known.set(key, isDate)
    }
    return isDate
  }
}

function withDates(
  row: Record<string, unknown>,
  isDateColumn: (key: string) => boolean
) {
  let converted: Record<string, unknown> | null = null

  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== "string" || !isDateColumn(key)) continue
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    converted ??= { ...row }
    converted[key] = date
  }

  return converted ?? row
}
