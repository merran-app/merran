import { expect, test } from "vitest"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

test("onboarding remembers personal choices without changing another member's choices", async () => {
  const test = await createTestApp()
  try {
    const owner = await setUpServer(test.app, test.setupCode)
    const member = await join(
      test.app,
      await inviteToken(owner),
      account("member")
    )
    const initial = await (await owner.get("/api/auth/me/onboarding")).json()
    expect(initial).toMatchObject({
      tours: {},
      dismissed: false,
      toursDisabled: false,
      reviewed: false,
      progress: { recipe: false, plan: false, list: false, cook: false },
    })
    expect(
      (
        await owner.patch("/api/auth/me/onboarding", {
          tour: { id: "today", version: 1 },
          dismissed: true,
          toursDisabled: true,
          reviewed: true,
        })
      ).status
    ).toBe(200)
    expect(
      await (await owner.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({
      tours: { today: 1 },
      dismissed: true,
      toursDisabled: true,
      reviewed: true,
    })
    expect(
      await (await member.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({
      tours: {},
      dismissed: false,
      toursDisabled: false,
      reviewed: true,
    })
    expect(
      (await member.patch("/api/auth/me/onboarding", { reviewed: true })).status
    ).toBe(403)
    expect(
      (await new TestClient(test.app).get("/api/auth/me/onboarding")).status
    ).toBe(401)
    await owner.patch("/api/auth/me/onboarding", {
      dismissed: false,
      toursDisabled: false,
      resetTours: true,
    })
    expect(
      await (await owner.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({
      tours: {},
      dismissed: false,
      toursDisabled: false,
      reviewed: true,
    })
  } finally {
    await test.close()
  }
})

test("progress comes from household data and stays separate between households", async () => {
  const test = await createTestApp()
  try {
    const owner = await setUpServer(test.app, test.setupCode)
    const member = await join(
      test.app,
      await inviteToken(owner),
      account("other")
    )
    const recipeResponse = await owner.post("/api/recipes", {
      name: "Dinner",
      servings: 2,
      ingredients: [],
      steps: [],
    })
    expect(recipeResponse.status).toBe(201)
    const recipe = await recipeResponse.json()
    expect(
      (await owner.patch("/api/auth/me/onboarding", { recordProgress: true }))
        .status
    ).toBe(200)
    await owner.delete(`/api/recipes/${recipe.id}`)
    expect(
      await (await member.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({ progress: { recipe: true } })
    const created = await owner.post("/api/households", {
      name: "Another kitchen",
    })
    expect(created.status).toBe(201)
    const household = await created.json()
    await owner.post("/api/auth/organization/set-active", {
      organizationId: household.id,
    })
    expect(
      await (await owner.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({
      reviewed: false,
      progress: { recipe: false, plan: false, list: false, cook: false },
    })
    expect(
      await (await member.get("/api/auth/me/onboarding")).json()
    ).toMatchObject({ progress: { recipe: true } })
  } finally {
    await test.close()
  }
})
