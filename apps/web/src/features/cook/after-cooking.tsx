import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Toggle } from "@/components/ui/toggle"
import { CookNoteForm } from "@/features/recipes/cook-notes"
import { recipeQuery } from "@/features/recipes/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

/**
 * The recipe cooked: enough to rate it. Without its rating (a meal on the
 * plan doesn't have it), it's looked up by its address.
 */
export type CookedRecipe = {
  id: string
  name: string
  slug: string
  rating?: number | null
}

/** A cooked meal to ask about, and its recipe. */
export type AfterCooking = { meal: string | null; recipe: CookedRecipe }

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/** A chip, filled in while it's ticked. */
const CHIP =
  "rounded-full px-4 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"

const ranOutQuery = (meal: string) => ({
  queryKey: ["pantry", "ran-out", meal],
  queryFn: () =>
    unwrap(api.GET("/api/pantry/ran-out", { params: { query: { meal } } })),
})

/**
 * After cooking, two steps: first "Ran out of anything?", saved as soon
 * as it's answered, then "How did it go?". A meal with no foods to show
 * starts at the second.
 */
export function AfterCookingDialog({
  asking,
  onDone,
}: {
  asking: AfterCooking | null
  /** Both steps answered or skipped, or closed. */
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [rated, setRated] = React.useState(false)
  // Each time it opens, it starts at the first step.
  React.useEffect(() => {
    if (asking) setRated(false)
  }, [asking])
  const meal = asking?.meal ?? null
  const foods = useQuery({
    ...ranOutQuery(meal ?? ""),
    enabled: asking !== null && meal !== null,
    staleTime: Infinity,
  })
  const known = asking?.recipe.rating !== undefined
  const full = useQuery({
    ...recipeQuery(asking?.recipe.slug ?? ""),
    enabled: asking !== null && !known,
  })
  const rating = known
    ? (asking?.recipe.rating ?? null)
    : (full.data?.rating ?? null)
  const nothingToAsk =
    meal === null || foods.isError || foods.data?.foods.length === 0
  const step = rated || nothingToAsk ? "notes" : "ranOut"

  return (
    <Dialog open={asking !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="sm:max-w-md">
        {asking && step === "ranOut" && (
          <RanOutStep
            meal={meal!}
            recipe={asking.recipe}
            foods={foods.data?.foods ?? null}
            onNext={() => setRated(true)}
          />
        )}
        {asking && step === "notes" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("recipes.cookNotes.ask")}</DialogTitle>
              <DialogDescription>
                {t("recipes.cookNotes.askDescription", {
                  name: asking.recipe.name,
                })}
              </DialogDescription>
            </DialogHeader>
            {(known || !full.isPending) && (
              <CookNoteForm
                recipe={{ ...asking.recipe, rating }}
                onDone={onDone}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** "Ran out of anything?": the meal's foods as chips, and whether to list them. */
function RanOutStep({
  meal,
  recipe,
  foods,
  onNext,
}: {
  meal: string
  recipe: CookedRecipe
  foods: Schemas["RanOutFoods"]["foods"] | null
  onNext: () => void
}) {
  const { t } = useTranslation()
  const ranOut = useRanOut()
  const [picked, setPicked] = React.useState<string[]>([])
  const [toList, setToList] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const switchId = React.useId()

  function toggle(food: string, pressed: boolean) {
    setPicked((now) =>
      pressed ? [...now, food] : now.filter((each) => each !== food)
    )
  }

  async function next() {
    setSaving(true)
    const saved = await ranOut(meal, picked, toList, foods ?? [])
    setSaving(false)
    if (saved) onNext()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("cook.ranOut.title")}</DialogTitle>
        <DialogDescription>{t("cook.ranOut.description")}</DialogDescription>
      </DialogHeader>
      {foods === null ? (
        <Skeleton className="h-20 rounded-2xl" />
      ) : (
        <div
          role="group"
          aria-label={t("cook.ranOut.foods", { name: recipe.name })}
          className="flex flex-wrap gap-2"
        >
          {foods.map((food) => (
            <Toggle
              key={food.food}
              variant="outline"
              className={CHIP}
              pressed={picked.includes(food.food)}
              onPressedChange={(pressed) => toggle(food.food, pressed)}
            >
              {food.name}
            </Toggle>
          ))}
        </div>
      )}
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel id={`${switchId}-label`} htmlFor={switchId}>
            {t("cook.ranOut.toList")}
          </FieldLabel>
        </FieldContent>
        <Switch
          id={switchId}
          aria-labelledby={`${switchId}-label`}
          checked={toList}
          onCheckedChange={setToList}
        />
      </Field>
      <DialogFooter>
        <Button variant="ghost" onClick={onNext}>
          {t("cook.ranOut.nothing")}
        </Button>
        <Button
          disabled={picked.length === 0 || saving}
          onClick={() => void next()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {t("cook.ranOut.next")}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Says what ran out: used up at home and, if asked, put on the list. The
 * message offers Undo, which puts the pantry back and takes the lines off
 * the list. Says whether it was saved.
 */
function useRanOut() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pantry"] }),
      queryClient.invalidateQueries({ queryKey: ["list"] }),
    ])

  async function undo(done: Schemas["RanOutResult"]) {
    try {
      if (done.usedUp.length > 0) {
        await unwrap(
          api.POST("/api/pantry/restore", { body: { items: done.usedUp } })
        )
      }
      if (done.listed.length > 0) {
        await unwrap(
          api.POST("/api/list/restore", {
            body: { items: [], remove: done.listed.map((item) => item.id) },
          })
        )
      }
      await refresh()
      toast.success(t("cook.ranOut.undone"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    }
  }

  return async (
    meal: string,
    foods: string[],
    list: boolean,
    known: Schemas["RanOutFoods"]["foods"]
  ) => {
    try {
      const done = await unwrap(
        api.POST("/api/pantry/ran-out", { body: { meal, foods, list } })
      )
      await refresh()
      const names = new Intl.ListFormat(i18n.language, {
        type: "conjunction",
      }).format(
        known
          .filter((food) => foods.includes(food.food))
          .map((food) => food.name)
      )
      toast.success(
        list
          ? t("cook.ranOut.usedUpListed", { foods: names })
          : t("cook.ranOut.usedUp", { foods: names }),
        {
          duration: UNDO_MS,
          action: {
            label: t("cook.ranOut.undo"),
            onClick: () => void undo(done),
          },
        }
      )
      return true
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
      return false
    }
  }
}
