import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import patch from "./patch.ts"
import endRoutes from "./end/index.ts"
import timersRoutes from "./timers/index.ts"

export default (router: Router, deps: AppDeps) => {
  patch(router, deps)
  endRoutes(router, deps)
  timersRoutes(router, deps)
}
