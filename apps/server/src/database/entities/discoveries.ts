import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

export const DISCOVERY_STATUSES = [
  "searching",
  "done",
  "stopped",
  "failed",
] as const

/** A recipe Discover found: a page Merran opened and can import. */
export type DiscoveredRecipe = {
  url: string
  name: string
  site: string
  /** Minutes in all, when the page says. */
  minutes: number | null
  /**
   * Its photo as the API shows it: a small copy kept by Merran, a shelf
   * recipe's photo, or, for a search from before photos were kept, the
   * site's own link.
   */
  photo: string | null
  /** The file kept for it, the `{photo}` in its path. Not in the API. */
  photoKey?: string | null
  /** The shelf recipe it is, when it came from the shelf. Not in the API. */
  shelfId?: string | null
  /** Why it's a good pick, in a line. */
  why: string
}

/** A search for new recipes online, for a theme: "cozy fall soups". */
export const Discovery = defineEntity({
  name: "Discovery",
  tableName: "discoveries",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () =>
      p.manyToOne(User).ref().nullable().deleteRule("set null").index(),
    theme: p.string(),
    /** The starter collection it found more for, by its id, if one. */
    collection: p.string().nullable(),
    status: p.enum(DISCOVERY_STATUSES),
    error: p.text().nullable(),
    /** Pages opened of those the AI offered, while they open; else null. */
    progress: p.json<{ done: number; total: number }>().nullable(),
    /** The job of the round going now, for Stop. Not in the API. */
    jobId: p.string().nullable(),
    recipes: p.json<DiscoveredRecipe[]>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "createdAt"] }],
  filters: householdFilter,
})
export type Discovery = InferEntity<typeof Discovery>
