import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import post from "./post.ts"
import undoRoutes from "./undo/index.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  undoRoutes(router, deps)
}
