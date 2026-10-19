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
const keyOf = (target: Target) =>
  `${target.recipe.recipeId}:${target.ingredientId}:${target.state}`

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
  const [choice, setChoice] = React.useState("")
  const active = groups.get(choice)?.[0] ?? groups.values().next().value?.[0]
  const selectedGroup = active ? (groups.get(keyOf(active)) ?? []) : []
  const [picks, setPicks] = React.useState<Record<string, boolean>>({})
  const [text, setText] = React.useState("")
  const [stepTexts, setStepTexts] = React.useState<Record<string, string>>({})
  const [saveLibrary, setSaveLibrary] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<Schemas["Swap"][]>([])
  const [busy, setBusy] = React.useState(false)
  const [finding, setFinding] = React.useState(false)
  const [error, setError] = React.useState("")
  const [note, setNote] = React.useState("")
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const steps = Object.entries(stepTexts)
    .filter(([, text]) => text.trim())
    .map(([stepId, text]) => ({ stepId, text: text.trim() }))
  const selected = selectedGroup.filter(
    (target) => picks[target.mealId] !== false
  )
  const preview =
    active && lines.length
      ? swapMealIngredient(active.recipe, active.ingredientId, lines, steps)
      : null
  const changedSteps =
    preview?.steps.filter(
      (step) =>
        step.text !==
        active?.recipe.steps.find((original) => original.id === step.id)?.text
    ) ?? []
  const refresh = () =>
    Promise.all(
      ["list", "plan", "recipes", "pantry", "stores"].map((area) =>
        client.invalidateQueries({ queryKey: [area] })
      )
    )
  async function suggest() {
    if (!active) return
    setFinding(true)
    setError("")
    try {
      const found = await unwrap(
        api.POST("/api/list/items/{itemId}/substitutions/suggest", {
          params: { path: { itemId: item.id } },
          body: {
            mealId: active.mealId,
            recipeId: active.recipe.recipeId,
            ingredientId: active.ingredientId,
            state: active.state,
          },
        })
      )
      setSuggestions(found.swaps)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("status.error.description")
      )
    } finally {
      setFinding(false)
    }
  }
  async function apply() {
    setBusy(true)
    setError("")
    try {
      const done = await unwrap(
        api.POST("/api/list/items/{itemId}/substitutions", {
          params: { path: { itemId: item.id } },
          body: {
            ingredientId: active?.ingredientId ?? "",
            lines,
            steps,
            targets: selected.map((target) => ({
              mealId: target.mealId,
              revision: target.revision,
            })),
            ...(active
              ? { recipeId: active.recipe.recipeId, state: active.state }
              : {}),
            saveToLibrary: saveLibrary,
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
  const allowed = Boolean(
    lines.length &&
    lines.length <= 5 &&
    (active ? selected.length : !item.meals.length && lines.length === 1)
  )
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
            {groups.size > 1 && (
              <label className="grid gap-1 text-sm font-medium">
                {t("shopping.swap.recipe")}
                <select
                  className="min-h-11 max-w-full min-w-0 rounded-xl border bg-background px-2"
                  value={active ? keyOf(active) : ""}
                  onChange={(event) => {
                    setChoice(event.target.value)
                    setText("")
                    setStepTexts({})
                    setSuggestions([])
                    setPicks({})
                    setSaveLibrary(false)
                    setNote("")
                  }}
                >
                  {[...groups].map(([key, targets]) => (
                    <option key={key} value={key}>
                      {targets[0]!.recipe.name} ·{" "}
                      {
                        targets[0]!.recipe.ingredients.find(
                          (line) => line.id === targets[0]!.ingredientId
                        )?.text
                      }
                    </option>
                  ))}
                </select>
              </label>
            )}
            {active ? (
              <>
                <div className="rounded-xl bg-muted p-3">
                  <p className="font-medium">{active.recipe.name}</p>
                  <p className="text-sm">
                    {t("shopping.swap.original", {
                      line: active.recipe.ingredients.find(
                        (line) => line.id === active.ingredientId
                      )?.text,
                    })}
                  </p>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 font-medium">
                    {t("shopping.swap.meals")}
                  </legend>
                  {selectedGroup.map((target) => (
                    <label
                      key={target.mealId}
                      className="flex min-w-0 items-start gap-2"
                    >
                      <Checkbox
                        checked={picks[target.mealId] !== false}
                        onCheckedChange={(checked) =>
                          setPicks((old) => ({
                            ...old,
                            [target.mealId]: checked === true,
                          }))
                        }
                      />
                      <span className="min-w-0 text-sm">
                        {target.mealName} ·{" "}
                        {formatDay(target.date, i18n.language)}
                        {target.anyDay ? ` · ${t("plan.pool")}` : ""}
                      </span>
                    </label>
                  ))}
                </fieldset>
                {ai.ready ? (
                  <Button
                    variant="outline"
                    disabled={finding || busy}
                    onClick={() => void suggest()}
                  >
                    {t(
                      finding
                        ? "shopping.swap.finding"
                        : "shopping.swap.suggest"
                    )}
                  </Button>
                ) : ai.why ? (
                  <NeedsAi task="swaps" why={ai.why} onNavigate={onClose} />
                ) : null}
                {suggestions.map((swap, index) => (
                  <button
                    key={index}
                    type="button"
                    disabled={busy}
                    className="grid gap-1 rounded-xl border p-3 text-left hover:bg-muted"
                    onClick={() => {
                      setText(swap.lines.join("\n"))
                      setStepTexts(
                        Object.fromEntries(
                          swap.steps.map((step) => [step.stepId, step.text])
                        )
                      )
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  item.meals.length
                    ? "shopping.swap.noActiveMeals"
                    : "shopping.swap.manualItem"
                )}
              </p>
            )}
            <label className="grid gap-1 text-sm font-medium">
              {t(
                active
                  ? "shopping.swap.replacement"
                  : "shopping.swap.replacementItem"
              )}
              <Textarea
                value={text}
                maxLength={2500}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("shopping.swap.placeholder")}
              />
            </label>
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
            {active && (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer font-medium">
                  {t("shopping.swap.editSteps")}
                </summary>
                <div className="mt-3 grid gap-3">
                  {active.recipe.steps.map((step, index) => (
                    <label key={step.id} className="grid gap-1 text-sm">
                      <span>
                        {index + 1}. {step.text}
                      </span>
                      <Textarea
                        disabled={busy}
                        maxLength={5000}
                        value={stepTexts[step.id] ?? ""}
                        placeholder={t("shopping.swap.keepStep")}
                        onChange={(event) =>
                          setStepTexts((old) => ({
                            ...old,
                            [step.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
            )}
            {preview && (
              <section className="grid gap-2 rounded-xl border p-3">
                <h3 className="font-semibold">{t("shopping.swap.preview")}</h3>
                {selected.map((target) => (
                  <div key={target.mealId} className="text-sm">
                    <p className="font-medium">
                      {target.mealName} ·{" "}
                      {formatDay(target.date, i18n.language)}
                    </p>
                    {lines.map((line, index) => (
                      <p key={index}>{scaleIngredient(line, target.factor)}</p>
                    ))}
                  </div>
                ))}
                {changedSteps.map((step) => (
                  <p key={step.id} className="text-sm text-muted-foreground">
                    {step.text}
                  </p>
                ))}
                <p className="text-sm text-muted-foreground">
                  {t("shopping.swap.listHint")}
                </p>
              </section>
            )}
            {active && selected.every((target) => target.canSaveToLibrary) && (
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
            <Button
              disabled={busy || finding || !allowed}
              onClick={() => void apply()}
            >
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
