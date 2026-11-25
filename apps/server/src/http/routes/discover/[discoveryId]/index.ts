import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import moreRoutes from "./more/index.ts"
import photoRoutes from "./photos/index.ts"
import stopRoutes from "./stop/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  moreRoutes(router, deps)
  photoRoutes(router, deps)
  stopRoutes(router, deps)
}
