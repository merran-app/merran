import { createRoute, z } from "@hono/zod-openapi"
import { isLocale } from "@merran/shared"
import type { AppDeps } from "../../../../../core/context.ts"
import { User } from "../../../../../database/entities/index.ts"
import { signedIn } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { describeMe, MeSchema } from "../../../../schemas/auth.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const LanguageChoiceSchema = z
  .object({
    // Checked against the list here rather than listed, so adding a
    // language changes nothing generated from this API.
    language: z
      .string()
      .nullable()
      .refine((language) => language === null || isLocale(language), {
        error: "That isn't one of Merran's languages.",
      })
      .openapi({
        description:
          'A code from Merran\'s languages, such as "en", or null to follow the browser.',
      }),
  })
  .openapi("LanguageChoice", { example: { language: "en" } })

const route = createRoute({
  method: "patch",
  path: "/auth/me/language",
  operationId: "setLanguage",
  tags: ["Sign-in"],
  summary: "Choose the language Merran shows",
  description:
    "The language the person sees Merran in, on every device. Null follows their browser.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LanguageChoiceSchema } },
    },
  },
  responses: {
    200: jsonResponse(MeSchema, "Chosen."),
    400: errorResponse("That isn't one of Merran's languages."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = signedIn(c)
    const { language } = c.req.valid("json")
    const { em } = c.var
    const person = await em.findOneOrFail(User, { id: user.id })
    // Null leaves the language out, so the browser's is followed again;
    // every other preference stays as it was.
    const { language: _, ...rest } = person.preferences ?? {}
    person.preferences = language ? { ...rest, language } : rest
    await em.flush()
    return c.json(await describeMe(em, user, c.var.household?.id ?? null), 200)
  })
}
