import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import notAtHomeRoutes from "./not-at-home/index.ts"

export default (router: Router, deps: AppDeps) => {
  notAtHomeRoutes(router, deps)
}
