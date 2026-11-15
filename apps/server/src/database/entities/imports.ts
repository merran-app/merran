import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** What brought recipes in. */
export const IMPORT_KINDS = [
  /** One link that went on in the background. */
  "link",
  /** A video, which always goes on in the background. */
  "video",
  /** Several links at once. */
  "links",
  /** A starter collection's recipes. */
  "collection",
  /** Mealie, through its API or a backup or export file. */
  "mealie",
  /** A Paprika file. */
  "paprika",
  /** A Merran export. */
  "merran",
] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]

export const IMPORT_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

/**
 * An import's record, kept 90 days for the Imports page: what it was, who
 * started it, how it went, and (in import_items) what came of each link or
 * recipe. Its id is its job's, so a link to the job's import still opens it
 * after the job itself is cleared.
 */
export const Import = defineEntity({
  name: "Import",
  tableName: "imports",
  properties: {
    /** The job's id; set by whoever makes the job. */
    id: p.uuid().primary(),
    household: () => householdRef(),
    kind: p.enum(IMPORT_KINDS),
    /**
     * What it was: the link, the file's name, Mealie's address, or the
     * collection's name. None for several links, which say how many.
     */
    source: p.text().nullable(),
    /**
     * Whether the Imports page lists it. A single link is only listed once
     * it goes on in the background; one that finished while someone waited
     * just opened.
     */
    listed: p.boolean().default(true),
    status: p.enum(IMPORT_STATUSES).default("queued"),
    /** How many links or recipes it has, once it knows. */
    total: p.integer().default(0),
    added: p.integer().default(0),
    already: p.integer().default(0),
    failed: p.integer().default(0),
    /** Why it stopped, when the whole import failed. */
    error: p.text().nullable(),
    createdBy: () =>
      p.manyToOne(User).ref().nullable().deleteRule("set null").index(),
    createdAt: createdAt(),
    finishedAt: p.datetime().nullable(),
    /** When Undo moved what it brought in to Recently deleted. */
    undoneAt: p.datetime().nullable(),
  },
  indexes: [
    // The Imports page: a household's listed imports, newest first.
    { properties: ["household", "listed", "createdAt"] },
  ],
  filters: householdFilter,
})
export type Import = InferEntity<typeof Import>
