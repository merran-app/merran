import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"
import { findBySourceUrls } from "./links.ts"

// Which of some links the household has a recipe from, under any address,
// read in one go, as checking a pasted list of links does.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let homeId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  homeId = (await (await kyle.get("/api/households/current")).json()).id
  await kyle.post("/api/recipes", {
    name: "Tomato Soup",
    sourceUrl: "https://cooking.example/soup",
  })
})

afterAll(() => close())

describe("findBySourceUrls", () => {
  test("finds each link's recipe in one go, under any address", async () => {
    const em = forHousehold(database.em.fork(), homeId)
    const found = await findBySourceUrls(em, [
      "http://www.cooking.example/soup/",
      "https://cooking.example/stew",
    ])
    expect(found.get("http://www.cooking.example/soup/")).toMatchObject({
      name: "Tomato Soup",
      slug: "tomato-soup",
    })
    expect(found.has("https://cooking.example/stew")).toBe(false)
  })
})
