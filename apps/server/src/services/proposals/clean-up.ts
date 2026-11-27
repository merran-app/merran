import type { EntityManager } from "@mikro-orm/sql"
import { Chat, Proposal } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { isChatId } from "../assistant/chats.ts"

/** How long a suggestion stays after it was applied or dismissed. */
export const KEEP_PROPOSALS_DAYS = 30

/**
 * For the daily clean-up: clears suggestions applied or dismissed a month
 * ago. One from the assistant is shown in its chat, which asks for it again
 * each time it's opened, so it stays while that chat does. Pending ones
 * always stay. Returns how many went.
 */
export async function clearOldProposals(
  em: EntityManager,
  now: Date = new Date()
): Promise<number> {
  const before = new Date(
    now.getTime() - KEEP_PROPOSALS_DAYS * 24 * 60 * 60 * 1000
  )
  const resolved = {
    status: { $in: ["applied", "dismissed"] as Proposal["status"][] },
    resolvedAt: { $lt: before },
  }

  let removed = await em.nativeDelete(
    Proposal,
    { ...resolved, chat: null },
    ACROSS_HOUSEHOLDS
  )

  const fromChats = await em.find(
    Proposal,
    { ...resolved, chat: { $ne: null } },
    { fields: ["id", "chat"], ...ACROSS_HOUSEHOLDS }
  )
  // A chat column that isn't a chat's id names no chat, so its proposal
  // goes like one whose chat was deleted.
  const chatIds = [
    ...new Set(fromChats.map((proposal) => proposal.chat!)),
  ].filter(isChatId)
  const chats =
    chatIds.length > 0
      ? await em.find(
          Chat,
          { id: { $in: chatIds } },
          { fields: ["id"], ...ACROSS_HOUSEHOLDS }
        )
      : []
  const existing = new Set(chats.map((chat) => chat.id))
  const orphaned = fromChats
    .filter((proposal) => !existing.has(proposal.chat!))
    .map((proposal) => proposal.id)
  if (orphaned.length > 0) {
    removed += await em.nativeDelete(
      Proposal,
      { id: { $in: orphaned } },
      ACROSS_HOUSEHOLDS
    )
  }
  return removed
}
