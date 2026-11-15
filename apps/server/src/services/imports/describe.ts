import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  CookNote,
  Import,
  ImportItem,
  PlanEntry,
  Recipe,
  RecipeVersion,
  type ImportItemState,
} from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { photoUrls } from "../recipes/photos/photos.ts"

// Imports as the Imports page shows them: each one's summary, and an
// import's page, with what came in, what was already there and what didn't,
// a hundred at a time.

/** How many of each list an import's page shows at a time. */
export const IMPORT_PAGE_SIZE = 100

/** Where each list on an import's page starts. */
export type ImportPages = {
  cameIn?: number
  alreadyHere?: number
  didntComeIn?: number
}

/**
 * Where a link has got to. "adding" and "stopped" are only ever shown: the
 * first waiting link while it runs, and any waiting once it's finished.
 */
export type ShownItemState = ImportItemState | "adding" | "stopped"

const finished = (record: Import) =>
  record.status === "done" ||
  record.status === "failed" ||
  record.status === "cancelled"

/** A recipe as an import's page links to it. */
function recipeOf(recipe: Recipe) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
  }
}

/** An import's line on the Imports page. */
export function importSummary(record: Import) {
  const done = record.added + record.already + record.failed
  const user = record.createdBy?.getEntity()
  return {
    id: record.id,
    kind: record.kind,
    source: record.source ?? null,
    tag: record.tag ?? null,
    status: record.undoneAt ? ("undone" as const) : record.status,
    total: record.total,
    done,
    added: record.added,
    already: record.already,
    failed: record.failed,
    // What it never got to, once it's finished.
    stopped: finished(record) ? Math.max(0, record.total - done) : 0,
    startedBy: user ? { id: user.id, name: user.name } : null,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
    undoneAt: record.undoneAt?.toISOString() ?? null,
  }
}

/** The household's imports for the Imports page, newest first. */
export async function listImports(em: EntityManager) {
  const records = await em.find(
    Import,
    { listed: true },
    {
      orderBy: { createdAt: "desc", id: "desc" },
      populate: ["createdBy"],
      limit: 200,
    }
  )
  return records.map(importSummary)
}

/** One of the household's imports, or not found. */
export async function findImport(em: EntityManager, importId: string) {
  const found = await em.findOne(
    Import,
    { id: importId },
    { populate: ["createdBy"] }
  )
  if (!found) {
    throw new AppError(
      "not_found",
      "import_not_found",
      "There's no such import."
    )
  }
  return found
}

/** Recipes by id, Recently deleted included. */
async function recipesById(em: EntityManager, ids: readonly string[]) {
  const recipes = await em.find(
    Recipe,
    { id: { $in: [...ids] } },
    WITH_DELETED_RECIPES
  )
  return new Map(recipes.map((recipe) => [recipe.id, recipe]))
}

/**
 * Loading items with their recipes as they are, Recently deleted included:
 * otherwise the recipe's own filter would blank an item's recipe once it's
 * in Recently deleted.
 */
export const WITH_DELETED_RECIPES = {
  filters: { [NOT_DELETED_FILTER]: false },
} as const

/** One page of an import's items in one state. */
async function pageOf(
  em: EntityManager,
  importId: string,
  state: ImportItemState,
  offset = 0
) {
  const rows = await em.find(
    ImportItem,
    { import: importId, state },
    {
      ...WITH_DELETED_RECIPES,
      orderBy: { position: "asc" },
      offset,
      limit: IMPORT_PAGE_SIZE + 1,
    }
  )
  return {
    rows: rows.slice(0, IMPORT_PAGE_SIZE),
    more: rows.length > IMPORT_PAGE_SIZE,
  }
}

/**
 * What came in, each recipe saying whether it's been changed, planned or
 * cooked since, or is in Recently deleted: what Undo asks about.
 */
