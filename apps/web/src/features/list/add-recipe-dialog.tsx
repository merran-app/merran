import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useHouseholdClock } from "@/features/plan/queries"
import { RecipePicker } from "@/features/recipes/recipe-picker"
import type { RecipeSummary } from "@/features/recipes/queries"

import { useAddRecipeToList } from "./use-add-recipe"

/**
 * One recipe onto the list from the List, without planning a day for it:
 * picked, then its servings, since a holiday often means making more.
 * A drawer on phones, as the app's dialogs are.
 */
export function AddRecipeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const clock = useHouseholdClock()
  const listing = useAddRecipeToList()
  const [picked, setPicked] = React.useState<RecipeSummary | null>(null)
  // Empty means the recipe's own, as when changing a planned meal.
  const [servings, setServings] = React.useState("")

  function reset() {
    setPicked(null)
    setServings("")
  }

  function changeOpen(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function add() {
    if (!picked) return
    const wanted = servings.trim() ? Number(servings) : null
    const added = await listing.add({
      recipe: picked,
      servings: wanted === picked.servings ? null : wanted,
    })
    if (added) changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("list.recipe.title")}</DialogTitle>
          <DialogDescription>{t("list.recipe.description")}</DialogDescription>
        </DialogHeader>
        {picked ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel>{t("list.recipe.picked")}</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {picked.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                  >
                    {t("list.recipe.change")}
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="list-recipe-servings">
                  {t("plan.servings")}
                </FieldLabel>
                <Input
                  id="list-recipe-servings"
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  step="any"
                  placeholder={
                    picked.servings == null
                      ? undefined
                      : String(picked.servings)
                  }
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                />
                {picked.servings != null && (
                  <FieldDescription>
                    {t("plan.servingsHint", { count: picked.servings })}
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={listing.busy}>
                {listing.busy && <Spinner data-icon="inline-start" />}
                {t("recipes.addToList")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <RecipePicker
            planDate={clock.today}
            label={t("list.recipe.search")}
            onPick={setPicked}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
