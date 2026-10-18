import type { Router } from "../env.ts"
import get from "./get.ts"
import v1Routes from "./v1/index.ts"

export default (router: Router) => {
  get(router)
  v1Routes(router)
}
