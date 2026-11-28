import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  budgetProblems,
  FIRST_LOAD_BUDGET,
  firstLoad,
  missingRoutes,
  TODAY_FIRST_LOAD,
  type BuiltChunk,
} from "./budget.ts"

function chunk(
  fileName: string,
  overrides: Partial<BuiltChunk> = {}
): BuiltChunk {
  return {
    fileName,
    isEntry: false,
    facadeModuleId: null,
    imports: [],
    moduleIds: [],
    ...overrides,
  }
}

const entry = chunk("assets/index.js", {
  isEntry: true,
  imports: ["assets/a.js"],
})
const a = chunk("assets/a.js")
const b = chunk("assets/b.js")
const c = chunk("assets/c.js", { imports: ["assets/a.js"] })
const d = chunk("assets/d.js")
const appRoute = chunk("assets/_app.js", {
  facadeModuleId: "D:\\x\\apps\\web\\src\\routes\\_app.tsx?tsr-split=component",
  imports: ["assets/b.js"],
})
const todayRoute = chunk("assets/today.js", {
  facadeModuleId:
    "D:\\x\\apps\\web\\src\\routes\\_app\\index.tsx?tsr-split=component",
  imports: ["assets/c.js"],
})
const otherRoute = chunk("assets/other.js", {
  facadeModuleId:
    "D:\\x\\apps\\web\\src\\routes\\_app\\library.tsx?tsr-split=component",
  imports: ["assets/d.js"],
})
const chunks = [entry, a, b, c, d, appRoute, todayRoute, otherRoute]

function names(load: BuiltChunk[]): string[] {
  return load.map((item) => item.fileName).sort()
}

describe("firstLoad", () => {
  it("the first load is the entry, the routes and what they import", () => {
    assert.deepEqual(names(firstLoad(chunks, TODAY_FIRST_LOAD)), [
      "assets/_app.js",
      "assets/a.js",
      "assets/b.js",
      "assets/c.js",
      "assets/index.js",
      "assets/today.js",
    ])
  })

  it("a chunk imported twice is counted once", () => {
    const load = firstLoad(chunks, TODAY_FIRST_LOAD)
    assert.equal(
      load.filter((item) => item.fileName === "assets/a.js").length,
      1
    )
  })
})

describe("budgetProblems", () => {
  const small = () => 100

  it("a load within the budget has no problems", () => {
    assert.deepEqual(
      budgetProblems(
        firstLoad(chunks, TODAY_FIRST_LOAD),
        small,
        FIRST_LOAD_BUDGET
      ),
      []
    )
  })

  it("too many files says how many", () => {
    const many = Array.from({ length: 71 }, (_, index) =>
      chunk(`assets/m${index}.js`)
    )
    const problems = budgetProblems(many, small, FIRST_LOAD_BUDGET)
    assert.equal(problems.length, 1)
    assert.match(problems.join(" "), /71/)
    assert.match(problems.join(" "), /70/)
  })

  it("too big says how big", () => {
    const load = [chunk("assets/x.js"), chunk("assets/y.js")]
    const sizes: Record<string, number> = {
      "assets/x.js": 300_000,
      "assets/y.js": 80_001,
    }
    const problems = budgetProblems(
      load,
      (name) => sizes[name] ?? 0,
      FIRST_LOAD_BUDGET
    )
    assert.equal(problems.length, 1)
    assert.match(problems.join(" "), /380/)
  })

  it("the foods vocabulary says which file has it", () => {
    const foods = chunk("assets/foods-abc.js", {
      moduleIds: ["D:/x/packages/shared/src/foods/data/foods.ts"],
    })
    const problems = budgetProblems([foods], small, FIRST_LOAD_BUDGET)
    assert.equal(problems.length, 1)
    assert.match(problems.join(" "), /assets\/foods-abc\.js/)
  })
})

describe("missingRoutes", () => {
  it("a route no chunk has is named", () => {
    const load = firstLoad(chunks, TODAY_FIRST_LOAD)
    const routes = [
      ...TODAY_FIRST_LOAD,
      "src/routes/_app/gone.tsx?tsr-split=component",
    ]
    const problems = missingRoutes(load, routes)
    assert.equal(problems.length, 1)
    assert.match(problems[0] ?? "", /gone\.tsx/)
  })

  it("routes that all have chunks give no problems", () => {
    const load = firstLoad(chunks, TODAY_FIRST_LOAD)
    assert.deepEqual(missingRoutes(load, TODAY_FIRST_LOAD), [])
  })
})
