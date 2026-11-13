import type { AppDeps } from "../../../../../../../core/context.ts"
import type { Router } from "../../../../../../router.ts"
import get from "./get.ts"
import rotateRoutes from "./rotate/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  rotateRoutes(router, deps)
}
