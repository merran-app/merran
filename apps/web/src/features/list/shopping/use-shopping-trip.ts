import * as React from "react"

export type ShoppingTrip = {
  id: string
  startedAt: string
  listId: string
  store: string
  aside: string[]
  elsewhere: Record<string, string>
}
function read(key: string): ShoppingTrip | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null")
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.listId !== "string" ||
      typeof value.store !== "string" ||
      !Array.isArray(value.aside) ||
      !value.aside.every((id: unknown) => typeof id === "string") ||
      !value.elsewhere ||
      typeof value.elsewhere !== "object" ||
      !Object.values(value.elsewhere).every(
        (store) => typeof store === "string"
      )
    )
      return null
    return value
  } catch {
    return null
  }
}

/** Trip focus is local to this household on this device; list changes stay shared. */
export function useShoppingTrip(householdId?: string) {
  const key = `merran:shopping-trip:${householdId ?? ""}`
  const [state, setState] = React.useState(() => ({
    key,
    trip: householdId ? read(key) : null,
  }))
  React.useEffect(() => {
    setState({ key, trip: householdId ? read(key) : null })
    const changed = (event: StorageEvent) => {
      if (event.key === key) setState({ key, trip: read(key) })
    }
    window.addEventListener("storage", changed)
    return () => window.removeEventListener("storage", changed)
  }, [key, householdId])
  React.useEffect(() => {
    if (!householdId || state.key !== key) return
    try {
      if (state.trip) localStorage.setItem(key, JSON.stringify(state.trip))
      else localStorage.removeItem(key)
    } catch {
      /* The trip still works in memory when storage is unavailable. */
    }
  }, [key, state, householdId])
  const trip = state.key === key ? state.trip : null
  const update = (changes: Partial<ShoppingTrip>) =>
    setState((old) =>
      old.key === key && old.trip
        ? { key, trip: { ...old.trip, ...changes } }
        : old
    )
  return {
    trip,
    update,
    start: (listId: string) => {
      if (householdId)
        setState({
          key,
          trip: {
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            listId,
            store: "",
            aside: [],
            elsewhere: {},
          },
        })
    },
    finish: () => setState({ key, trip: null }),
    restore: (id: string) => {
      if (!trip) return
      const elsewhere = { ...trip.elsewhere }
      if (trip.store) elsewhere[id] = trip.store
      else delete elsewhere[id]
      update({ aside: trip.aside.filter((item) => item !== id), elsewhere })
    },
    aside: (id: string) => {
      if (trip) update({ aside: [...new Set([...trip.aside, id])] })
    },
    elsewhere: (id: string, store: string) => {
      if (trip)
        update({
          elsewhere: { ...trip.elsewhere, [id]: store },
          aside: trip.aside.filter((item) => item !== id),
        })
    },
  }
}
export type TripControls = ReturnType<typeof useShoppingTrip>
