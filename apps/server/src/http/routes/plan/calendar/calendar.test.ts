import { clockIn } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../test/app.ts"
import { calendarInstant } from "../../../../services/plan/calendar/time.ts"

let app: App
let close: () => Promise<void>
let owner: TestClient
let member: TestClient
let today: string

beforeAll(async () => {
  const testApp = await createTestApp()
  ;({ app, close } = testApp)
  owner = await setUpServer(app, testApp.setupCode)
  member = await join(app, await inviteToken(owner), account("calendar_member"))
  today = clockIn("UTC").today
})

afterAll(() => close())

describe("meal calendar subscriptions", () => {
  test("an admin controls times and a member owns a revocable link", async () => {
    const initial = await (await member.get("/api/plan/calendar")).json()
    expect(initial).toMatchObject({
      enabled: false,
      times: { dinner: { start: "18:00" } },
    })
    expect(
      (await member.patch("/api/plan/calendar", { enabled: true })).status
    ).toBe(403)

    const changed = await owner.patch("/api/plan/calendar", {
      enabled: true,
      times: {
        breakfast: { start: "08:00", minutes: 30 },
        lunch: { start: "12:00", minutes: 45 },
        dinner: { start: "19:00", minutes: 60 },
        snack: { start: "15:00", minutes: 30 },
      },
    })
    expect(changed.status).toBe(200)

    const created = await member.post("/api/plan/calendar/links")
    expect(created.status, await created.clone().text()).toBe(201)
    const link = await created.json()
    expect(link.url).toMatch(
      /^http:\/\/merran\.test\/api\/plan\/calendar\/feed\//
    )
    expect(
      (await (await member.get("/api/plan/calendar")).json()).links
    ).toEqual([{ id: link.id, createdAt: link.createdAt }])
    expect(
      (await (await owner.get("/api/plan/calendar")).json()).links
    ).toEqual([])

    const path = new URL(link.url).pathname
    const empty = await new TestClient(app).get(path)
    expect(empty.status).toBe(200)
    expect(empty.headers.get("content-type")).toContain("text/calendar")
    expect(await empty.text()).toContain("BEGIN:VCALENDAR\r\n")

    const recipe = await (
      await owner.post("/api/recipes", {
        name: "Lemon Chicken",
        servings: 4,
        ingredients: ["1 lemon"],
        steps: ["Cook it."],
      })
    ).json()
    const side = await (
      await owner.post("/api/recipes", {
        name: "Garlic Rice",
        servings: 4,
        ingredients: ["1 cup rice"],
        steps: ["Cook the rice."],
      })
    ).json()
    const added = await owner.post("/api/plan/entries", {
      date: today,
      meal: "dinner",
      recipe: recipe.id,
      withRecipe: side.id,
    })
    expect(added.status, await added.clone().text()).toBe(201)
    const entry = await added.json()
    const note = await owner.post("/api/plan/entries", {
      date: today,
      meal: "dinner",
      note: "Bring plates, please; thanks",
    })
    expect(note.status, await note.clone().text()).toBe(201)

    const first = await (await new TestClient(app).get(path)).text()
    expect(first).toContain("SUMMARY:Dinner: Lemon Chicken + Garlic Rice")
    expect(first).toContain("DTSTART:")
    expect(first.replaceAll("\r\n ", "")).toContain(
      "Lemon Chicken: http://merran.test/recipes/"
    )
    expect(first.replaceAll("\r\n ", "")).toContain(
      "Garlic Rice: http://merran.test/recipes/"
    )
    expect(first).toContain("Bring plates\\, please\\; thanks")
    const uid = first.match(/UID:[^\r\n]+/)?.[0]
    expect(uid).toBeTruthy()

    const override = await member.put(
      `/api/plan/calendar/slots/${today}/dinner`,
      {
        start: "20:30",
        minutes: 90,
      }
    )
    expect(override.status, await override.clone().text()).toBe(200)
    const second = await (await new TestClient(app).get(path)).text()
    expect(second).toContain(`DTSTART:${today.replaceAll("-", "")}T203000Z`)
    expect(second).toContain(uid)
    expect(
      (
        await (
          await member.get(`/api/plan/calendar/slots?from=${today}&to=${today}`)
        ).json()
      ).slots
    ).toMatchObject([{ start: "20:30", minutes: 90 }])

    expect(
      (await member.delete(`/api/plan/calendar/slots/${today}/dinner`)).status
    ).toBe(204)
    const restored = await (await new TestClient(app).get(path)).text()
    expect(restored).toContain(`DTSTART:${today.replaceAll("-", "")}T190000Z`)

    expect(
      (
        await owner.patch(`/api/plan/entries/${entry.id}`, {
          status: "skipped",
        })
      ).status
    ).toBe(200)
    expect(
      (
        await owner.patch(`/api/plan/entries/${(await note.json()).id}`, {
          status: "skipped",
        })
      ).status
    ).toBe(200)
    expect(await (await new TestClient(app).get(path)).text()).not.toContain(
      "BEGIN:VEVENT"
    )

    expect(
      (await member.delete(`/api/plan/calendar/links/${link.id}`)).status
    ).toBe(204)
    expect((await new TestClient(app).get(path)).status).toBe(404)
  })

  test("turning subscriptions off revokes all outstanding links", async () => {
    const memberLink = await (
      await member.post("/api/plan/calendar/links")
    ).json()
    const memberPath = new URL(memberLink.url).pathname
    const ownerLink = await (
      await owner.post("/api/plan/calendar/links")
    ).json()
    const ownerPath = new URL(ownerLink.url).pathname
    expect((await new TestClient(app).get(memberPath)).status).toBe(200)
    const members = await (
      await owner.get("/api/households/current/members")
    ).json()
    const memberId = members.find(
      (person: { name: string }) => person.name === "calendar_member"
    ).id
    expect(
      (await owner.delete(`/api/households/current/members/${memberId}`)).status
    ).toBe(204)
    expect((await new TestClient(app).get(memberPath)).status).toBe(404)
    expect((await new TestClient(app).get(ownerPath)).status).toBe(200)
    expect(
      (await owner.patch("/api/plan/calendar", { enabled: false })).status
    ).toBe(200)
    expect((await new TestClient(app).get(ownerPath)).status).toBe(404)
  })
})

describe("household wall times", () => {
  test("keep the same local hour across daylight-saving changes", () => {
    expect(
      calendarInstant("2026-03-07", "18:00", "America/New_York").toISOString()
    ).toBe("2026-03-07T23:00:00.000Z")
    expect(
      calendarInstant("2026-03-08", "18:00", "America/New_York").toISOString()
    ).toBe("2026-03-08T22:00:00.000Z")
  })

  test("choose the earlier repeated time and first valid time after a gap", () => {
    expect(
      calendarInstant("2026-11-01", "01:30", "America/New_York").toISOString()
    ).toBe("2026-11-01T05:30:00.000Z")
    expect(
      calendarInstant("2026-03-08", "02:30", "America/New_York").toISOString()
    ).toBe("2026-03-08T07:00:00.000Z")
  })
})
