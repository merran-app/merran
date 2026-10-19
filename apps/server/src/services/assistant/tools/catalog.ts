import type { ToolSet } from "ai"
import type { ApiAccess, ApiArea } from "../../auth/api-keys.ts"
import type { ToolContext } from "./context.ts"
import { searchRecipesTool } from "./search-recipes.ts"
import { getRecipeTool } from "./get-recipe.ts"
import { listTagsTool } from "./list-tags.ts"
import { getMealPlanTool } from "./get-meal-plan.ts"
import { getShoppingListTool } from "./get-shopping-list.ts"
import { getPantryTool } from "./get-pantry.ts"
import { getHouseholdTastesTool } from "./get-household-tastes.ts"
import { proposeRecipeEditTool } from "./propose-recipe-edit.ts"
import { proposeNewRecipeTool } from "./propose-new-recipe.ts"
import { proposeMealsTool } from "./propose-meals.ts"
import { proposeListItemsTool } from "./propose-list-items.ts"

type Definition = {
  create: (context: ToolContext) => ToolSet[string]
  permissions: readonly (readonly [ApiArea, ApiAccess])[]
  readOnly: boolean
}

/** Tools that need neither a chat nor a Merran AI provider, shared with MCP. */
export const SHARED_TOOLS = {
  get_household_tastes: {
    create: getHouseholdTastesTool,
    permissions: [["plan", "read"]],
    readOnly: true,
  },
  search_recipes: {
    create: searchRecipesTool,
    permissions: [["recipes", "read"]],
    readOnly: true,
  },
  get_recipe: {
    create: getRecipeTool,
    permissions: [["recipes", "read"]],
    readOnly: true,
  },
  list_tags: {
    create: listTagsTool,
    permissions: [["recipes", "read"]],
    readOnly: true,
  },
  get_meal_plan: {
    create: getMealPlanTool,
    permissions: [["plan", "read"]],
    readOnly: true,
  },
  get_shopping_list: {
    create: getShoppingListTool,
    permissions: [["list", "read"]],
    readOnly: true,
  },
  get_pantry: {
    create: getPantryTool,
    permissions: [["pantry", "read"]],
    readOnly: true,
  },
  propose_recipe_edit: {
    create: proposeRecipeEditTool,
    permissions: [["recipes", "write"]],
    readOnly: false,
  },
  propose_new_recipe: {
    create: proposeNewRecipeTool,
    permissions: [["recipes", "write"]],
    readOnly: false,
  },
  propose_meals: {
    create: proposeMealsTool,
    permissions: [
      ["plan", "write"],
      ["recipes", "read"],
    ],
    readOnly: false,
  },
  propose_list_items: {
    create: proposeListItemsTool,
    permissions: [["list", "write"]],
    readOnly: false,
  },
} satisfies Record<string, Definition>

export function sharedTools(context: ToolContext): ToolSet {
  return Object.fromEntries(
    Object.entries(SHARED_TOOLS).map(([name, definition]) => [
      name,
      definition.create(context),
    ])
  )
}
