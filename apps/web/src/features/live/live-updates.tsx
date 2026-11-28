import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useRouterState } from "@tanstack/react-router"
import * as React from "react"

import { meQuery, type Me } from "@/features/auth/queries"
import { noticeFor, type JobMoved } from "@/features/imports/notices"
import { useImportNotice } from "@/features/imports/use-import-notice"
import { jobNoticeFor } from "@/features/jobs/notices"
import { useJobNotice } from "@/features/jobs/use-job-notice"
import { api, CLIENT_ID } from "@/lib/api/client"

import { gatherChanges } from "./gather"
import { heardFromLive, LIVE_REFRESH, lostLive } from "./state"
import { liveWanted, pageOf, type LivePage } from "./where"

export type Person = { id: string; name: string }

/** The longest wait before trying to connect again. */
const MOST_WAIT_MS = 30_000

const LiveContext = React.createContext<Person[]>([])

/** Who else has this page open: "Jamie is on the list too". */
export function usePeopleHere() {
  return React.useContext(LiveContext)
}

/** Whether Merran made a change (a job), rather than a person. */
function madeByMerran(message: MessageEvent<string>) {
  const { by } = JSON.parse(message.data) as { by: unknown }
  return by === null
}

/**
 * Keeps every page live while someone's signed in, in the app and in the
 * cook view alike: what someone else changes, or this person on another
 * device, is fetched again soon after it happens, and the page knows who
 * else has it open. The stream stays open as they move about, and is told
 * which page is open. After the connection drops (a phone asleep in a
 * pocket, the server restarting), it connects again and everything is
 * fetched again. While it works, the queries it covers aren't fetched
 * again on their own (lib/query-client.ts).
 */
export function LiveUpdates({ children }: { children: React.ReactNode }) {
  const me = useQuery(meQuery).data
  const wanted = useRouterState({
    select: (state) => liveWanted(state.matches.map((match) => match.routeId)),
  })
  const [people, setPeople] = React.useState<Person[]>([])

  return (
    <LiveContext.Provider value={people}>
      {me && wanted ? (
        // A stream belongs to one household, which it joins when it connects:
        // switching household starts a new one, with nothing of the old.
        <LiveConnection
          key={`${me.id} ${me.activeHouseholdId}`}
          me={me}
          onPeople={setPeople}
        />
      ) : null}
      {children}
    </LiveContext.Provider>
  )
}

/** The stream itself, which lives for as long as it's wanted. */
function LiveConnection({
  me,
  onPeople,
}: {
  me: Me
  onPeople: (people: Person[]) => void
}) {
  const queryClient = useQueryClient()
  const page = useRouterState({
    select: (state) => pageOf(state.location.pathname),
  })
  const refresh = React.useCallback(
    (keys: QueryKey[]) => {
      for (const queryKey of keys)
        void queryClient.invalidateQueries({ queryKey })
    },
    [queryClient]
  )
  // One for as long as the stream is wanted: changes gathered just before
  // a reconnect still go.
  const [changes] = React.useState(() => gatherChanges(refresh))
  React.useEffect(() => () => changes.stop(), [changes])
  // The latest, without connecting again when the language changes.
  const importNotice = useImportNotice()
  const noticeImport = React.useRef(importNotice)
  React.useEffect(() => {
    noticeImport.current = importNotice
  }, [importNotice])
  const jobNotice = useJobNotice()
  const noticeJob = React.useRef(jobNotice)
  React.useEffect(() => {
    noticeJob.current = jobNotice
  }, [jobNotice])
  // The page open now, for the stream to carry when it connects, and what
  // the stream knows: whether it's ready, and the page it was told.
  const openPage = React.useRef(page)
  const stream = React.useRef<{ ready: boolean; told: LivePage | null }>({
    ready: false,
    told: null,
  })

  // Says the page open to a stream that's open already. A failure is let
  // go: the next connection carries the page.
  const tellPage = React.useCallback(() => {
    const now = openPage.current
    if (!stream.current.ready || stream.current.told === now) return
    stream.current.told = now
    api
      .PUT("/api/events/page", { body: { client: CLIENT_ID, page: now } })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    openPage.current = page
    // Who's on the page left is no longer who's here.
    onPeople([])
    tellPage()
  }, [page, onPeople, tellPage])

  React.useEffect(() => {
    if (typeof EventSource === "undefined") return
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let wait = 1_000
    let opened = false

    function connect() {
      // The page open now, which isn't always the one it started on.
      const query = new URLSearchParams({ client: CLIENT_ID })
      if (openPage.current) query.set("page", openPage.current)
      stream.current = { ready: false, told: openPage.current }
      source = new EventSource(`/api/events?${query}`)
      for (const area of Object.keys(LIVE_REFRESH)) {
        source.addEventListener(area, (message) => {
          heardFromLive()
          changes.add(area, madeByMerran(message))
        })
      }
      source.addEventListener("presence", (message) => {
        heardFromLive()
        const heard = JSON.parse(message.data) as {
          page: LivePage
          people: Person[]
        }
        // Said just before the page changed: not who's here now.
        if (heard.page !== openPage.current) return
        onPeople(heard.people.filter((person) => person.id !== me.id))
      })
      source.addEventListener("job", (message) => {
        heardFromLive()
        const job = JSON.parse(message.data) as JobMoved
        changes.addJob(job)
        if (noticeFor(job, me.id)) {
          // A record deleted meanwhile has nothing to tell.
          noticeImport.current(job.id).catch(() => {})
        }
        if (jobNoticeFor(job, me.id)) {
          // Not everything is handed over, and a job gone meanwhile has
          // nothing to tell.
          noticeJob.current(job.id).catch(() => {})
        }
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
        stream.current.ready = true
        // The page may have changed while it connected.
        tellPage()
      })
      // The browser would try again by itself after a dropped connection,
      // but with the address it started with, and the page has moved on
      // since. So it's closed here and connected again with the page open.
      source.addEventListener("error", () => {
        source?.close()
        stream.current.ready = false
        lostLive()
        onPeople([])
        retry = setTimeout(connect, wait)
        wait = Math.min(wait * 2, MOST_WAIT_MS)
      })
    }

    connect()
    return () => {
      clearTimeout(retry)
      source?.close()
      stream.current.ready = false
      lostLive()
      onPeople([])
    }
  }, [me.id, refresh, changes, onPeople, tellPage])

  return null
}
