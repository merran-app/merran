import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import patch from "./patch.ts"
import aiRoutes from "./ai/index.ts"
import exportRoutes from "./export/index.ts"
import importRoutes from "./import/index.ts"
import invitesRoutes from "./invites/index.ts"
import jobsRoutes from "./jobs/index.ts"
import membersRoutes from "./members/index.ts"
import onHandRoutes from "./on-hand/index.ts"
import sharesRoutes from "./shares/index.ts"
import tastesRoutes from "./tastes/index.ts"
import themesRoutes from "./themes/index.ts"
import webhooksRoutes from "./webhooks/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
  aiRoutes(router, deps)
  exportRoutes(router, deps)
  importRoutes(router, deps)
  invitesRoutes(router, deps)
  jobsRoutes(router, deps)
  membersRoutes(router, deps)
  onHandRoutes(router, deps)
  sharesRoutes(router, deps)
  tastesRoutes(router, deps)
  themesRoutes(router, deps)
  webhooksRoutes(router, deps)
}
