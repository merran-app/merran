import type { Router } from "../../../../env.ts"
import remove from "./delete.ts"

export default (router: Router) => {
  remove(router)
}
