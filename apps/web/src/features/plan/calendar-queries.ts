import { queryOptions } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"

export const calendarSettingsQuery = queryOptions({
  queryKey: ["plan", "calendar", "settings"],
  queryFn: () => unwrap(api.GET("/api/plan/calendar")),
})

export const calendarSlotTimesQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["plan", "calendar", "slots", from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/plan/calendar/slots", { params: { query: { from, to } } })
      ),
  })
