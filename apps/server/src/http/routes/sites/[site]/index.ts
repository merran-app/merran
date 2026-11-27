import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import del from "./delete.ts"
import recipesRoutes from "./recipes/index.ts"

export default (router: Router, deps: AppDeps) => {
  del(router, deps)
  recipesRoutes(router, deps)
}
