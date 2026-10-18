import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import type { Database, Statement } from "../env.ts"

// D1, as far as the receiver uses it, on Node's SQLite: D1 is SQLite, so the
// same SQL and migrations run here.

const MIGRATIONS = join(import.meta.dirname, "../../migrations")

type Value = string | number | null

class NodeStatement implements Statement {
  readonly #db: DatabaseSync
  readonly #sql: string
  readonly #values: Value[]

  constructor(db: DatabaseSync, sql: string, values: Value[] = []) {
    this.#db = db
    this.#sql = sql
    this.#values = values
  }

  #prepared(): StatementSync {
    return this.#db.prepare(this.#sql)
  }

  bind(...values: Value[]) {
    return new NodeStatement(this.#db, this.#sql, values)
  }

  async first<T>() {
    return (this.#prepared().get(...this.#values) ?? null) as T | null
  }

  async all<T>() {
    return { results: this.#prepared().all(...this.#values) as T[] }
  }

  async run() {
    return this.runNow()
  }

  runNow() {
    return this.#prepared().run(...this.#values)
  }
}

/** An empty receiver database, its migrations applied. */
export function testDatabase(): Database & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:")
  for (const file of readdirSync(MIGRATIONS).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, file), "utf8"))
  }
  return {
    sqlite,
    prepare: (sql) => new NodeStatement(sqlite, sql),
    async batch(statements) {
      sqlite.exec("BEGIN")
      try {
        const results = statements.map((statement) =>
          (statement as NodeStatement).runNow()
        )
        sqlite.exec("COMMIT")
        return results
      } catch (error) {
        sqlite.exec("ROLLBACK")
        throw error
      }
    },
  }
}
