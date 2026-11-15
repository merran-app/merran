import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import timerIdRoutes from "./[timerId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  timerIdRoutes(router, deps)
}
