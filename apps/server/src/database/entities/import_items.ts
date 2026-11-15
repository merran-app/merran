import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { id } from "./base.ts"
import { householdRef } from "./households.ts"
import { Import } from "./imports.ts"
import { Recipe } from "./recipes.ts"

/**
 * What came of an item. "adding" and "stopped" are only ever shown: the
 * first waiting item while it runs, and any waiting once it's finished.
 */
export const IMPORT_ITEM_STATES = [
  "waiting",
  "added",
  "already",
  "failed",
] as const
export type ImportItemState = (typeof IMPORT_ITEM_STATES)[number]

/**
 * One link or recipe of an import, and what came of it: the recipe it made
 * or that was there already, or why it didn't come in.
 */
export const ImportItem = defineEntity({
  name: "ImportItem",
  tableName: "import_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    import: () => p.manyToOne(Import).ref().deleteRule("cascade").index(),
    /** Its place in the import: a link's place in the list pasted. */
    position: p.integer(),
    /** The link, or the recipe's name. */
    label: p.text(),
    /** What Try again needs: the link, or the other app's id for it. */
    ref: p.text().nullable(),
    state: p.enum(IMPORT_ITEM_STATES).default("waiting"),
    /** The recipe it made, or the one already there. */
    recipe: () =>
      p.manyToOne(Recipe).ref().nullable().deleteRule("set null").index(),
    /** Why it didn't come in. */
    error: p.text().nullable(),
    /** Undo moved its recipe to Recently deleted, so Restore brings it back. */
    undone: p.boolean().default(false),
  },
  uniques: [{ properties: ["import", "position"] }],
  filters: householdFilter,
})
export type ImportItem = InferEntity<typeof ImportItem>
