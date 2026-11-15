import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { Database } from "../../../database/orm.ts"
import {
  fakeAiFetcher,
  GOOD_KEYS,
  mockAiModels,
  type MockCall,
  type MockReply,
} from "../../../test/ai.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  listenToEverything,
  sentEvents,
} from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"

// tidy.ready and review.waiting: said when suggestions or proposals are
// waiting in Review, except for what someone asked their own chat for.

type Prompt = { role: string; content: string | { text?: string }[] }[]

const BASE = {
  description: null,
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: null,
  tags: [],
  ingredients: ["1 cup rice", "8 oz mushrooms"],
  steps: ["Cook the rice. Add the mushrooms. Eat it."],
}

/** What tidy up says: split the long step into three. */
const TIDIED = {
  summary: "Split the long step.",
  ingredients: null,
  steps: ["Cook the rice.", "Add the mushrooms.", "Eat it."],
  tags: null,
  description: null,
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  marks: null,
  foods: null,
}

const NOTHING = { ...TIDIED, summary: "Nothing to change.", steps: null }

/** What a cooking note says: more time. */
const NOTE_EDIT = {
  change: true,
  summary: "Adds 5 minutes.",
  servings: null,
  prepMinutes: null,
  cookMinutes: 25,
  totalMinutes: null,
  ingredients: null,
  steps: null,
  notes: null,
}

let tidy: () => unknown = () => TIDIED
let script: MockReply[] = []
const reply = (call: MockCall): MockReply => {
  const prompt = call.prompt as Prompt
  const system = prompt.find((m) => m.role === "system")?.content
  if (typeof system !== "string") return "ok"
  if (system.startsWith("You estimate nutrition")) {
    return JSON.stringify({
      calories: 500,
      protein: null,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
      sodium: null,
    })
  }
  if (system.startsWith("You're the kitchen assistant")) {
    return script.shift() ?? "Done."
  }
  if (system.startsWith("Someone left a note")) return JSON.stringify(NOTE_EDIT)
  return JSON.stringify(tidy())
}

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string

beforeAll(async () => {
  const test = await createTestApp({
    publicUrl: "http://merran.test",
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(undefined, [], undefined, reply),
  })
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  await listenToEverything(kyle)
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status, await key.clone().text()).toBe(201)
})

afterAll(() => close())

const addRecipe = async (name: string) => {
  const res = await kyle.post("/api/recipes", { ...BASE, name })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

const REVIEW = "http://merran.test/recipes/review"

describe("tidy.ready", () => {
  test("tidying one recipe with suggestions tells webhooks", async () => {
    const risotto = await addRecipe("Mushroom Risotto")
    await jobs.drain()

    const sent = await eventsFrom(database, home, () =>
      kyle.post(`/api/recipes/${risotto.slug}/tidy`, {})
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "tidy.ready",
      count: 1,
      recipes: [{ id: risotto.id, slug: "mushroom-risotto" }],
      url: REVIEW,
      by: { name: expect.any(String) },
      via: "app",
    })
  })

  test("says nothing when the AI suggests nothing", async () => {
    const plain = await addRecipe("Plain Rice")
    await jobs.drain()
    tidy = () => NOTHING

    const sent = await eventsFrom(database, home, () =>
      kyle.post(`/api/recipes/${plain.slug}/tidy`, {})
    )

    tidy = () => TIDIED
    expect(sent).toEqual([])
  })

  test("a tidy run sends one event for the run", async () => {
    // One more than the 10 an event names, to show the cap.
    const names = Array.from({ length: 12 }, (_, i) => `Run Recipe ${i + 1}`)
    for (const name of names) await addRecipe(name)
    await jobs.drain()

    const sent = await eventsFrom(database, home, async () => {
      const res = await kyle.post("/api/recipes/tidy", {})
      expect(res.status, await res.clone().text()).toBe(202)
      await jobs.drain()
    })

    // Plain Rice was tidied already, and so was the risotto.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "tidy.ready",
      count: 12,
      by: null,
      via: "merran",
      url: REVIEW,
    })
    expect(sent[0]!.recipes).toHaveLength(10)
    expect(
      sent[0]!.recipes.map((recipe: { title: string }) => recipe.title)
    ).toEqual(names.slice(0, 10))
  })

  test("a run that finds nothing sends nothing", async () => {
    await addRecipe("Quiet Soup")
    await jobs.drain()
    tidy = () => NOTHING

    const sent = await eventsFrom(database, home, async () => {
      await kyle.post("/api/recipes/tidy", {})
      await jobs.drain()
    })

    tidy = () => TIDIED
    expect(sent).toEqual([])
  })
})

