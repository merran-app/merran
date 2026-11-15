import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import remove from "./delete.ts"
import get from "./get.ts"
import patch from "./patch.ts"
import deliveriesRoutes from "./deliveries/index.ts"
import secretRoutes from "./secret/index.ts"
import testRoutes from "./test/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
  remove(router, deps)
  deliveriesRoutes(router, deps)
  secretRoutes(router, deps)
  testRoutes(router, deps)
}
