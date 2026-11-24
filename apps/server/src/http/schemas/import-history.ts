import { z } from "@hono/zod-openapi"
import { IMPORT_KINDS, IMPORT_STATUSES } from "../../database/entities/index.ts"

// The Imports page: every import a household made, kept 90 days, and what
// came of each link or recipe.

const IMPORT_ID = "01a1e0f0-e739-758e-85c2-c9e3cd06ff15"
const KYLE = "01a1e0f0-e730-7501-bbce-f5e6ead7106d"

const IMPORT = {
  id: IMPORT_ID,
  kind: "links" as const,
  source: null,
  tag: "to try",
  listed: true,
  status: "done" as const,
  total: 3,
  done: 3,
  added: 2,
  already: 0,
  failed: 1,
  undone: 0,
  stopped: 0,
  error: null,
  startedBy: { id: KYLE, name: "Kyle" },
  createdAt: "2026-11-15T18:02:11.000Z",
  finishedAt: "2026-11-15T18:02:40.000Z",
  undoneAt: null,
}

const RECIPE = {
  id: "01a1e0f0-e739-758e-85c2-c9e3cd06ff16",
  slug: "lemon-chicken",
  name: "Lemon Chicken",
  photo: null,
}

export const ImportParam = z.object({
  importId: z.uuid().openapi({ param: { name: "importId", in: "path" } }),
})

export const ImportSchema = z
  .object({
    id: z.string(),
    kind: z.enum(IMPORT_KINDS).openapi({
      description:
        "What brought recipes in: one link or a video that went on in the background, several links, a starter collection, Mealie, Paprika or a Merran export.",
    }),
    source: z.string().nullable().openapi({
      description:
        "What it was: the link, Mealie's address or the collection's name. None for several links or a file.",
    }),
    tag: z.string().nullable().openapi({
      description: 'Added to every recipe it brought in, like "to try".',
    }),
    listed: z.boolean().openapi({
      description:
        "Whether the Imports page lists it. A single link is listed only once it goes on in the background; one that came in while someone waited isn't.",
    }),
    status: z.enum([...IMPORT_STATUSES, "undone"]).openapi({
      description:
        "How it's going or went. Undone once Undo moved what it brought in to Recently deleted.",
    }),
    total: z.number().int().openapi({
      description: "How many links or recipes it has, once it knows.",
    }),
    done: z.number().int().openapi({
      description: 'How many it\'s dealt with: "Importing 12 of 52".',
    }),
    added: z.number().int(),
    already: z.number().int().openapi({
      description: "Already in the household's recipes, so not added again.",
    }),
    failed: z.number().int().openapi({ description: "Didn't come in." }),
    undone: z.number().int().openapi({
      description:
        "How many recipes Undo moved to Recently deleted: fewer than came in when some were kept or deleted already. 0 when it isn't undone.",
    }),
    stopped: z.number().int().openapi({
      description: "Never got to, once it was stopped or failed.",
    }),
    error: z.string().nullable().openapi({
      description: "Why the whole import stopped, when it failed.",
    }),
    startedBy: z
      .object({ id: z.string(), name: z.string() })
      .nullable()
      .openapi({ description: "Who started it; none for Merran." }),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    undoneAt: z.iso.datetime().nullable(),
  })
  .openapi("Import", { example: IMPORT })

export const ImportStartedSchema = z
  .object({
    import: ImportSchema.openapi({
      description:
        "Going on in the background, on the Imports page: it says when the recipe's in.",
    }),
  })
  .openapi("ImportStarted", {
    example: {
      import: {
        ...IMPORT,
        kind: "link" as const,
        source: "https://example.com/lemon-chicken",
        tag: null,
        status: "running" as const,
        total: 1,
        done: 0,
        added: 0,
        failed: 0,
        finishedAt: null,
      },
    },
  })

export const ImportListSchema = z
  .object({ imports: z.array(ImportSchema) })
  .openapi("ImportList", { example: { imports: [IMPORT] } })

const ImportRecipeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  photo: z.string().nullable().openapi({ description: "Its card photo." }),
})

