import type { SendPlan } from "./queries"

type Item = Pick<SendPlan["items"][number], "itemId" | "picked" | "sent">

export type StoreChoices = {
  rest: string | null
  order: string | null
  where: Record<string, string>
}

/** A completed send keeps its store; an explicit trip store wins over picks. */
export function storeForItem(
  item: Item,
  keys: readonly string[],
  choices: StoreChoices,
  rest: string | undefined
) {
  const sent = item.sent.find((key) => keys.includes(key))
  if (sent) return sent
  const said = choices.where[item.itemId]
  if (said === "out" || (said && keys.includes(said))) return said
  if (choices.order && keys.includes(choices.order)) return choices.order
  return item.picked.find((key) => keys.includes(key)) ?? rest
}
