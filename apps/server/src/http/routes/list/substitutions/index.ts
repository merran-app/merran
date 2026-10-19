import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import undo from "./undo/index.ts"
export default (router: Router, deps: AppDeps) => {
  undo(router, deps)
}
