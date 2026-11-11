import type { AppDeps } from "../../../../../../../core/context.ts"
import type { Router } from "../../../../../../router.ts"
import get from "./get.ts"
import deliveryIdRoutes from "./[deliveryId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  deliveryIdRoutes(router, deps)
}
