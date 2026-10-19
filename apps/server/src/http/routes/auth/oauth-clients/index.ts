import type { Router } from "../../../router.ts"
import type { AppDeps } from "../../../../core/context.ts"
import get from "./get.ts"
import clientRoutes from "./[clientId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  clientRoutes(router, deps)
}
