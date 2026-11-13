import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import sessionsRoutes from "./sessions/index.ts"

export default (router: Router, deps: AppDeps) => {
  sessionsRoutes(router, deps)
}
