import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../test/app.ts"

let setup: Awaited<ReturnType<typeof createTestApp>>
let owner: TestClient
let readKey: string
let writeKey: string

beforeAll(async () => {
  setup = await createTestApp()
  owner = await setUpServer(setup.app, setup.setupCode)
  readKey = (await makeKey({ recipes: "read" })).key
  writeKey = (
    await makeKey({
      recipes: "write",
      plan: "write",
      list: "write",
      household: "read",
      pantry: "read",
    })
  ).key
})
afterAll(() => setup.close())

async function makeKey(permissions: Record<string, string>) {
  const response = await owner.post("/api/auth/api-keys", {
    name: "MCP tests",
    permissions,
    expiresInDays: 90,
  })
  expect(response.status).toBe(201)
  return response.json()
}

function request(
  key: string | null,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return setup.app.request(`${TEST_ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

async function rpc(
  key: string,
  method: string,
  params: Record<string, unknown> = {}
) {
  const response = await request(key, { jsonrpc: "2.0", id: 1, method, params })
  expect(response.status).toBe(200)
  const text = await response.text()
  // The SDK serves legacy clients over SSE and modern clients over JSON.
  return JSON.parse(
    text.startsWith("event:")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data: "))!
          .slice(6)
      : text
  )
}

function call(key: string, name: string, args: Record<string, unknown> = {}) {
  return rpc(key, "tools/call", { name, arguments: args })
}

describe("MCP authentication and protocol", () => {
  test("works through the official client with protocol negotiation", async () => {
    const client = new Client({ name: "merran-test", version: "1" })
    const transport = new StreamableHTTPClientTransport(
      new URL(`${TEST_ORIGIN}/mcp`),
      {
        requestInit: { headers: { authorization: `Bearer ${readKey}` } },
        fetch: async (input, init) => setup.app.fetch(new Request(input, init)),
      }
    )
    try {
      await client.connect(transport)
      expect((await client.listTools()).tools.map((t) => t.name)).toContain(
        "list_tags"
      )
      const result = await client.callTool({ name: "list_tags", arguments: {} })
      expect(result.isError).not.toBe(true)
    } finally {
      await client.close()
    }
  })
  test("requires a key and refuses a browser session alone", async () => {
    expect((await request(null, {})).status).toBe(401)
    expect((await owner.post("/mcp", {})).status).toBe(401)
    const invalid = await request("mrn_invalid", {})
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get("www-authenticate")).toContain("Bearer")
    expect(invalid.headers.get("cache-control")).toBe("no-store")
  })
  test("rejects an untrusted browser origin", async () => {
    expect(
      (await request(readKey, {}, { origin: "https://untrusted.test" })).status
    ).toBe(403)
  })
  test("negotiates with legacy Streamable HTTP clients", async () => {
    const result = await rpc(readKey, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    })
    expect(result.result.serverInfo.name).toBe("merran")
    expect(result.result.capabilities.tools).toBeDefined()
  })
  test("lists only allowed tools and refuses hidden tools by name", async () => {
    const result = await rpc(readKey, "tools/list")
    expect(
      result.result.tools.map((tool: { name: string }) => tool.name).sort()
    ).toEqual(["get_recipe", "list_tags", "search_recipes"])
    const denied = await call(readKey, "propose_list_items", {
      summary: "Milk",
      items: ["milk"],
    })
    expect(denied.error ?? denied.result?.isError).toBeTruthy()
  })
  test("rejects oversized requests before creating a proposal", async () => {
    expect(
      (
        await request(writeKey, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "propose_list_items",
            arguments: { items: ["x".repeat(1024 * 1024)] },
          },
        })
      ).status
    ).toBe(413)
  })
  test("revocation takes effect on the next request", async () => {
    const key = await makeKey({ recipes: "read" })
    await rpc(key.key, "tools/list")
    expect((await owner.delete(`/api/auth/api-keys/${key.id}`)).status).toBe(
      204
    )
    expect(
      (await request(key.key, { jsonrpc: "2.0", id: 1, method: "tools/list" }))
        .status
    ).toBe(401)
  })
})

describe("MCP proposals", () => {
  test("reads recipes without leaking dietary preferences to recipe-only keys", async () => {
    const response = await owner.post("/api/recipes", {
      name: "Cream soup",
      ingredients: ["1 cup milk"],
      steps: ["Warm the milk."],
    })
    expect(response.status).toBe(201)
    const recipe = await response.json()
    expect(
      (
        await owner.put("/api/households/current/tastes", {
          avoid: [{ food: "milk", level: "allergy", who: "Jamie" }],
          diets: [],
          weeknightMinutes: null,
        })
      ).status
    ).toBe(200)
    const limited = JSON.parse(
      (await call(readKey, "get_recipe", { recipe: recipe.id })).result
        .content[0].text
    )
    expect(limited.name).toBe("Cream soup")
    expect(limited).not.toHaveProperty("doesntSuit")
    expect(limited).not.toHaveProperty("leftOut")
    const full = JSON.parse(
      (await call(writeKey, "get_recipe", { recipe: recipe.id })).result
        .content[0].text
    )
    expect(full.doesntSuit).toContain("milk")
    const blocked = await call(writeKey, "propose_meals", {
      summary: "Soup",
      meals: [
        {
          date: "2026-10-20",
          meal: "dinner",
          recipe: recipe.id,
          with: null,
          note: null,
          servings: 2,
        },
      ],
    })
    expect(blocked.result.isError).toBe(true)
    expect(JSON.parse(blocked.result.content[0].text).error.code).toBe(
      "allergy"
    )
  })
  test("queues a new recipe and recipe edits without changing the library", async () => {
    const fields = {
      description: null,
      servings: 2,
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: null,
      tags: [],
      ingredients: ["2 apples"],
      steps: ["Slice the apples."],
      notes: null,
    }
    const result = await call(writeKey, "propose_new_recipe", {
      ...fields,
      name: "Sliced apples",
      summary: "A snack",
    })
    const created = JSON.parse(result.result.content[0].text).proposal
    expect(created).toMatchObject({
      kind: "recipe",
      status: "pending",
      recipe: null,
    })
    expect(
      (await (await owner.get("/api/proposals")).json()).proposals.some(
        (p: { id: string }) => p.id === created.id
      )
    ).toBe(true)
    const saved = await owner.post(`/api/proposals/${created.id}/apply`, {})
    expect(saved.status).toBe(200)
    const recipe = (await saved.json()).recipe
    const edited = await call(writeKey, "propose_recipe_edit", {
      ...fields,
      recipe: recipe.id,
      summary: "Serve chilled",
      steps: ["Slice and chill the apples."],
    })
    const edit = JSON.parse(edited.result.content[0].text).proposal
    const before = JSON.parse(
      (await call(readKey, "get_recipe", { recipe: recipe.id })).result
        .content[0].text
    )
    expect(before.steps).toEqual(["Slice the apples."])
    expect(
      (
        await owner.post(`/api/proposals/${edit.id}/apply`, {
          sections: ["steps"],
        })
      ).status
    ).toBe(200)
    const after = JSON.parse(
      (await call(readKey, "get_recipe", { recipe: recipe.id })).result
        .content[0].text
    )
    expect(after.steps).toEqual(["Slice and chill the apples."])
  })
  test("meal proposals can be reviewed and dismissed without changing the plan", async () => {
    const result = await call(writeKey, "propose_meals", {
      summary: "Leftovers",
      meals: [
        {
          date: "2026-10-20",
          meal: "dinner",
          recipe: null,
          with: null,
          note: "Leftovers",
          servings: null,
        },
      ],
    })
    const proposal = JSON.parse(result.result.content[0].text).proposal
    expect(proposal.kind).toBe("meals")
    expect(
      (await (await owner.get("/api/proposals")).json()).proposals.some(
        (p: { id: string }) => p.id === proposal.id
      )
    ).toBe(true)
    expect(
      (await owner.post(`/api/proposals/${proposal.id}/dismiss`)).status
    ).toBe(200)
    const plan = JSON.parse(
      (
        await call(writeKey, "get_meal_plan", {
          from: "2026-10-20",
          to: "2026-10-20",
        })
      ).result.content[0].text
    )
    expect(plan.meals).toEqual([])
  })
  test("validates tool arguments without changing anything", async () => {
    const result = await call(writeKey, "propose_list_items", {
      summary: "Empty",
      items: [],
    })
    expect(result.error ?? result.result?.isError).toBeTruthy()
  })
  test("queues list items for review and applies only through the user's review", async () => {
    const result = await call(writeKey, "propose_list_items", {
      summary: "Get milk",
      items: ["2 litres milk"],
    })
    expect(result.result.isError).not.toBe(true)
    const output = JSON.parse(result.result.content[0].text)
    expect(output.reviewUrl).toBe(`${TEST_ORIGIN}/recipes/review`)
    expect(output.proposal).toMatchObject({
      kind: "list",
      status: "pending",
      chat: null,
    })
    const queue = await (await owner.get("/api/proposals")).json()
    expect(
      queue.proposals.some((p: { id: string }) => p.id === output.proposal.id)
    ).toBe(true)
    const before = await call(writeKey, "get_shopping_list")
    expect(JSON.parse(before.result.content[0].text).items).toEqual([])
    const applied = await owner.post(
      `/api/proposals/${output.proposal.id}/apply`,
      {}
    )
    expect(applied.status).toBe(200)
    const after = await call(writeKey, "get_shopping_list")
    expect(JSON.parse(after.result.content[0].text).items).toHaveLength(1)
  })
  test("recipe-only REST keys cannot read or apply list proposals", async () => {
    const result = await call(writeKey, "propose_list_items", {
      summary: "Private list",
      items: ["apples"],
    })
    const proposal = JSON.parse(result.result.content[0].text).proposal
    const recipeWriter = await makeKey({ recipes: "write" })
    const headers = {
      authorization: `Bearer ${recipeWriter.key}`,
      "content-type": "application/json",
    }
    const list = await setup.app.request(`${TEST_ORIGIN}/api/proposals`, {
      headers,
    })
    const listed = (await list.json()) as { proposals: { id: string }[] }
    expect(listed.proposals.some((p) => p.id === proposal.id)).toBe(false)
    for (const [method, suffix] of [
      ["GET", ""],
      ["POST", "/apply"],
      ["POST", "/dismiss"],
    ]) {
      const response = await setup.app.request(
        `${TEST_ORIGIN}/api/proposals/${proposal.id}${suffix}`,
        { method, headers, ...(method === "POST" ? { body: "{}" } : {}) }
      )
      expect(response.status).toBe(403)
    }
  })
  test("a key stays in its household after the owner switches households", async () => {
    const first = await (await owner.get("/api/households/current")).json()
    const other = await owner.post("/api/households", { name: "Other kitchen" })
    expect(other.status).toBe(201)
    const output = JSON.parse(
      (
        await call(writeKey, "propose_list_items", {
          summary: "Original household only",
          items: ["pears"],
        })
      ).result.content[0].text
    )
    expect(
      (await owner.get(`/api/proposals/${output.proposal.id}`)).status
    ).toBe(404)
    expect(
      (
        await owner.post("/api/auth/organization/set-active", {
          organizationId: first.id,
        })
      ).status
    ).toBe(200)
    expect(
      (await owner.get(`/api/proposals/${output.proposal.id}`)).status
    ).toBe(200)
  })
})
