import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Migrator } from "@mikro-orm/migrations"
import { MikroORM as PostgresORM } from "@mikro-orm/postgresql"
import type { MikroORM } from "@mikro-orm/sql"
import { MikroORM as SqliteORM } from "@mikro-orm/sqlite"
import { CompiledQuery } from "kysely"
import type { DatabaseConfig } from "../core/config.ts"
import { ShelfChanges } from "../services/recipes/discover/sites/shelf-cache.ts"
import { AtCommit } from "./at-commit.ts"
import { entities } from "./entities/index.ts"

export type Database = MikroORM

/**
 * What SQLite is told as its connection opens, in this order.
 *
 * Write-ahead logging lets readers go on while another process writes; it
 * doesn't help inside this one, which has a single connection, so a query
 * from another fork waits for an open transaction to end (Kysely's
 * connection mutex). Code inside a transaction must never await a query
 * from another fork, or the two wait on each other for good.
 *
 * `synchronous = normal` is safe with the log: a power cut can lose the last
 * commits but never corrupts the file. Temporary tables and indexes stay in
 * memory, a busy file is waited for rather than failed, and 64 MB of pages
 * are kept (a negative size is in KiB).
 */
export const SQLITE_PRAGMAS = [
  "pragma journal_mode = wal",
  "pragma synchronous = normal",
  "pragma temp_store = memory",
  "pragma busy_timeout = 5000",
  "pragma cache_size = -65536",
]

/** The part of Kysely's connection that runs a statement. */
type SqliteConnection = {
  executeQuery(query: CompiledQuery): Promise<unknown>
}

/** Runs `SQLITE_PRAGMAS` on the connection MikroORM has just made. */
async function applySqlitePragmas(connection: unknown) {
  const { executeQuery } = connection as SqliteConnection
  for (const sql of SQLITE_PRAGMAS) {
    await executeQuery.call(connection, CompiledQuery.raw(sql))
  }
}

/** Each database has its own migrations, generated from the same entities. */
export function migrationsFolder(kind: DatabaseConfig["kind"]) {
  return fileURLToPath(new URL(`./migrations/${kind}/`, import.meta.url))
}

function options(kind: DatabaseConfig["kind"]) {
  const folder = migrationsFolder(kind)
  return {
    entities,
    // Work a transaction does as it commits (at-commit.ts), and the shelf
    // kept in memory dropped as a shelf row changes (shelf-cache.ts).
    subscribers: [new AtCommit(), new ShelfChanges()],
    extensions: [Migrator],
    migrations: {
      path: folder,
      pathTs: folder,
      glob: "!(*.d).ts",
      emit: "ts" as const,
      snapshot: true,
      // Not named after the database, so every run finds the same one.
      snapshotName: ".snapshot",
      silent: true,
    },
    // Always work through a fork: one per request, or forHousehold().
    allowGlobalContext: false,
  }
}

/** Connects to the database. Call `migrate()` before using it. */
export async function openDatabase(config: DatabaseConfig): Promise<Database> {
  if (config.kind === "postgres") {
    return PostgresORM.init({ ...options("postgres"), clientUrl: config.url })
  }

  if (config.file !== ":memory:") {
    mkdirSync(dirname(config.file), { recursive: true })
  }
  const orm = await SqliteORM.init({
    ...options("sqlite"),
    dbName: config.file,
    onCreateConnection: applySqlitePragmas,
  })
  // Lets SQLite refresh the statistics its planner uses where they're stale
  // or missing (0x10000 checks every table, 0x2 is the usual analysis).
  await orm.em.getConnection().execute("pragma optimize = 0x10002")
  return orm
}

/** Applies any migrations not yet run. Returns their names. */
export async function migrate(database: Database): Promise<string[]> {
  const applied = await database.migrator.up()
  return applied.map((migration) => migration.name)
}
