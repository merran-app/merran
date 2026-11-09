import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import dismissRoutes from "./dismiss/index.ts"

export default (router: Router, deps: AppDeps) => {
  dismissRoutes(router, deps)
}
