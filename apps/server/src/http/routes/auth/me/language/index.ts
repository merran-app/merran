import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import patch from "./patch.ts"

export default (router: Router, deps: AppDeps) => {
  patch(router, deps)
}
