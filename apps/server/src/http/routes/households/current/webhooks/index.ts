import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import scheduleRoutes from "./schedule/index.ts"
import webhookIdRoutes from "./[webhookId]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  // A fixed path first, so it isn't taken for {webhookId}.
  scheduleRoutes(router, deps)
  webhookIdRoutes(router, deps)
}
