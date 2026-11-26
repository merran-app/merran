import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  MAX_LINKS,
  startLinkImport,
} from "../../../../../services/recipes/import/import-links.ts"
import { getCollection } from "../../../../../services/recipes/discover/sites/collections.ts"
import { languageOf } from "../../../../../services/recipes/discover/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import {
  findImport,
  importSummary,
} from "../../../../../services/imports/describe.ts"
import { ImportSchema } from "../../../../schemas/import-history.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  CollectionParam,
  ImportCollectionRequestSchema,
} from "../../../../schemas/sites.ts"

const route = createRoute({
  method: "post",
  path: "/collections/{collection}/import",
  operationId: "importCollection",
  tags: ["Collections"],
  summary: "Import a collection",
  description:
    "Its recipes not in the library yet, in the background, as several links are: follow along at /imports/{importId}. Send `recipes` to import just those (the ones shown); without them, it's the first 100 not in the library.",
  ...openToKeys("imports", "write"),
  request: {
    params: CollectionParam,
    body: {
      required: false,
      content: {
        "application/json": { schema: ImportCollectionRequestSchema },
      },
    },
  },
  responses: {
    202: jsonResponse(
      ImportSchema,
      "Importing: follow it at /imports/{importId}."
    ),
    404: errorResponse("No such collection."),
    409: errorResponse("Every recipe in it is in the library already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    // Every recipe of the collection, to pick from: what the person saw
    // may have changed since.
    const collection = await getCollection(
      em,
      householdId,
      await languageOf(em, userId),
      c.req.valid("param").collection,
      { offset: 0, limit: Number.MAX_SAFE_INTEGER }
    )
    const asked = c.req.valid("json")?.recipes
    const wanted = asked ? new Set(asked) : null
    // In the collection's order, whatever order they were asked for in.
    const urls = collection.recipes
      .filter((recipe) => !recipe.inLibrary)
      .filter((recipe) => !wanted || wanted.has(recipe.id))
      .slice(0, MAX_LINKS)
      .map((recipe) => recipe.url)
    if (urls.length === 0) {
      throw new AppError(
        "conflict",
        "collection_imported",
        "Every recipe in it is in your library already."
      )
    }
    const started = await startLinkImport(em, {
      householdId,
      userId,
      urls,
      kind: "collection",
      source: collection.title,
    })
    return c.json(importSummary(await findImport(em, started.id)), 202)
  })
}
