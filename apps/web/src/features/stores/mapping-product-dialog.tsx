import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useHouseholdClock } from "@/features/plan/queries"
import { useIsMobile } from "@/hooks/use-mobile"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { ProductSummary } from "./product-summary"
import type { ProductMappings, StoreProduct } from "./queries"
import { useWalmartPicker } from "./walmart-picker"
import { ExtensionError } from "@/features/extension/bridge"

type Food = ProductMappings["foods"][number]
type Store = ProductMappings["stores"][number]

/** Find and save a product for a food without adding a shopping-list item. */
export function MappingProductDialog({
  picking,
  onClose,
}: {
  picking: { food: Food; store: Store } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const phone = useIsMobile()
  const { today } = useHouseholdClock()
  const walmart = useWalmartPicker()
  const [term, setTerm] = React.useState("")
  const [products, setProducts] = React.useState<StoreProduct[] | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const request = React.useRef(0)

  async function search(words: string) {
    const query = words.trim()
    if (query.length < 2 || !picking) return
    const id = ++request.current
    setBusy("search")
    setMessage(null)
    setProducts(null)
    try {
      const found =
        picking.store.key === "walmart"
          ? await walmart.search(query)
          : (
              await unwrap(
                api.GET("/api/stores/kroger/search", {
                  params: { query: { q: query } },
                })
              )
            ).products
      if (id === request.current && found) setProducts(found)
    } catch (error) {
      if (!(error instanceof ApiError || error instanceof ExtensionError)) {
        throw error
      }
      if (id === request.current) setMessage(error.message)
    } finally {
      if (id === request.current) setBusy(null)
    }
  }

  React.useEffect(() => {
    request.current++
    if (!picking) return
    setTerm(picking.food.name)
    setProducts(null)
    setMessage(null)
    void search(picking.food.name)
    return () => {
      request.current++
    }
  }, [picking?.food.food, picking?.store.key])

  async function save(product: StoreProduct) {
    if (!picking) return
    setBusy(product.id)
    try {
      const body =
        picking.store.key === "walmart"
          ? {
              food: picking.food.food,
              product: product as Schemas["WalmartProduct"],
            }
          : { food: picking.food.food, productId: product.id }
      await unwrap(
        api.PUT("/api/stores/products/{store}", {
          params: {
            path: { store: picking.store.key as "kroger" | "walmart" },
          },
          body,
        })
      )
      await queryClient.invalidateQueries({ queryKey: ["stores"] })
      await queryClient.invalidateQueries({ queryKey: ["list"] })
      toast.success(
        t("stores.mappings.saved", {
          food: picking.food.name,
          store: picking.store.name,
        })
      )
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError || error instanceof ExtensionError)) {
        throw error
      }
      toast.error(error.message)
    } finally {
      setBusy(null)
    }
  }

  const Title = phone ? DrawerTitle : DialogTitle
  const Description = phone ? DrawerDescription : DialogDescription
  const content = (
    <>
      <div
        className={cn("flex shrink-0 items-start gap-3", phone && "px-4 pt-3")}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Title>
            {t("stores.mappings.pickTitle", {
              food: picking?.food.name,
              store: picking?.store.name,
            })}
          </Title>
          <Description>
            {picking?.store.key === "walmart"
              ? t("stores.walmart.searchHint")
              : t("stores.mappings.pickHint")}
          </Description>
        </div>
        {phone && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("stores.basket.closePicker")}
            onClick={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        )}
      </div>
      <form
        className={cn("shrink-0", phone && "border-b px-4 py-3")}
        onSubmit={(event) => {
          event.preventDefault()
          void search(term)
        }}
      >
        <InputGroup>
          <InputGroupInput
            aria-label={t("stores.mappings.searchProducts")}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              size="icon-xs"
              disabled={busy !== null || term.trim().length < 2}
              aria-label={t("stores.mappings.searchProducts")}
            >
              {busy === "search" ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <div
        className={cn(
          "min-h-0 overflow-y-auto overscroll-contain",
          phone
            ? "flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            : "max-h-[60vh]"
        )}
      >
        {message && (
          <p role="alert" className="py-4 text-sm text-destructive">
            {message}
          </p>
        )}
        {products?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("stores.basket.nothingFound", { store: picking?.store.name })}
          </p>
        )}
        {products && products.length > 0 && (
          <ul className="grid gap-1">
            {products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void save(product)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <ProductSummary product={product} today={today} />
                  {busy === product.id && <Spinner />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )

  if (phone) {
    return (
      <Drawer
        open={picking !== null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DrawerContent className="h-[92svh] min-h-0 overflow-hidden">
          {content}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={picking !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] min-h-0 flex-col gap-4 sm:max-w-lg">
        {content}
      </DialogContent>
    </Dialog>
  )
}