async function cameIn(em: EntityManager, record: Import, offset?: number) {
  const { rows, more } = await pageOf(em, record.id, "added", offset)
  const ids = rows.flatMap((row) => (row.recipe ? [row.recipe.id] : []))
  const recipes = await recipesById(em, ids)
  const since = record.createdAt
  const changed = new Set(
    (
      await em.find(
        RecipeVersion,
        {
          recipe: { $in: ids },
          source: { $ne: "import" },
          createdAt: { $gt: since },
        },
        { ...WITH_DELETED_RECIPES, fields: ["recipe"] }
      )
    ).map((version) => version.recipe.id)
  )
  const planned = new Set(
    (
      await em.find(
        PlanEntry,
        { recipe: { $in: ids } },
        { ...WITH_DELETED_RECIPES, fields: ["recipe"] }
      )
    ).flatMap((entry) => (entry.recipe ? [entry.recipe.id] : []))
  )
  const noted = new Set(
    (
      await em.find(
        CookNote,
        { recipe: { $in: ids }, createdAt: { $gt: since } },
        { ...WITH_DELETED_RECIPES, fields: ["recipe"] }
      )
    ).map((note) => note.recipe.id)
  )
  const items = rows.flatMap((row) => {
    const recipe = row.recipe ? recipes.get(row.recipe.id) : undefined
    // Deleted for good since: nothing to show or undo.
    if (!recipe) return []
    return [
      {
        position: row.position,
        recipe: {
          ...recipeOf(recipe),
          deleted: recipe.deletedAt !== null && recipe.deletedAt !== undefined,
          changed: changed.has(recipe.id),
          planned: planned.has(recipe.id),
          cooked:
            noted.has(recipe.id) ||
            (recipe.lastMadeAt !== null &&
              recipe.lastMadeAt !== undefined &&
              recipe.lastMadeAt > since),
          undone: row.undone,
        },
      },
    ]
  })
  return { items, more }
}

/** What was already in the household's recipes. */
async function alreadyHere(em: EntityManager, record: Import, offset?: number) {
  const { rows, more } = await pageOf(em, record.id, "already", offset)
  const recipes = await recipesById(
    em,
    rows.flatMap((row) => (row.recipe ? [row.recipe.id] : []))
  )
  const items = rows.map((row) => {
    const recipe = row.recipe ? recipes.get(row.recipe.id) : undefined
    return {
      position: row.position,
      label: row.label,
      recipe: recipe ? recipeOf(recipe) : null,
    }
  })
  return { items, more }
}

/** What didn't come in, and why. */
async function didntComeIn(em: EntityManager, record: Import, offset?: number) {
  const { rows, more } = await pageOf(em, record.id, "failed", offset)
  const items = rows.map((row) => ({
    position: row.position,
    label: row.label,
    error: row.error ?? "It didn't come in.",
  }))
  return { items, more }
}

/** Each link of a link import in order, as it goes. */
export async function linkItems(em: EntityManager, record: Import) {
  if (record.kind !== "links" && record.kind !== "collection") return []
  const rows = await em.find(
    ImportItem,
    { import: record.id },
    { ...WITH_DELETED_RECIPES, orderBy: { position: "asc" } }
  )
  const recipes = await recipesById(
    em,
    rows.flatMap((row) => (row.recipe ? [row.recipe.id] : []))
  )
  const over = finished(record)
  // The first waiting link is the one it's on, while it runs.
  const current =
    record.status === "running"
      ? rows.find((row) => row.state === "waiting")
      : undefined
  return rows.map((row) => {
    let state: ShownItemState = row.state
    if (row.state === "waiting" && over) state = "stopped"
    if (row === current) state = "adding"
    const recipe = row.recipe ? recipes.get(row.recipe.id) : undefined
    return {
      position: row.position,
      label: row.label,
      state,
      recipe: recipe ? recipeOf(recipe) : null,
      error: row.error ?? null,
    }
  })
}

/** An import's page: its summary, its links, and its three lists. */
export async function describeImport(
  em: EntityManager,
  record: Import,
  pages: ImportPages = {}
) {
  return {
    ...importSummary(record),
    items: await linkItems(em, record),
    cameIn: await cameIn(em, record, pages.cameIn),
    alreadyHere: await alreadyHere(em, record, pages.alreadyHere),
    didntComeIn: await didntComeIn(em, record, pages.didntComeIn),
  }
}
