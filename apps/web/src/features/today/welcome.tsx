import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useActiveHousehold } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"
import { AddRecipeDialog } from "@/features/recipes/add-recipe-dialog"

/** First-recipe actions stay useful even when the checklist is hidden. */
export function Welcome() {
  const { t } = useTranslation()
  const household = useActiveHousehold()
  return (
    <div className="flex flex-wrap gap-2">
      <AddRecipeDialog
        trigger={<Button>{t("today.welcome.addRecipe")}</Button>}
      />
      <Button variant="outline" render={<Link to="/recipes/new" />}>
        {t("today.welcome.writeOne")}
      </Button>
      {isAdminRole(household?.role) && (
        <Button
          variant="outline"
          render={<Link to="/settings/import-export" />}
        >
          {t("today.welcome.import")}
        </Button>
      )}
    </div>
  )
}
