import { queryOptions, useQuery } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Capabilities = Schemas["Capabilities"]

/**
 * Which of Merran's optional parts are on. The app shows only what's on,
 * and says what's missing for the rest.
 */
export const capabilitiesQuery = queryOptions({
  queryKey: ["capabilities"],
  queryFn: () => unwrap(api.GET("/api/capabilities")),
  staleTime: 5 * 60_000,
})

/**
 * Whether something optional, like "ai.chat", can be offered right now.
 * Turned off, it doesn't ask the server and offers nothing: a guest on a
 * shared recipe gets none of the household's optional parts.
 */
export function useCapability(name: string, enabled = true): boolean {
  const { data } = useQuery({ ...capabilitiesQuery, enabled })
  if (!enabled) return false
  return data?.capabilities.includes(name) ?? false
}
