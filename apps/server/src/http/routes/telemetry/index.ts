import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import answerRoutes from "./answer/index.ts"
import installIdRoutes from "./install-id/index.ts"
import reportRoutes from "./report/index.ts"
import statusRoutes from "./status/index.ts"

export default (router: Router, deps: AppDeps) => {
  answerRoutes(router, deps)
  installIdRoutes(router, deps)
  reportRoutes(router, deps)
  statusRoutes(router, deps)
}
