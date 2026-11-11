import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { Database } from "../../../database/orm.ts"
import type { FetchOptions, Fetcher } from "../../fetch/public-fetch.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import { eventsFrom, listenToEverything } from "../../../test/webhooks.ts"

// list.sent: a list going to a store's cart. Kroger's is sent by the server,
// so it tells what went. Walmart's is filled by the extension, which says
// what each stretch of filling did. Kroger here is a fake that knows a
// store and two products.

const CLIENT_ID = "merran-test"
const CLIENT_SECRET = "kroger-test-secret"
const KROGER = "https://api.kroger.com/v1"

const PRODUCTS: Record<string, { productId: string; upc: string }> = {
  milk: { productId: "milk1", upc: "0001111041700" },
  salt: { productId: "salt1", upc: "0002460001001" },
}

const LOCATION = {
  locationId: "70500822",
  chain: "FRYS",
  name: "Fry's Food Stores - 20th St",
  address: { addressLine1: "4724 N 20th St", city: "Phoenix", state: "AZ" },
}

/** What the fake Kroger does when asked to add to a cart. */
const kroger = { cartFails: false }

const asProduct = (term: string) => ({
  productId: PRODUCTS[term]!.productId,
  upc: PRODUCTS[term]!.upc,
  brand: "Kroger",
  description: `Kroger ${term}`,
  productPageURI: `/p/${PRODUCTS[term]!.productId}`,
  images: [],
  items: [
    {
      size: "1 ct",
      price: { regular: 3, promo: 0 },
      inventory: { stockLevel: "HIGH" },
    },
  ],
})

const fetcher: Fetcher = async (url, options?: FetchOptions) => {
  const answer = (status: number, body?: unknown) => ({
    url,
    status,
    contentType: "application/json",
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)),
  })
  if (!url.startsWith(KROGER)) return answer(404, {})
  const path = url.slice(KROGER.length)
  if (path === "/connect/oauth2/token") {
    const grant = options?.form?.grant_type
    if (grant === "client_credentials") {
      return answer(200, { access_token: "app-token", expires_in: 1800 })
    }
    return answer(200, {
      access_token: "user-token",
      refresh_token: "refresh",
      expires_in: 1800,
    })
  }
  if (path === "/cart/add") {
    return kroger.cartFails ? answer(500, {}) : answer(204)
  }
  if (path.startsWith("/locations")) {
    return path.startsWith("/locations?")
      ? answer(200, { data: [LOCATION] })
      : answer(200, { data: LOCATION })
  }
  if (path.startsWith("/products?")) {
    const term = new URL(url).searchParams.get("filter.term") ?? ""
    return answer(200, { data: term in PRODUCTS ? [asProduct(term)] : [] })
  }
  return answer(404, {})
}

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let home: string
let milk: string
let salt: string

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  await listenToEverything(kyle)

  const app_ = await kyle.patch("/api/settings/server", {
    "stores.krogerClientId": CLIENT_ID,
    "stores.krogerClientSecret": CLIENT_SECRET,
  })
  expect(app_.status, await app_.clone().text()).toBe(200)
  const picked = await kyle.put("/api/stores/kroger", {
    locationId: LOCATION.locationId,
  })
  expect(picked.status, await picked.clone().text()).toBe(200)

  // Linked as Kroger sends the person back.
  const started = await kyle.post("/api/stores/kroger/link")
  const url = new URL((await started.json()).url)
  const linked = await kyle.get(
    `/api/stores/kroger/callback?${new URLSearchParams({
      code: "good-code",
      state: url.searchParams.get("state") ?? "",
    })}`
  )
  expect(linked.headers.get("location")).toBe(
    "/settings/shopping?kroger=linked"
  )

  const add = async (text: string) => {
    const res = await kyle.post("/api/list/items", { text })
    expect(res.status, await res.clone().text()).toBe(201)
    return (await res.json()).id as string
  }
  milk = await add("1 gallon milk")
  salt = await add("Pinch of salt")
  // Looked at, so the products are chosen.
  const basket = await kyle.get("/api/stores/kroger/basket")
  expect(basket.status, await basket.clone().text()).toBe(200)
})

afterAll(() => close())

describe("sending to a store", () => {
  test("sending to Kroger tells webhooks", async () => {
    const events = await eventsFrom(database, home, async () => {
      const res = await kyle.post("/api/stores/kroger/send", {
        lines: [
          { itemId: milk, packages: 1 },
          { itemId: salt, packages: 1 },
        ],
        notFound: 1,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "list.sent",
      store: { id: "kroger", name: "Fry's" },
      sent: 2,
      notFound: 1,
    })
  })

  test("a send that fails at Kroger tells nobody", async () => {
    kroger.cartFails = true
    try {
      const events = await eventsFrom(database, home, async () => {
        const res = await kyle.post("/api/stores/kroger/send", {
          lines: [{ itemId: milk, packages: 1 }],
          notFound: 0,
        })
        expect(res.status).toBeGreaterThanOrEqual(400)
      })
      expect(events).toEqual([])
    } finally {
      kroger.cartFails = false
    }
  })

  test("the extension says what a Walmart fill did", async () => {
    // Off until the server admin turns it on.
    const off = await kyle.post("/api/stores/walmart/filled", {
      sent: 4,
      notFound: 1,
    })
    expect(off.status).toBe(422)
    expect((await off.json()).error.code).toBe("walmart_off")

    const on = await kyle.patch("/api/settings/server", {
      "stores.walmart": true,
    })
    expect(on.status, await on.clone().text()).toBe(200)

    const events = await eventsFrom(database, home, async () => {
      const res = await kyle.post("/api/stores/walmart/filled", {
        sent: 4,
        notFound: 1,
      })
      expect(res.status, await res.clone().text()).toBe(204)
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "list.sent",
      store: { id: "walmart", name: "Walmart" },
      sent: 4,
      notFound: 1,
    })
  })
})
