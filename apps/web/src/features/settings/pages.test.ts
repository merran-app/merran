import assert from "node:assert/strict"
import { test } from "node:test"

import {
  pageAt,
  settingsRedirect,
  viewerFrom,
  visiblePages,
  type SettingsPageId,
  type Viewer,
} from "./pages.ts"

const member = { serverAdmin: false, householdRole: "member" } as const
const householdAdmin = { serverAdmin: false, householdRole: "admin" } as const
const runsServer = { serverAdmin: true, householdRole: "owner" } as const
const serverAdminAsMember = {
  serverAdmin: true,
  householdRole: "member",
} as const
const noHousehold = { serverAdmin: false, householdRole: null } as const
const serverAdminNoHousehold = {
  serverAdmin: true,
  householdRole: null,
} as const

function ids(viewer: Viewer) {
  return visiblePages(viewer).map((page) => page.id)
}

function page(viewer: Viewer, id: SettingsPageId) {
  return visiblePages(viewer).find((each) => each.id === id)
}

function halves(viewer: Viewer, id: SettingsPageId) {
  return page(viewer, id)?.halves.map((half) => half.id)
}

test("a member sees their own pages, Household and Planning", () => {
  assert.deepEqual(ids(member), [
    "profile",
    "signIn",
    "apps",
    "household",
    "planning",
  ])
})

test("a household admin sees every page but Server, none with a server half", () => {
  assert.deepEqual(ids(householdAdmin), [
    "profile",
    "signIn",
    "apps",
    "household",
    "planning",
    "recipes",
    "ai",
    "shopping",
    "importExport",
  ])
  for (const each of visiblePages(householdAdmin)) {
    assert.equal(each.halves.length, 1, each.id)
  }
})

test("the server admin gets every page, and a switch on seven", () => {
  assert.equal(ids(runsServer).length, 10)
  const switched = visiblePages(runsServer).filter(
    (each) => each.halves.length === 2
  )
  assert.deepEqual(
    switched.map((each) => each.id),
    ["signIn", "apps", "household", "recipes", "ai", "shopping", "importExport"]
  )
})

test("a server admin who is a member opens admin pages on their server half", () => {
  assert.deepEqual(halves(serverAdminAsMember, "recipes"), ["server"])
  assert.equal(
    page(serverAdminAsMember, "recipes")?.to,
    "/settings/recipes/server"
  )
  assert.deepEqual(halves(serverAdminAsMember, "household"), [
    "household",
    "server",
  ])
})

test("with no household, only your own pages", () => {
  assert.deepEqual(ids(noHousehold), ["profile", "signIn", "apps"])
})

test("a server admin with no household keeps the server halves", () => {
  assert.deepEqual(ids(serverAdminNoHousehold), [
    "profile",
    "signIn",
    "apps",
    "household",
    "recipes",
    "ai",
    "shopping",
    "importExport",
    "server",
  ])
  assert.equal(
    page(serverAdminNoHousehold, "household")?.to,
    "/settings/household/server"
  )
})

test("a half you can't see sends you to one you can", () => {
  assert.equal(
    settingsRedirect("household", "server", member),
    "/settings/household"
  )
  assert.equal(settingsRedirect("ai", "household", member), "/settings")
  assert.equal(
    settingsRedirect("recipes", "household", serverAdminAsMember),
    "/settings/recipes/server"
  )
  assert.equal(settingsRedirect("ai", "server", runsServer), null)
})

test("the viewer is who you are in the household in use", () => {
  const households = [
    { id: "a", role: "owner" },
    { id: "b", role: "member" },
  ] as const
  assert.equal(
    viewerFrom({ serverAdmin: false, activeHouseholdId: "b", households })
      .householdRole,
    "member"
  )
  assert.equal(
    viewerFrom({ serverAdmin: false, activeHouseholdId: null, households })
      .householdRole,
    "owner"
  )
  assert.equal(
    viewerFrom({ serverAdmin: true, activeHouseholdId: null, households: [] })
      .householdRole,
    null
  )
})

test("the page is found from its address", () => {
  assert.equal(pageAt("/settings/ai/server"), "ai")
  assert.equal(pageAt("/settings/import-export"), "importExport")
  assert.equal(pageAt("/settings/household/server"), "household")
  assert.equal(pageAt("/settings/server"), "server")
  assert.equal(pageAt("/settings"), null)
})
