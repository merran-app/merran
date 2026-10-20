import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./delete.ts"
import put from "./put.ts"

export default (router: Router, deps: AppDeps) => {
  put(router, deps)
  remove(router, deps)
}
