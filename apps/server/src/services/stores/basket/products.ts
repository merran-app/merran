import type { BasketDeps } from "./types.ts"
import type { StoreProduct as Product } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { generateText, Output } from "ai"
import { z } from "zod"
import { useAi } from "../../ai/run.ts"
import { resolveTask } from "../../ai/status.ts"

const PICK_SYSTEM = `You pick grocery products for a household's shopping list at their store. For each thing on the list you're given numbered products from the store's search.

- Pick the plain everyday product a home cook means: not a ready meal, a snack version or a flavoured variety unless the list says so.
- A sensible size for the amount, in stock first, then on sale, then the store's own brand.
- null when none of them is the thing.`

const Picks = z.object({
  picks: z.array(z.object({ item: z.number(), choice: z.number().nullable() })),
})

const money = (cents: number | null) =>
  cents === null ? "no price" : `$${(cents / 100).toFixed(2)}`

/**
 * The likeliest product for each thing: the small model's pick when the
 * household has AI, else the first in stock.
 */
export async function choose(
  deps: BasketDeps,
  em: EntityManager,
  who: { householdId: string; userId: string | null },
  asks: { text: string; products: Product[] }[]
): Promise<(Product | null)[]> {
  const first = (products: Product[]) =>
    products.find((product) => product.inStock) ?? products[0] ?? null
  const ai = await resolveTask(deps, em, who.householdId, "shopping")
  if (!ai.ok) return asks.map((ask) => first(ask.products))
  try {
    const listed = asks.map((ask, i) =>
      [
        `${i + 1}. ${ask.text}`,
        ...ask.products.map((product, n) =>
          [
            `   ${n + 1}) ${product.name}`,
            product.size,
            product.salePrice !== null
              ? `on sale ${money(product.salePrice)} (usually ${money(product.price)})`
              : money(product.price),
            product.inStock ? null : "out of stock",
          ]
            .filter(Boolean)
            .join(", ")
        ),
      ].join("\n")
    )
    const { output } = await useAi(
      deps,
      em,
      { ...who, task: "shopping", needs: ["structured"] },
      (model) =>
        generateText({
          model,
          system: PICK_SYSTEM,
          prompt: listed.join("\n\n"),
          output: Output.object({ schema: Picks, name: "product_picks" }),
          maxOutputTokens: 2000,
        })
    )
    const picked = new Map(output.picks.map((pick) => [pick.item, pick.choice]))
    return asks.map((ask, i) => {
      if (!picked.has(i + 1)) return first(ask.products)
      const choice = picked.get(i + 1)
      return choice ? (ask.products[choice - 1] ?? null) : null
    })
  } catch {
    return asks.map((ask) => first(ask.products))
  }
}
