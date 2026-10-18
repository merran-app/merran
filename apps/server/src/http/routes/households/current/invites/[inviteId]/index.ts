import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import remove from "./delete.ts"
import resendRoutes from "./resend/index.ts"

export default (router: Router, deps: AppDeps) => {
  remove(router, deps)
  resendRoutes(router, deps)
}
