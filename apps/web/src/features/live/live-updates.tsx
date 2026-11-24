import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useRouterState } from "@tanstack/react-router"
import * as React from "react"

import { useMe } from "@/features/auth/use-me"
import { CLIENT_ID } from "@/lib/api/client"

import { gatherChanges } from "./gather"
import { heardFromLive, LIVE_REFRESH, lostLive } from "./state"

export type Person = { id: string; name: string }

/** Pages that say who else has them open. */
type LivePage = "list" | "plan"

/** The longest wait before trying to connect again. */
const MOST_WAIT_MS = 30_000

const LiveContext = React.createContext<Person[]>([])

/** Who else has this page open: "Jamie is on the list too". */
export function usePeopleHere() {
  return React.useContext(LiveContext)
}

function pageOf(path: string): LivePage | null {
  if (path === "/list" || path.startsWith("/list/")) return "list"
  if (path === "/plan" || path.startsWith("/plan/")) return "plan"
  return null
}

/** Whether Merran made a change (a job), rather than a person. */
function madeByMerran(message: MessageEvent<string>) {
  const { by } = JSON.parse(message.data) as { by: unknown }
  return by === null
}

/**
 * Keeps every page live: what someone else changes, or this person on
 * another device, is fetched again soon after it happens, and the page
 * knows who else has it open. After the connection drops (a phone asleep
 * in a pocket, the server restarting), it connects again and everything is
 * fetched again. While it works, the queries it covers aren't fetched
 * again on their own (lib/query-client.ts).
 */
export function LiveUpdates({ children }: { children: React.ReactNode }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const page = useRouterState({
    select: (state) => pageOf(state.location.pathname),
  })
  const [people, setPeople] = React.useState<Person[]>([])
  const refresh = React.useCallback(
    (keys: QueryKey[]) => {
      for (const queryKey of keys)
        void queryClient.invalidateQueries({ queryKey })
    },
    [queryClient]
  )
  // One for as long as the app is open: moving between the plan and the
  // list connects again, and changes gathered just before still go.
  const [changes] = React.useState(() => gatherChanges(refresh))
  React.useEffect(() => () => changes.stop(), [changes])

  React.useEffect(() => {
    if (typeof EventSource === "undefined") return
    const query = new URLSearchParams({ client: CLIENT_ID })
    if (page) query.set("page", page)
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let wait = 1_000
    let opened = false

    function connect() {
      source = new EventSource(`/api/events?${query}`)
      for (const area of Object.keys(LIVE_REFRESH)) {
        source.addEventListener(area, (message) => {
          heardFromLive()
          changes.add(area, madeByMerran(message))
        })
      }
      source.addEventListener("presence", (message) => {
        heardFromLive()
        const { people } = JSON.parse(message.data) as { people: Person[] }
        setPeople(people.filter((person) => person.id !== me.id))
      })
      source.addEventListener("ping", () => heardFromLive())
      source.addEventListener("ready", () => {
        heardFromLive()
        wait = 1_000
        // Back after a gap: catch up on whatever changed meanwhile.
        if (opened) {
          changes.stop()
          refresh(Object.values(LIVE_REFRESH).flat())
        }
        opened = true
      })
      // The browser tries again by itself after a dropped connection, but
      // gives up on an error answer (a 502 while the server restarts).
      source.addEventListener("error", () => {
        if (source?.readyState !== EventSource.CLOSED) return
        source.close()
        lostLive()
        setPeople([])
        retry = setTimeout(connect, wait)
        wait = Math.min(wait * 2, MOST_WAIT_MS)
      })
    }

    connect()
    return () => {
      clearTimeout(retry)
      source?.close()
      lostLive()
      setPeople([])
    }
  }, [page, me.id, refresh, changes])

  return <LiveContext.Provider value={people}>{children}</LiveContext.Provider>
}
