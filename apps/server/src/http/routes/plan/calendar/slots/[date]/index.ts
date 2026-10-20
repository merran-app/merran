import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import mealRoutes from "./[meal]/index.ts"

export default (router: Router, deps: AppDeps) => {
  mealRoutes(router, deps)
}
