import { z } from "@hono/zod-openapi"
import { JOB_STATUSES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

// Importing from other apps: what a file is before its import starts, and
// connecting to a Mealie.

export const ImportFileSchema = z
  .object({
    id: z.string().openapi({
      description:
        "Start its import at /households/current/import/files/{fileId}/start.",
    }),
    app: z.enum(["mealie", "paprika"]),
    what: z.enum(["backup", "recipes"]).openapi({
      description: "A whole backup, or recipes exported from the app.",
    }),
    recipes: z.number().int(),
    alreadyHere: z.number().int().openapi({
      description:
        "Of those, how many an earlier import brought in. They're skipped.",
    }),
    groups: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          recipes: z.number().int(),
        })
      )
      .openapi({
        description:
          "A Mealie backup's groups, when there's more than one to choose from.",
      }),
  })
  .openapi("ImportFile", {
    example: {
      id: IDS.importFile,
      app: "mealie",
      what: "backup",
      recipes: 312,
      alreadyHere: 0,
      groups: [
        { id: IDS.mealieGroup, name: "Home", recipes: 298 },
        { id: IDS.otherMealieGroup, name: "Grandma", recipes: 14 },
      ],
    },
  })

/** A file's check, with what's in it once it's read. */
export const ImportFileCheckSchema = z
  .object({
    id: z.string().openapi({
      description:
        "The file: follow its check at /households/current/import/files/{fileId}.",
    }),
    status: z.enum(["checking", "ready", "failed"]).openapi({
      description:
        "Checking while Merran reads it, then ready with what's in it, or failed with why it can't be imported.",
    }),
    file: ImportFileSchema.nullable().openapi({
      description: "What's in it, once it's ready.",
    }),
    error: z
      .object({ code: z.string(), message: z.string() })
      .nullable()
      .openapi({ description: "Why it can't be imported, once it failed." }),
  })
  .openapi("ImportFileCheck", {
    example: {
      id: IDS.importFile,
      status: "checking",
      file: null,
      error: null,
    },
  })

export const ImportFileParam = z.object({
  fileId: z.uuid().openapi({ param: { name: "fileId", in: "path" } }),
})

export const StartImportFileSchema = z
  .object({
    group: z.string().nullish().openapi({
      description:
        "Which of a Mealie backup's groups to import. All of them if left out.",
    }),
  })
  .openapi("StartImportFile", { example: { group: IDS.mealieGroup } })

export const MealieConnectionSchema = z
  .object({
    url: z
      .url({
        protocol: /^https?$/,
        error: "Use Mealie's full address, like http://192.168.1.20:9000",
      })
      .max(2000),
    token: z
      .string()
      .trim()
      .min(10, "Paste the whole API token.")
      .max(4000, "That's too long for a Mealie token."),
  })
  .openapi("MealieConnection", {
    example: {
      url: "http://192.168.1.20:9000",
      token: "sample-mealie-api-token",
    },
  })

export const MealieCheckSchema = z
  .object({
    version: z.string().nullable().openapi({ example: "v3.28.0" }),
    recipes: z.number().int(),
    alreadyHere: z.number().int().openapi({
      description:
        "Recipes an earlier Mealie import brought in. They're skipped.",
    }),
  })
  .openapi("MealieCheck", {
    example: { version: "v3.28.0", recipes: 312, alreadyHere: 0 },
  })

// Several links at once.

export const LinkCheckRequestSchema = z
  .object({
    text: z.string().max(100_000).openapi({
      description: "Pasted text with links in it: one per line, or mixed in.",
    }),
  })
  .openapi("LinkCheckRequest", {
    example: {
      text: "Dinners to try:\nhttps://example.com/lemon-chicken\nhttps://example.com/garlic-rice",
    },
  })

export const LinkCheckSchema = z
  .object({
    links: z.array(
      z.object({
        url: z.string(),
        video: z.boolean().openapi({
          description:
            "A TikTok, YouTube, Instagram or Facebook link, imported from its video, on its own.",
        }),
        existing: z
          .object({ slug: z.string(), name: z.string() })
          .nullable()
          .openapi({ description: "In the library already: it's skipped." }),
      })
    ),
    more: z.number().int().openapi({
      description: "Links past the first 100, which are left out.",
    }),
  })
  .openapi("LinkCheck", {
    example: {
      links: [
        {
          url: "https://example.com/lemon-chicken",
          video: false,
          existing: { slug: "lemon-chicken", name: "Lemon Chicken" },
        },
        {
          url: "https://example.com/garlic-rice",
          video: false,
          existing: null,
        },
      ],
      more: 0,
    },
  })

export const LinkImportRequestSchema = z
  .object({
    urls: z
      .array(z.string().max(2000))
      .min(1, "Add at least one link.")
      .max(100, "Up to 100 links at a time."),
    tag: z
      .string()
      .trim()
      .max(40, "Keep the tag under 40 characters.")
      .nullish()
      .openapi({
        description: 'Added to every recipe it makes, like "to try".',
      }),
  })
  .openapi("LinkImportRequest", {
    example: {
      urls: [
        "https://example.com/garlic-rice",
        "https://example.com/lemon-chicken",
      ],
      tag: "to try",
    },
  })
