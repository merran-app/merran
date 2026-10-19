import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { scaleIngredient, swapMealIngredient } from "@merran/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { NeedsAi, useAiFor } from "@/features/ai/needs-ai"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { formatDay } from "@/features/plan/format"
import type { ListItem } from "../queries"
import { ShoppingSheet } from "./shopping-sheet"

type Target = Schemas["ShoppingSwapTargets"]["targets"][number]
const keyOf = (target: {
  recipe: { recipeId: string }
  ingredientId: string
  state: string
}) =>
  JSON.stringify([target.recipe.recipeId, target.ingredientId, target.state])
type Draft = { text: string; stepTexts: Record<string, string> }
const linesOf = (draft?: Draft) =>
  (draft?.text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
const stepsOf = (draft?: Draft) =>
  Object.entries(draft?.stepTexts ?? {})
    .filter(([, text]) => text.trim())
    .map(([stepId, text]) => ({ stepId, text: text.trim() }))

export function ShoppingSwapDialog({
  item,
  onClose,
}: {
  item: ListItem
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const ai = useAiFor("swaps")
  const contexts = useQuery({
    queryKey: ["list", "substitutions", item.id],
    queryFn: () =>
      unwrap(
        api.GET("/api/list/items/{itemId}/substitutions", {
          params: { path: { itemId: item.id } },
        })
      ),
  })
  const groups = new Map<string, Target[]>()
  for (const target of contexts.data?.targets ?? [])
    groups.set(keyOf(target), [...(groups.get(keyOf(target)) ?? []), target])
  const active = groups.values().next().value?.[0]
  const signature = JSON.stringify([...groups.keys()])
  // Query deduplication also prevents duplicate searches when React remounts effects.
  const ideas = useQuery({
    queryKey: ["shopping-suggestions", item.id, signature],
    enabled: Boolean(
      ai.ready && active && !contexts.isFetching && !contexts.isError
    ),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      unwrap(
        api.POST("/api/list/items/{itemId}/substitutions/suggest", {
          params: { path: { itemId: item.id } },
          body: {
            mealId: active!.mealId,
            recipeId: active!.recipe.recipeId,
            ingredientId: active!.ingredientId,
            state: active!.state,
            allRecipes: true,
          },
        })
      ),
  })
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [manual, setManual] = React.useState("")
  const [picks, setPicks] = React.useState<Record<string, boolean>>({})
  const [saveLibrary, setSaveLibrary] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [note, setNote] = React.useState("")
  const targetKey = (target: Target) =>
    JSON.stringify([target.mealId, keyOf(target)])
  const selected = (contexts.data?.targets ?? []).filter(
    (target) => picks[targetKey(target)] !== false
  )
  const patchDraft = (key: string, changes: Partial<Draft>) =>
    setDrafts((old) => ({
      ...old,
      [key]: { text: "", stepTexts: {}, ...old[key], ...changes },
    }))
  const lines = manual
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const allowed =
    !contexts.isPending &&
    !contexts.isError &&
    (active
      ? selected.length > 0 &&
        selected.every((target) => {
          const lines = linesOf(drafts[keyOf(target)])
          return lines.length > 0 && lines.length <= 5
        })
      : !item.meals.length && lines.length === 1)
  const refresh = () =>
    Promise.all(
      ["list", "plan", "recipes", "pantry", "stores"].map((area) =>
        client.invalidateQueries({ queryKey: [area] })
      )
    )
  async function apply() {
    setBusy(true)
    setError("")
    try {
      const done = await unwrap(
        api.POST("/api/list/items/{itemId}/substitutions", {
          params: { path: { itemId: item.id } },
          body: {
            ingredientId: active?.ingredientId ?? "",
            lines: active
              ? linesOf(drafts[keyOf(selected[0] ?? active)])
              : lines,
            targets: selected.map((target) => ({
              mealId: target.mealId,
              revision: target.revision,
              replacement: {
                recipeId: target.recipe.recipeId,
                ingredientId: target.ingredientId,
                state: target.state,
                lines: linesOf(drafts[keyOf(target)]),
                steps: stepsOf(drafts[keyOf(target)]),
              },
            })),
            saveToLibrary: saveLibrary && groups.size === 1,
          },
        })
      )
      await refresh()
      toast.success(t("shopping.swap.applied"), {
        duration: 15000,
        action: {
          label: t("list.undo"),
          onClick: async () => {
            try {
              await unwrap(
                api.POST("/api/list/substitutions/undo", { body: done.undo })
              )
              await refresh()
              toast.success(t("shopping.swap.undone"))
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("status.error.description")
              )
            }
          },
        },
      })
      onClose()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("status.error.description")
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <ShoppingSheet
      title={t("shopping.swap.title", { name: item.name })}
      description={t("shopping.swap.hint")}
      onClose={onClose}
      busy={busy}
    >
      <div className="grid min-w-0 gap-4">
        {contexts.isPending ? (
          <Skeleton className="h-32" />
        ) : contexts.isError ? (
          <div role="alert">
            <p>{t("shopping.swap.contextFailed")}</p>
            <Button variant="outline" onClick={() => void contexts.refetch()}>
              {t("stores.basket.again")}
            </Button>
          </div>
        ) : (
          <>
            {active ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("shopping.swap.allRecipes")}
                </p>
                {ai.ready ? (
                  <>
                    {ideas.isFetching ? (
                      <p role="status">{t("shopping.swap.finding")}</p>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void ideas.refetch()}
                      >
                        {t("shopping.swap.suggest")}
                      </Button>
                    )}
                    {ideas.isError && (
                      <p role="alert" className="text-sm text-destructive">
                        {ideas.error.message}
                      </p>
                    )}
                    {ideas.data?.swaps.map((swap, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={busy}
                        className="grid gap-1 rounded-xl border p-3 text-left hover:bg-muted"
                        onClick={() => {
                          const next: Record<string, Draft> = {}
                          for (const replacement of swap.replacements ?? []) {
                            const key = JSON.stringify([
                              replacement.recipeId,
                              replacement.ingredientId,
                              replacement.state,
                            ])
                            next[key] = {
                              text: replacement.lines.join("\n"),
                              stepTexts: Object.fromEntries(
                                (replacement.steps ?? []).map((step) => [
                                  step.stepId,
                                  step.text,
                                ])
                              ),
                            }
                          }
                          setDrafts(next)
                          setNote(swap.note)
                        }}
                      >
                        <span className="font-medium">
                          {swap.lines.join(" + ")}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {swap.note}
                        </span>
                      </button>
                    ))}
                    {ideas.isSuccess && !ideas.data.swaps.length && (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        {t("shopping.swap.noIdeas")}
                      </p>
                    )}
                  </>
                ) : ai.why ? (
                  <NeedsAi task="swaps" why={ai.why} onNavigate={onClose} />
                ) : null}
                {note && (
                  <p className="text-sm text-muted-foreground">{note}</p>
                )}
                {[...groups].map(([key, targets]) => {
                  const target = targets[0]!
                  const draft = drafts[key]
                  const lines = linesOf(draft)
                  const preview = lines.length
                    ? swapMealIngredient(
                        target.recipe,
                        target.ingredientId,
                        lines,
                        stepsOf(draft)
                      )
                    : null
                  const changedSteps =
                    preview?.steps.filter(
                      (step) =>
                        step.text !==
                        target.recipe.steps.find(
                          (original) => original.id === step.id
                        )?.text
                    ) ?? []
                  return (
                    <section
                      key={key}
                      className="grid min-w-0 gap-3 rounded-xl border p-3"
                    >
                      <div>
                        <h3 className="font-semibold">{target.recipe.name}</h3>
                        <p className="text-sm">
                          {t("shopping.swap.original", {
                            line: target.recipe.ingredients.find(
                              (line) => line.id === target.ingredientId
                            )?.text,
                          })}
                        </p>
                      </div>
                      <fieldset className="grid gap-2">
                        <legend className="mb-2 text-sm font-medium">
                          {t("shopping.swap.meals")}
                        </legend>
                        {targets.map((target) => (
                          <label
                            key={targetKey(target)}
                            className="flex min-w-0 items-start gap-2"
                          >
                            <Checkbox
                              checked={picks[targetKey(target)] !== false}
                              disabled={busy}
                              onCheckedChange={(checked) =>
                                setPicks((old) => ({
                                  ...old,
                                  [targetKey(target)]: checked === true,
                                }))
                              }
                            />
                            <span className="min-w-0 text-sm">
                              {target.mealName} ·{" "}
                              {formatDay(target.date, i18n.language)}
                              {target.anyDay ? " · " + t("plan.pool") : ""}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <label className="grid gap-1 text-sm font-medium">
                        {t("shopping.swap.replacement")}
                        <Textarea
                          value={draft?.text ?? ""}
                          maxLength={2500}
                          disabled={busy}
                          onChange={(event) =>
                            patchDraft(key, { text: event.target.value })
                          }
                          placeholder={t("shopping.swap.placeholder")}
                        />
                      </label>
                      <details className="rounded-xl border p-3">
                        <summary className="cursor-pointer font-medium">
                          {t("shopping.swap.editSteps")}
                        </summary>
                        <div className="mt-3 grid gap-3">
                          {target.recipe.steps.map((step, index) => (
                            <label key={step.id} className="grid gap-1 text-sm">
                              <span>
                                {index + 1}. {step.text}
                              </span>
                              <Textarea
                                disabled={busy}
                                maxLength={5000}
                                value={draft?.stepTexts[step.id] ?? ""}
                                placeholder={t("shopping.swap.keepStep")}
                                onChange={(event) =>
                                  patchDraft(key, {
                                    stepTexts: {
                                      ...draft?.stepTexts,
                                      [step.id]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                      {preview && (
                        <div className="grid gap-2">
                          <h4 className="font-medium">
                            {t("shopping.swap.preview")}
                          </h4>
                          {targets
                            .filter(
                              (target) => picks[targetKey(target)] !== false
                            )
                            .map((target) => (
                              <div key={targetKey(target)} className="text-sm">
                                <p className="font-medium">
                                  {target.mealName} ·{" "}
                                  {formatDay(target.date, i18n.language)}
                                </p>
                                {lines.map((line, index) => (
                                  <p key={index}>
                                    {scaleIngredient(line, target.factor)}
                                  </p>
                                ))}
                              </div>
                            ))}
                          {changedSteps.map((step) => (
                            <p
                              key={step.id}
                              className="text-sm text-muted-foreground"
                            >
                              {step.text}
                            </p>
                          ))}
                        </div>
                      )}
                    </section>
                  )
                })}
                <p className="text-sm text-muted-foreground">
                  {t("shopping.swap.listHint")}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t(
                    item.meals.length
                      ? "shopping.swap.noActiveMeals"
                      : "shopping.swap.manualItem"
                  )}
                </p>
                <label className="grid gap-1 text-sm font-medium">
                  {t("shopping.swap.replacementItem")}
                  <Textarea
                    value={manual}
                    maxLength={500}
                    disabled={busy}
                    onChange={(event) => setManual(event.target.value)}
                    placeholder={t("shopping.swap.placeholder")}
                  />
                </label>
              </>
            )}
            {groups.size === 1 &&
              selected.length > 0 &&
              selected.every((target) => target.canSaveToLibrary) && (
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={saveLibrary}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setSaveLibrary(checked === true)
                    }
                  />
                  <span className="text-sm">
                    {t("shopping.swap.saveLibrary")}
                  </span>
                </label>
              )}
            <p className="text-sm text-muted-foreground">
              {t(
                saveLibrary
                  ? "shopping.swap.libraryHint"
                  : "shopping.swap.mealHint"
              )}
            </p>
            <Button disabled={busy || !allowed} onClick={() => void apply()}>
              {t(busy ? "shopping.swap.saving" : "shopping.swap.apply")}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </ShoppingSheet>
  )
}
