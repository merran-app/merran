import type { AppDeps } from "../../../../../../core/context.ts"
import type { Router } from "../../../../../router.ts"
import deleteLink from "./delete.ts"

export default (router: Router, deps: AppDeps) => {
  deleteLink(router, deps)
}
