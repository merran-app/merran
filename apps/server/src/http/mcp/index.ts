import type { AppDeps } from "../../core/context.ts"
import type { Router } from "../router.ts"
import { mcpRequest } from "./request.ts"

/** MCP is a separate protocol at /mcp, outside the REST/OpenAPI router. */
export default function registerMcp(app: Router, deps: AppDeps) {
  app.all("/mcp", mcpRequest(deps))
}
