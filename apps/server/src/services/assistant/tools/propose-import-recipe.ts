import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import type { AiDeps } from "../../ai/run.ts"
import { decodeHtml } from "../../recipes/import/import-link.ts"
import {
  findBySourceUrl,
  isVideoLink,
  normalizeLink,
} from "../../recipes/import/links.ts"
import { readRecipeData } from "../../recipes/import/recipe-data.ts"
import { totalMinutes } from "../../recipes/recipes.ts"
import type { ToolContext } from "./context.ts"

export function proposeImportRecipeTool(
  { fork, propose }: Pick<ToolContext, "fork" | "propose">,
  deps: Pick<AiDeps, "fetcher">
) {
  return tool({
    description:
      "Offer a recipe page found on the web, to import into the library: the page's own link. Merran opens it first; one it can't read, or the library has, is refused, so offer another.",
    inputSchema: z.object({
      url: z.string(),
      why: z.string().describe("Why it's a good pick, in a line."),
    }),
    execute: async ({ url: raw, why }) => {
      const em = fork()
      const url = normalizeLink(raw)
      const known = await findBySourceUrl(em, [url])
      if (known) {
        return {
          alreadyInLibrary: { id: known.id, name: known.name },
        }
      }
      if (isVideoLink(url)) {
        throw new AppError(
          "unprocessable",
          "video_link",
          "Videos can't be imported yet. Offer a recipe page."
        )
      }
      const page = await deps.fetcher(url)
      const pageUrl = normalizeLink(page.url)
      const data = readRecipeData(
        decodeHtml(page.body, page.contentType),
        pageUrl
      )
      if (!data) {
        throw new AppError(
          "unprocessable",
          "no_recipe_data",
          "That page has no recipe on it Merran can read. Offer another."
        )
      }
      const site = new URL(pageUrl).hostname.replace(/^www\./, "")
      return propose({
        kind: "import",
        summary: `${data.input.name}, from ${site}`,
        payload: {
          url: pageUrl,
          name: data.input.name,
          site,
          photo: data.photoUrls[0] ?? null,
          minutes:
            data.input.totalMinutes ??
            ((data.input.prepMinutes ?? 0) + (data.input.cookMinutes ?? 0) ||
              null),
          why: why.trim().slice(0, 300),
        },
      })
    },
  })
}