const ImportItemStateSchema = z
  .enum(["waiting", "adding", "added", "already", "failed", "stopped"])
  .openapi({
    description:
      "Where the link has got to: waiting, being added, added, already in the recipes, failed (see error), or stopped before it was reached.",
  })

const page = <T extends z.ZodType>(item: T, description: string) =>
  z
    .object({
      items: z.array(item),
      more: z.boolean().openapi({
        description: "Whether there are more: ask again from further on.",
      }),
    })
    .openapi({ description })

export const ImportDetailSchema = ImportSchema.extend({
  items: z
    .array(
      z.object({
        position: z.number().int(),
        label: z.string().openapi({ description: "The link." }),
        state: ImportItemStateSchema,
        recipe: ImportRecipeSchema.nullable(),
        error: z.string().nullable(),
      })
    )
    .openapi({
      description:
        "Several links' or a collection's links, in order, as it goes. Empty for other imports.",
    }),
  cameIn: page(
    z.object({
      position: z.number().int(),
      recipe: ImportRecipeSchema.extend({
        deleted: z.boolean().openapi({ description: "In Recently deleted." }),
        changed: z
          .boolean()
          .openapi({ description: "Changed since it came in." }),
        planned: z.boolean().openapi({ description: "On the plan." }),
        cooked: z
          .boolean()
          .openapi({ description: "Cooked since it came in." }),
        undone: z
          .boolean()
          .openapi({ description: "Moved to Recently deleted by Undo." }),
      }),
    }),
    "The recipes it brought in, 100 at a time."
  ),
  alreadyHere: page(
    z.object({
      position: z.number().int(),
      label: z.string(),
      recipe: ImportRecipeSchema.nullable().openapi({
        description: "The recipe that's there.",
      }),
    }),
    "What was already in the household's recipes, 100 at a time."
  ),
  didntComeIn: page(
    z.object({
      position: z.number().int(),
      label: z
        .string()
        .openapi({ description: "The link, or the recipe's name." }),
      error: z.string().openapi({ description: "Why it didn't come in." }),
    }),
    "What didn't come in and why, 100 at a time."
  ),
}).openapi("ImportDetail", {
  example: {
    ...IMPORT,
    items: [
      {
        position: 0,
        label: "https://example.com/lemon-chicken",
        state: "added",
        recipe: RECIPE,
        error: null,
      },
      {
        position: 1,
        label: "https://example.com/broken",
        state: "failed",
        recipe: null,
        error: "Couldn't reach that site.",
      },
    ],
    cameIn: {
      items: [
        {
          position: 0,
          recipe: {
            ...RECIPE,
            deleted: false,
            changed: false,
            planned: true,
            cooked: false,
            undone: false,
          },
        },
      ],
      more: false,
    },
    alreadyHere: { items: [], more: false },
    didntComeIn: {
      items: [
        {
          position: 1,
          label: "https://example.com/broken",
          error: "Couldn't reach that site.",
        },
      ],
      more: false,
    },
  },
})

export const UndoImportRequestSchema = z
  .object({
    keep: z.array(z.string()).max(10_000).default([]).openapi({
      description:
        "Recipes it brought in to keep, which someone unticked: every other one it brought in goes to Recently deleted.",
    }),
  })
  .openapi("UndoImportRequest", {
    example: { keep: [RECIPE.id] },
  })

export const RetryImportRequestSchema = z
  .object({
    token: z.string().trim().min(1).max(2000).optional().openapi({
      description:
        "Mealie's API token, for an import from Mealie through its API: it isn't kept once an import finishes.",
    }),
  })
  .openapi("RetryImportRequest", { example: {} })

const offset = (description: string) =>
  z.coerce.number().int().min(0).optional().openapi({ description })

export const ImportPagesQuery = z.object({
  cameIn: offset(
    "Where the recipes it brought in start: 100 for the next page."
  ),
  alreadyHere: offset("Where what was already here starts."),
  didntComeIn: offset("Where what didn't come in starts."),
})
