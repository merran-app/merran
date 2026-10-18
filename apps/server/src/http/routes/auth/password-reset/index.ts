import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import requestRoutes from "./request/index.ts"
import completeRoutes from "./complete/index.ts"
export default (router: Router, deps: AppDeps) => {
  requestRoutes(router, deps)
  completeRoutes(router, deps)
}
