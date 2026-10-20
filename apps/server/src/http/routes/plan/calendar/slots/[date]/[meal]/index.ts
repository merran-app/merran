import type { AppDeps } from "../../../../../../../core/context.ts"
import type { Router } from "../../../../../../router.ts"
import put from "./put.ts"
import deleteSlot from "./delete.ts"

export default (router: Router, deps: AppDeps) => {
  put(router, deps)
  deleteSlot(router, deps)
}
