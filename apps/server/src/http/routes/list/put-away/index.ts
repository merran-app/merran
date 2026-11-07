import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import lookedOver from "./looked-over/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  lookedOver(router, deps)
  post(router, deps)
}
