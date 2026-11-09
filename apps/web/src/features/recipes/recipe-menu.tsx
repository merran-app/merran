import {
  Calendar03Icon,
  CheckmarkSquare02Icon,
  CookingPotIcon,
  Delete02Icon,
  Edit02Icon,
  LinkSquare02Icon,
  Share08Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { householdQuery } from "@/features/household/queries"
import { PlanItDialog } from "@/features/plan/plan-it-dialog"
import { ShareDialog } from "@/features/sharing/share-dialog"

import { DeleteRecipesDialog, TagRecipesDialog } from "./bulk-dialogs"
import type { RecipeSummary } from "./queries"

type Showing = "plan" | "tags" | "share" | "delete" | null

/**
 * What a right click on a recipe card offers: the things done to one recipe
 * without opening it. Each is also on the recipe's page or in select mode.
 */
export function RecipeMenu({
  recipe,
  onSelect,
  children,
}: {
  recipe: RecipeSummary
  /** Starts selecting, with this recipe picked. */
  onSelect: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [showing, setShowing] = React.useState<Showing>(null)
  const { data: household } = useQuery(householdQuery)

  function closeWhenShut(open: boolean) {
    if (!open) setShowing(null)
  }

  return (
    <>
      <ContextMenu>
        {/* The card's grid cell now: min-w-0 lets it shrink to the column, as the card did. */}
        <ContextMenuTrigger className="min-w-0">{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            render={
              <Link
                to="/recipes/$slug"
                params={{ slug: recipe.slug }}
                target="_blank"
              />
            }
          >
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
            {t("recipes.menu.newTab")}
          </ContextMenuItem>
          <ContextMenuItem
            render={
              <Link to="/recipes/$slug/cook" params={{ slug: recipe.slug }} />
            }
          >
            <HugeiconsIcon icon={CookingPotIcon} strokeWidth={2} />
            {t("recipes.startCooking")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setShowing("plan")}>
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
            {t("plan.planIt")}
          </ContextMenuItem>
          <ContextMenuItem
            render={
              <Link to="/recipes/$slug/edit" params={{ slug: recipe.slug }} />
            }
          >
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
            {t("recipes.edit")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setShowing("tags")}>
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
            {t("recipes.bulk.tags")}
          </ContextMenuItem>
          {household?.recipeSharing && (
            <ContextMenuItem onClick={() => setShowing("share")}>
              <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
              {t("sharing.share")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onSelect}>
            <HugeiconsIcon icon={CheckmarkSquare02Icon} strokeWidth={2} />
            {t("select.start")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => setShowing("delete")}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("recipes.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Only the one asked for is there, so a long library doesn't hold a dialog per card. */}
      {showing === "plan" && (
        <PlanItDialog
          recipe={recipe}
          servings={null}
          withRecipe={null}
          open
          onOpenChange={closeWhenShut}
        />
      )}
      {showing === "tags" && (
        <TagRecipesDialog ids={[recipe.id]} open onOpenChange={closeWhenShut} />
      )}
      {showing === "share" && (
        <ShareDialog recipe={recipe} open onOpenChange={closeWhenShut} />
      )}
      {showing === "delete" && (
        <DeleteRecipesDialog
          recipes={[recipe]}
          open
          onOpenChange={closeWhenShut}
          onDeleted={() => setShowing(null)}
        />
      )}
    </>
  )
}
