import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import del from "./delete.ts"
import get from "./get.ts"
import restoreRoutes from "./restore/index.ts"
import stopRoutes from "./stop/index.ts"
import undoRoutes from "./undo/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  del(router, deps)
  restoreRoutes(router, deps)
  stopRoutes(router, deps)
  undoRoutes(router, deps)
}
