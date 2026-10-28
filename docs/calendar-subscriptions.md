# Calendar subscriptions — planning proposal

October 19, 2026. This scopes the exploratory calendar item in [features.md](features.md). It began as a proposal, not a release commitment. It is released in alpha.6, and the public site describes it from that release.

Implemented from October 19, 2026 and released in alpha.6: default and one-off meal times, a tokenized feed, subscription management and API schemas. SQLite route tests cover updates, revocation, skipped meals and daylight-saving boundaries. Calendar-client acceptance is still pending.

## Goal

Let a household see its dated meal plan in an external calendar, with useful recipe links and predictable event times. Merran remains the place to change the plan. A calendar subscription is a convenient view of the plan, not a second editor.

## Recommended first release

1. A household admin enables calendar subscriptions under **Settings → Household → Meal planning → Calendar subscriptions**. Each member with plan-read access can create and revoke their own subscription link. Admins can disable subscriptions and revoke every link for the household. A generated link is shown only when created; someone who loses it revokes the old link and creates a new one. A member's link stops working when that member leaves the household or loses plan-read access.
2. Set a household default start time and duration for breakfast, lunch, dinner and snack. Show one meal per row in settings, with explicit **Start time** and **Duration (minutes)** labels. Suggested initial values are 8:00/30 minutes, 12:00/45 minutes, 18:00/60 minutes and 15:00/30 minutes. These are editable and use the household's existing time zone. A dated meal slot can override its default start and duration for a particular day, such as dinner at 19:30 on Friday. The override belongs to the date and meal type, so moving a dish into that slot does not unexpectedly change its time.
3. Publish a read-only iCalendar (`text/calendar`) feed at a tokenized URL that calendar apps can subscribe to. Generate it from the current plan whenever the client fetches it. Include a bounded past/future window, initially the previous 90 days and next 365 days, with no fixed weekly export job.
4. Make one event for each dated day + meal type with at least one planned or cooked entry. Group the slot's dishes and note entries in plan order. Keep the weekly **This week, any day** pool out of the feed until a meal receives a date. Omit skipped entries; if all entries in a slot are skipped or removed, the event disappears on the next refresh. Cooked meals remain visible as meal history.
5. Render a short title such as `Dinner: Lemon Chicken + Garlic Rice`; use `Dinner: 2 dishes` when a title would be unwieldy, with the complete names in the description. Include recipe links, including the optional **With** recipe, and a link to that day in Merran. Calendar links open Merran's normal sign-in flow and do not grant recipe access by themselves. Include only meal names, the person's meal notes, recipe links and a brief servings line when set; do not expose ingredients, household tastes, shopping data, private recipe source URLs or cooking notes. Avoid repeating the same side recipe link.
6. Offer **Copy subscription link** and concise setup steps for calendar apps. Label the link as a secret: anyone holding it can read the feed's meal titles and notes until revoked. Explain that a self-hosted Merran URL must be reachable by the calendar service or device, and that external calendars decide their own refresh schedule.

## Event identity and time behavior

- Use a stable iCalendar `UID` derived from an opaque household namespace and dated slot (`day + meal type`), never from a recipe title or a feed token. This lets a calendar update an event when dishes or meal times change without publishing the household's database ID. A move between slots updates the destination event and removes or updates the source event on refresh. Keep the feed's `PRODID`, `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION` and `URL` valid and stable where appropriate; update modification metadata when the represented slot changes.
- Convert each slot's local wall time in the household's IANA time zone to an event instant. A meal should remain at the chosen local hour across daylight-saving changes. Define and test a deterministic rule for ambiguous or nonexistent wall times at DST transitions; prefer the earlier occurrence when a time repeats and the first valid instant after a gap.
- Calendar apps vary in title, description, link and refresh display. Keep the event useful when only its title is shown; put one recipe URL per line in the plain-text description and use a Merran plan URL as the event URL. Escape text, fold long iCalendar lines and use CRLF line endings. Avoid embedded HTML, attachments, alarms, invitations and attendee fields in the first release. Mark events transparent so the meal plan does not block availability on a work calendar.
- A calendar's removal of an event does **not** change Merran. When a meal is changed, skipped or removed in Merran, the feed reflects that at the calendar client's next refresh. Test deletion behavior in major clients; do not promise immediate removal.

