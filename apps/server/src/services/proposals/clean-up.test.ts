import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, test } from "vitest"
import {
  Chat,
  Household,
  Proposal,
  User,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { clearOldProposals } from "./clean-up.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

const now = new Date("2026-11-27T12:00:00Z")
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

test("suggestions resolved 30 days ago go, unless their chat still shows them", async () => {
  const em = database.em.fork()
  const household = em.create(Household, { name: "Home", slug: "home" })
  const user = em.create(User, { name: "Kyle", email: "kyle@example.com" })
  const chat = em.create(Chat, { household, user, title: "Dinner" })
  await em.flush()

  const make = (
    summary: string,
    status: Proposal["status"],
    resolvedDaysAgo: number | null,
    chatId: string | null
  ) =>
    em.create(Proposal, {
      household,
      kind: "meals",
      status,
      summary,
      before: {},
      after: {},
      chat: chatId,
      resolvedAt: resolvedDaysAgo === null ? null : daysAgo(resolvedDaysAgo),
    })
  make("no chat, applied 31 days ago", "applied", 31, null)
  make("no chat, dismissed 31 days ago", "dismissed", 31, null)
  make("chat exists, 31 days ago", "applied", 31, chat.id)
  make("chat deleted, 31 days ago", "dismissed", 31, randomUUID())
  make("not a chat's id, 31 days ago", "applied", 31, "deleted-chat")
  make("pending 60 days", "pending", null, null)
  make("pending in a chat that is gone", "pending", null, randomUUID())
  make("no chat, resolved 29 days ago", "applied", 29, null)
  await em.flush()

  expect(await clearOldProposals(database.em.fork(), now)).toBe(4)

  const left = await database.em
    .fork()
    .find(Proposal, {}, { filters: false, orderBy: { summary: "asc" } })
  expect(left.map((proposal) => proposal.summary)).toEqual([
    "chat exists, 31 days ago",
    "no chat, resolved 29 days ago",
    "pending 60 days",
    "pending in a chat that is gone",
  ])
})