describe("review.waiting", () => {
  describe("from an AI app", () => {
    let key: string

    beforeAll(async () => {
      const made = await kyle.post("/api/auth/api-keys", {
        name: "Claude Desktop",
        permissions: { recipes: "write", plan: "write" },
        expiresInDays: 90,
      })
      expect(made.status).toBe(201)
      key = (await made.json()).key
    })

    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await app.request(`${TEST_ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      })
      expect(response.status).toBe(200)
      const text = await response.text()
      return JSON.parse(
        text.startsWith("event:")
          ? text
              .split("\n")
              .find((line) => line.startsWith("data: "))!
              .slice(6)
          : text
      )
    }

    test("an AI app's proposal waits in Review", async () => {
      const recipe = await addRecipe("Toast")
      const sent = await eventsFrom(database, home, async () => {
        const result = await call("propose_recipe_edit", {
          ...BASE,
          recipe: recipe.id,
          summary: "Butter it",
          ingredients: ["2 slices bread", "butter"],
          steps: ["Toast the bread."],
          notes: null,
        })
        expect(
          result.result.isError,
          JSON.stringify(result.result.content)
        ).not.toBe(true)
      })

      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        type: "review.waiting",
        source: "mcp",
        count: 1,
        recipe: { id: recipe.id, slug: "toast", title: "Toast" },
        url: REVIEW,
        via: "mcp",
        key: { name: "Claude Desktop" },
      })
    })

    test("one that isn't about a recipe has none", async () => {
      const sent = await eventsFrom(database, home, async () => {
        const result = await call("propose_meals", {
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
        expect(result.result.isError).not.toBe(true)
      })

      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        type: "review.waiting",
        source: "mcp",
        count: 1,
        recipe: null,
        via: "mcp",
      })
    })
  })

  test("a proposal from your own chat sends nothing", async () => {
    const chat = await kyle.post("/api/assistant/chats")
    expect(chat.status, await chat.clone().text()).toBe(201)
    const chatId = (await chat.json()).id
    script = [
      {
        toolCalls: [
          {
            toolName: "propose_list_items",
            input: { summary: "Rice.", items: ["2 cups rice"] },
          },
        ],
      },
      "Here you go.",
    ]

    const before = (await sentEvents(database, home, "review.waiting")).length
    const res = await kyle.post(`/api/assistant/chats/${chatId}/messages`, {
      text: "Add rice to my list",
    })
    expect(res.status, await res.clone().text()).toBe(200)
    // The proposal is made, and it told no one.
    const streamed = await res.text()
    expect(streamed).toContain('"kind":"list","status":"pending"')
    expect((await sentEvents(database, home, "review.waiting")).length).toBe(
      before
    )
  })

  test("a cooking note turned into an edit waits in Review", async () => {
    const stew = await addRecipe("Beef Stew")
    await jobs.drain()

    const sent = await eventsFrom(database, home, async () => {
      const res = await kyle.post(`/api/recipes/${stew.slug}/cook-notes`, {
        rating: 4,
        note: "Needed 5 more minutes.",
      })
      expect(res.status, await res.clone().text()).toBe(201)
      await jobs.drain()
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "review.waiting",
      source: "cook_note",
      count: 1,
      recipe: { id: stew.id, slug: "beef-stew", title: "Beef Stew" },
      url: REVIEW,
      by: null,
      via: "merran",
    })
  })
})
