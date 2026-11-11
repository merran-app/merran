import { AsyncLocalStorage } from "node:async_hooks"
import { delegatedCredential, type Credential } from "../auth/credentials.ts"

// Who did what an event tells of, how, and with which key, so an n8n flow
// can ignore the change it made itself instead of looping (docs/webhooks.md).

/** Signed in to the app, through the API, from an AI app over MCP, or Merran on its own. */
export const ACTOR_VIAS = ["app", "api", "mcp", "merran"] as const

export type Actor = {
  /** The person, or null when Merran did it on its own. */
  by: { id: string; name: string } | null
  via: (typeof ACTOR_VIAS)[number]
  /** The API key or OAuth connection, for `api` and `mcp`. */
  key: { id: string; name: string } | null
}

/** Merran on its own: a schedule, a job, a timer going off. */
export const MERRAN: Actor = { by: null, via: "merran", key: null }

// Kept for each request by a middleware after sign-in, so what a request
// records knows who sent it without every service passing that along.
const current = new AsyncLocalStorage<Actor>()

/** Runs `work`, and everything it starts, as `actor`. */
export function withActor<T>(actor: Actor, work: () => T): T {
  return current.run(actor, work)
}

/** Who's behind what's running now: Merran, outside any request. */
export function currentActor(): Actor {
  return current.getStore() ?? MERRAN
}

/**
 * Who sent a request: someone signed in is `app`, and a key or OAuth
 * connection is `api`, or `mcp` when it's used for MCP. `by` is always the
 * person's own name, and `key` names what they used.
 */
export function actorOf(
  user: { id: string; name: string } | null,
  credential: Credential | null,
  path: string
): Actor {
  if (!user) return MERRAN
  const by = { id: user.id, name: user.name }
  const delegated = delegatedCredential(credential)
  if (!delegated) return { by, via: "app", key: null }

  const key = { id: delegated.id, name: delegated.name }
  const forMcp =
    (delegated.kind === "oauth" && delegated.audience === "mcp") ||
    isMcpPath(path)
  return { by, via: forMcp ? "mcp" : "api", key }
}

/** MCP is served at /mcp, outside the REST API. */
function isMcpPath(path: string) {
  return path === "/mcp" || path.startsWith("/mcp/")
}
