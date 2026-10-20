import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  findFood,
  foodKey,
  foodName,
  foodsToChoose,
  guessAisle,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { MappingProductDialog } from "./mapping-product-dialog"
import { ProductSummary } from "./product-summary"
import { productMappingsQuery, type ProductMappings } from "./queries"
import { useHouseholdClock } from "@/features/plan/queries"

type Food = ProductMappings["foods"][number]
type Store = ProductMappings["stores"][number]

/** Products the household buys for foods, independent of the current list. */
export function ProductMappingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { today } = useHouseholdClock()
  const { data, isPending, isError, error, refetch } =
    useQuery(productMappingsQuery)
  const [search, setSearch] = React.useState("")
  const [store, setStore] = React.useState("all")
  const [missing, setMissing] = React.useState(false)
  const [picking, setPicking] = React.useState<{
    food: Food
    store: Store
  } | null>(null)
  const [forgetting, setForgetting] = React.useState<string | null>(null)

  const term = search.trim().toLocaleLowerCase()
  const stores = data?.stores ?? []
  const existing = data?.foods ?? []
  const byFood = new Map(existing.map((food) => [food.food, food]))
  const matchedFood = term ? findFood(search)?.key : null
  const matches = existing.filter((food) =>
    `${food.name} ${food.food}`.toLocaleLowerCase().includes(term)
  )
  const known =
    term.length > 0
      ? foodsToChoose()
          .filter((key) => !byFood.has(key))
          .filter(
            (key) =>
              key === matchedFood ||
              `${foodName(key)} ${key}`.toLocaleLowerCase().includes(term)
          )
          .slice(0, 20)
          .map((key) => ({
            food: key,
            name: foodName(key),
            aisle: null,
            products: [],
          }))
      : []
  const customKey = foodKey(search)
  const custom =
    term.length > 0 &&
    customKey &&
    !byFood.has(customKey) &&
    !known.some((food) => food.food === customKey)
      ? [{ food: customKey, name: search.trim(), aisle: null, products: [] }]
      : []
  const shownStores =
    store === "all" ? stores : stores.filter((one) => one.key === store)
  const needsProduct = (food: Food) =>
    shownStores.some(
      (one) =>
        !food.products.some(
          (mapping) => mapping.store === one.key && mapping.chosen
        )
    )
  const shown = [...matches, ...known, ...custom].filter((food) => {
    return !missing || needsProduct(food)
  })
  const aisles = data?.aisles ?? []
  const aisleByKey = new Map(
    aisles.flatMap((aisle) =>
      aisle.key ? [[aisle.key, aisle.id] as const] : []
    )
  )
  const aisleOf = (food: Food) =>
    food.aisle ??
    aisleByKey.get(guessAisle(food.food)) ??
    aisleByKey.get("other")
  const sections = aisles
    .map((aisle) => ({
      ...aisle,
      foods: shown.filter((food) => aisleOf(food) === aisle.id),
    }))
    .filter((aisle) => aisle.foods.length > 0)
  const unassigned = shown.filter(
    (food) => !aisles.some((aisle) => aisle.id === aisleOf(food))
  )
  if (unassigned.length > 0) {
    sections.push({
      id: "unassigned",
      key: null,
      name: t("stores.mappings.unassigned"),
      foods: unassigned,
    })
  }

  async function forget(food: Food, store: Store) {
    const key = `${food.food}:${store.key}`
    setForgetting(key)
    try {
      await unwrap(
        api.DELETE("/api/stores/products/{store}", {
          params: {
            path: { store: store.key as "kroger" | "walmart" },
            query: { food: food.food },
          },
        })
      )
      await queryClient.invalidateQueries({ queryKey: ["stores"] })
      await queryClient.invalidateQueries({ queryKey: ["list"] })
      toast.success(
        t("stores.mappings.forgotten", { food: food.name, store: store.name })
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setForgetting(null)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 self-start md:mt-4"
        render={<Link to="/list" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.list")}
      </Button>
      <PageHeader
        title={t("stores.mappings.title")}
        description={t("stores.mappings.description")}
      />
      {isError ? (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed p-6">
          <p role="alert" className="text-muted-foreground">
            {error instanceof ApiError
              ? error.message
              : t("status.error.description")}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("stores.basket.again")}
          </Button>
        </div>
      ) : stores.length === 0 && !isPending ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          {t("stores.mappings.noStores")}
        </p>
      ) : (
        <div className="grid gap-5 pb-12">
          <p className="text-sm text-muted-foreground">
            {t("stores.mappings.connectedOnly")}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-52 flex-1 gap-1">
              <label htmlFor="mapping-search" className="text-sm font-medium">
                {t("stores.mappings.search")}
              </label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="mapping-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder={t("stores.mappings.searchHint")}
                />
              </div>
            </div>
            {stores.length > 1 && (
              <div className="grid gap-1">
                <span className="text-sm font-medium">
                  {t("stores.mappings.store")}
                </span>
                <Select
                  value={store}
                  onValueChange={(value) => setStore(String(value))}
                >
                  <SelectTrigger
                    className="w-44"
                    aria-label={t("stores.mappings.store")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("stores.mappings.allStores")}
                    </SelectItem>
                    {stores.map((one) => (
                      <SelectItem key={one.key} value={one.key}>
                        {one.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch checked={missing} onCheckedChange={setMissing} />
              {t("stores.mappings.needsProduct")}
            </label>
          </div>
          {isPending ? (
            <div className="grid gap-3">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          ) : shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
              {existing.length === 0 && !term
                ? t("stores.mappings.empty")
                : t("stores.mappings.noMatches")}
            </p>
          ) : (
            <div className="grid gap-3">
              {sections.map((aisle) => (
                <Collapsible
                  key={`${aisle.id}:${Boolean(term)}`}
                  defaultOpen={Boolean(term)}
                  className="rounded-2xl border bg-card"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5">
                    <span className="min-w-0">
                      <span className="block font-semibold">{aisle.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {t("stores.mappings.aisleFoodCount", {
                          count: aisle.foods.length,
                        })}
                        {" · "}
                        {aisle.foods.some(needsProduct)
                          ? t("stores.mappings.aisleNeeds", {
                              count: aisle.foods.filter(needsProduct).length,
                            })
                          : t("stores.mappings.aisleReady")}
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-3 border-t p-3 sm:p-4">
                    {aisle.foods.map((food) => (
                      <Card key={food.food}>
                        <CardHeader>
                          <CardTitle>{food.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                          {shownStores.map((one) => {
                            const mapping = food.products.find(
                              (product) => product.store === one.key
                            )
                            return (
                              <div
                                key={one.key}
                                className="grid gap-3 rounded-xl border p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {one.name}
                                  </span>
                                  {mapping && (
                                    <Badge variant="secondary">
                                      {mapping.chosen
                                        ? t("stores.mappings.yourPick")
                                        : t("stores.mappings.suggestion")}
                                    </Badge>
                                  )}
                                </div>
                                {mapping ? (
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ProductSummary
                                      product={mapping.product}
                                      today={today}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {t("stores.mappings.none")}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setPicking({ food, store: one })
                                    }
                                  >
                                    {t(
                                      mapping
                                        ? "stores.mappings.change"
                                        : "stores.mappings.choose"
                                    )}
                                  </Button>
                                  {mapping && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={
                                        forgetting === `${food.food}:${one.key}`
                                      }
                                      onClick={() => void forget(food, one)}
                                    >
                                      {t("stores.mappings.forget")}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </CardContent>
                      </Card>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}
      <MappingProductDialog
        picking={picking}
        onClose={() => setPicking(null)}
      />
    </>
  )
}
