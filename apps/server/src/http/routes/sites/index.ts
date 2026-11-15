import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import siteRoutes from "./[site]/index.ts"
import get from "./get.ts"
import post from "./post.ts"
import recipesRoutes from "./recipes/index.ts"
import suggestionsRoutes from "./suggestions/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  recipesRoutes(router, deps)
  // Before /sites/{site}, so "suggestions" is never taken for a site's id.
  suggestionsRoutes(router, deps)
  siteRoutes(router, deps)
}
