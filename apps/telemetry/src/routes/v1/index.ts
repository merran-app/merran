import type { Router } from "../../env.ts"
import historyRoutes from "./history/index.ts"
import installsRoutes from "./installs/index.ts"
import reportsRoutes from "./reports/index.ts"
import totalsRoutes from "./totals/index.ts"

export default (router: Router) => {
  historyRoutes(router)
  installsRoutes(router)
  reportsRoutes(router)
  totalsRoutes(router)
}
