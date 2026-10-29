import { z } from "zod"
import { textSetting } from "../../core/settings.ts"

export const FLARESOLVERR = {
  url: textSetting({
    key: "flaresolverr.url",
    env: "MERRAN_FLARESOLVERR_URL",
    description:
      "Where FlareSolverr answers, like http://flaresolverr:8191. It may be on the home network. Merran asks it for a page only when someone imports a link and the site turned Merran away; never for background reads or photos.",
    schema: z
      .string()
      .trim()
      .url("Use FlareSolverr's full address, starting with http://")
      .max(500),
  }),
}
