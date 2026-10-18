import type { Router } from "../../../env.ts"
import installIdRoutes from "./[installId]/index.ts"

export default (router: Router) => {
  installIdRoutes(router)
}