## Data and API shape

- Store default meal times with household planning settings, validated as local `HH:mm` and a bounded duration. Store one-off overrides in a household-scoped slot record keyed by date and meal type, rather than on a `PlanEntry`; multiple dishes already share one slot. A no-longer-used override can remain for a future meal on that day, but the UI must let a plan editor reset it. Ordinary members with plan-write permission may change slot times as they change meals; changing household defaults stays admin-only.
- Keep subscription credentials in a dedicated household-scoped table with creator, created/revoked timestamps and a hash of a high-entropy token. Never put the raw token in ordinary API responses, logs, analytics or referrers. The feed route must not rely on browser cookies and must not accidentally accept ordinary API keys as a substitute for the token. Resolve the household only after validating the token. Rate-limit feed requests without making normal calendar polling brittle.
- Require a configured public URL before displaying a ready-to-subscribe link, or clearly explain when the URL is local-only. Do not build a tokenized URL from an untrusted request Host header. Serve the feed over HTTPS for remote use; set a restrictive referrer policy and `Cache-Control` appropriate for a private feed. Support `GET` and ideally `HEAD`, plus conditional requests (`ETag`/`Last-Modified`) if they improve polling without returning stale changes after revocation.
- Add session-authenticated management endpoints for enable/disable, default times, slot overrides, link creation/list/revocation. The feed endpoint is the one public-token exception. Document its response and management routes in OpenAPI; regenerate the web and extension API types together. Add the SQLite and Postgres migrations for new entities.

## Two-way changes

An iCalendar URL is a read-only subscription. It gives a calendar client a document to fetch and does not provide a callback when someone edits or deletes an event there. Two-way changes would need a separate calendar integration, such as provider-specific OAuth APIs with change notifications or a CalDAV design, plus account linking, identity mapping, conflict rules, retries and revocation. That is a distinct later project, not an easy option on this feed. If demand is clear, first decide whether calendar edits should create proposals for review or directly change the plan; deleting a calendar event should never silently delete a recipe or shopping work.

## Delivery order and acceptance

1. Add household defaults and one-off slot time controls in the plan and settings UI, including mobile drawers and exact English labels for the guide. Check how a changed household time zone affects existing overrides.
2. Add secure link management and the feed serializer. Verify two households cannot access each other's events, a revoked token fails immediately, note text cannot break iCalendar structure, and deleted recipes follow the same visibility rule as the plan API.
3. Verify import and subsequent refresh in Google Calendar, Apple Calendar and Outlook where practical, including multiple dishes, a note-only meal, a side recipe, a move, a skip, deletion, token revocation and a DST boundary. Record client refresh limitations rather than claiming a fixed delay.
4. Update [features.md](features.md), the public roadmap, the planning guide, OpenAPI/generated clients and release notes when this is built. Keep the public site's description tied to the released version.

## Product choices to validate with users

- Whether a member should be able to opt out of sharing free-form meal notes while still showing meal titles. Default to sharing only the text already visible on the household plan; make the contents clear before link creation.
- Whether people need separate calendars for only dinners or only upcoming meals. Start with one full household feed per link; add filters if the full calendar feels crowded.
- Whether a one-off time belongs to the slot (recommended) or a particular dish. The current plan groups dishes by dated meal type, so slot timing produces a cleaner calendar.

## References

- [iCalendar format, RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html): event properties, identity, date/time values and content encoding.
- [CalDAV, RFC 4791](https://www.rfc-editor.org/rfc/rfc4791.html): the separate protocol for managing calendar resources.
- [Google Calendar help: add a calendar from a URL](https://support.google.com/calendar/answer/37100?hl=en): one example of the subscription workflow.
