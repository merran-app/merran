import { randomUUID } from "node:crypto"
import { arch } from "node:os"
import type { EntityManager } from "@mikro-orm/sql"
import { AI_PROVIDERS } from "@merran/shared"
import {
  rangeOf,
  TELEMETRY_BANDS,
  type TelemetryReport,
} from "@merran/shared/telemetry"
import {
  AiKey,
  Household,
  Recipe,
  User,
} from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { ENV_KEYS } from "../ai/settings.ts"
import type { Module, ModuleContext } from "../module.ts"
import { TELEMETRY } from "./settings.ts"

export type { TelemetryReport }

async function databaseName({ config, database }: ModuleContext) {
  if (config.database.kind === "sqlite") return "sqlite"
  const [row] = await database.em
    .getConnection()
    .execute<{ version: string }[]>(
      "select current_setting('server_version_num') as version"
    )
  return `postgres ${Math.floor(Number(row?.version) / 10_000)}`
}

/** The kinds of AI provider with a key anywhere: the server's or a household's. */
async function aiProviders(em: EntityManager, { settings }: ModuleContext) {
  const kinds = new Set<string>()
  for (const [provider, setting] of Object.entries(ENV_KEYS)) {
    if (await settings.server(setting)) kinds.add(provider)
  }
  const keys = await em.find(AiKey, {}, { fields: ["provider"] })
  for (const key of keys) kinds.add(key.provider)
  return AI_PROVIDERS.filter((provider) => kinds.has(provider))
}

/** This server's random id, made the first time it's needed. */
export async function installId(em: EntityManager, ctx: ModuleContext) {
  const id = await ctx.settings.server(TELEMETRY.installId)
  if (id) return id
  return resetInstallId(em, ctx)
}

/** A new random id, so the summaries start afresh. */
export async function resetInstallId(em: EntityManager, ctx: ModuleContext) {
  const id = randomUUID()
  await ctx.settings.keepServer(em, TELEMETRY.installId, id)
  return id
}

/**
 * The next summary, exactly as it would be sent (docs/telemetry.md):
 * nothing about anyone, and counts only as ranges.
 */
export async function buildReport(
  em: EntityManager,
  ctx: ModuleContext,
  modules: readonly Module[]
): Promise<Required<TelemetryReport>> {
  const statuses = await Promise.all(
    modules.map(async (module) => [module.id, (await module.status(ctx)).on])
  )
  return {
    installId: await installId(em, ctx),
    version: ctx.config.version,
    install: ctx.config.installMethod,
    arch: arch(),
    database: await databaseName(ctx),
    modules: Object.fromEntries(statuses),
    aiProviders: await aiProviders(em, ctx),
    households: rangeOf(
      await em.count(Household, {}),
      TELEMETRY_BANDS.households
    ),
    people: rangeOf(await em.count(User, {}), TELEMETRY_BANDS.people),
    recipes: rangeOf(
      await em.count(Recipe, {}, ACROSS_HOUSEHOLDS),
      TELEMETRY_BANDS.recipes
    ),
  }
}
