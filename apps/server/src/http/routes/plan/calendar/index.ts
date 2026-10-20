import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import patch from "./patch.ts"
import feedRoutes from "./feed/index.ts"
import linkRoutes from "./links/index.ts"
import slotRoutes from "./slots/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
  feedRoutes(router, deps)
  linkRoutes(router, deps)
  slotRoutes(router, deps)
}
