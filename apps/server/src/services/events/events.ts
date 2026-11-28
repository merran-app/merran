import type { JobStatus } from "../../database/entities/index.ts"

// Merran's one stream of what changed in each household. It feeds live
// updates now, and webhooks and notifications later, so they all agree.
// It's in memory, for this server process.

/** What can change, as the areas API keys are given: the plan, the list... */
export const LIVE_AREAS = [
  "plan",
  "list",
  "pantry",
  "recipes",
  "household",
] as const
export type LiveArea = (typeof LIVE_AREAS)[number]

/** Pages that say who has them open: "Jamie is on the list too". */
export const LIVE_PAGES = ["list", "plan"] as const
export type LivePage = (typeof LIVE_PAGES)[number]

export type Person = { id: string; name: string }

/** How one of the household's jobs is going: started, moving on or ended. */
export type JobMoved = {
  id: string
  kind: string
  status: JobStatus
  progress: { done: number; total: number } | null
  /** Who started it, so their app can tell them when it ends. */
  startedBy: string | null
}

export type LiveEvent =
  /** Something in an area changed, by someone, from one of their devices. */
  | {
      type: "changed"
      area: LiveArea
      by: Person | null
      /** The device (a browser tab) it came from, which knows already. */
      client: string | null
    }
  /** Who has a page open now. */
  | { type: "presence"; page: LivePage; people: Person[] }
  /** One of the household's jobs moved, told to those who may read its area. */
  | { type: "job"; area: LiveArea; job: JobMoved }

export type Listener = {
  /** Who's listening; null for an API key, which isn't a person on a page. */
  person: Person | null
  /** The device listening, so it isn't told what it did itself. */
  client: string | null
  /** The page it has open; says so again as the person moves about. */
  page: LivePage | null
  /** The areas it may hear about. */
  areas: ReadonlySet<LiveArea>
  send: (event: LiveEvent) => void
  /** Ends the listener's stream, when the server stops. */
  close: () => void
}

export function createEventBus() {
  const households = new Map<string, Set<Listener>>()
  /** Who each household's pages were last said to have open. */
  const said = new Map<string, string>()

  /** Who has a page open, each person once however many devices they use. */
  function people(householdId: string, page: LivePage) {
    const found = new Map<string, Person>()
    for (const listener of households.get(householdId) ?? []) {
      if (listener.page === page && listener.person)
        found.set(listener.person.id, listener.person)
    }
    return [...found.values()]
  }

  /**
   * Tells a page's listeners who has it open, when that's changed; a new
   * listener is told anyway.
   */
  function sendPresence(householdId: string, page: LivePage, to?: Listener) {
    const event: LiveEvent = {
      type: "presence",
      page,
      people: people(householdId, page),
    }
    const key = `${householdId} ${page}`
    const now = event.people.map((person) => person.id).join(" ")
    const changed = said.get(key) !== now
    if (event.people.length > 0) said.set(key, now)
    else said.delete(key)
    for (const listener of households.get(householdId) ?? []) {
      if (listener.page === page && (changed || listener === to))
        listener.send(event)
    }
  }

  return {
    /**
     * Tells the household something changed: everyone who may hear about
     * that area, on every device but the one it came from.
     */
    changed(
      householdId: string,
      change: { area: LiveArea; by: Person | null; client: string | null }
    ) {
      const event: LiveEvent = { type: "changed", ...change }
      for (const listener of households.get(householdId) ?? []) {
        if (change.client && listener.client === change.client) continue
        if (listener.areas.has(change.area)) listener.send(event)
      }
    },

    /**
     * Tells the household how one of its jobs is going: everyone who may
     * hear about the job's area, on every device, since Merran did it.
     */
    job(householdId: string, area: LiveArea, job: JobMoved) {
      const event: LiveEvent = { type: "job", area, job }
      for (const listener of households.get(householdId) ?? []) {
        if (listener.areas.has(area)) listener.send(event)
      }
    },

    /** Listens until the returned function is called. */
    subscribe(householdId: string, listener: Listener) {
      const listeners = households.get(householdId) ?? new Set()
      listeners.add(listener)
      households.set(householdId, listeners)
      if (listener.page) sendPresence(householdId, listener.page, listener)
      return () => {
        if (!listeners.delete(listener)) return
        if (listeners.size === 0) households.delete(householdId)
        if (listener.page) sendPresence(householdId, listener.page)
      }
    },

    /**
     * Moves a person's stream (the one with this client) to another page,
     * or to none, and tells the pages it left and opened who's there now.
     * Says how many streams moved: none when that device isn't listening, or is on that page already.
     */
    movePage(
      householdId: string,
      who: { personId: string; client: string },
      page: LivePage | null
    ) {
      const moving = [...(households.get(householdId) ?? [])].filter(
        (listener) =>
          listener.person?.id === who.personId && listener.client === who.client
      )
      const left = new Set<LivePage>()
      const arrived: Listener[] = []
      for (const listener of moving) {
        if (listener.page === page) continue
        if (listener.page) left.add(listener.page)
        listener.page = page
        arrived.push(listener)
      }
      for (const each of left) sendPresence(householdId, each)
      // Each stream that arrived is told who's there, even when nothing
      // changed for the others already on the page.
      if (page) {
        for (const listener of arrived) {
          sendPresence(householdId, page, listener)
        }
      }
      return arrived.length
    },

    /** How many are listening, across households. */
    get size() {
      let count = 0
      for (const listeners of households.values()) count += listeners.size
      return count
    },

    /** Ends every stream, so the server can stop. */
    closeAll() {
      for (const listeners of households.values())
        for (const listener of listeners) listener.close()
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>
