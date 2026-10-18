import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { SendPlan, YourStore } from "./queries"
import type { ShoppingItemProgress } from "./shopping-progress"

/** Keep the row short; product details and routing live in its status menu. */
export function ShoppingStatus({
  item,
  store,
  plan,
  onReview,
  onStore,
  findStores,
  onFind,
}: {
  item: ShoppingItemProgress
  store: string | undefined
  plan: SendPlan
  onReview: (store: string) => void
  onStore: (store: string) => void
  findStores: readonly YourStore[]
  onFind: (store: YourStore) => void
}) {
  const { t } = useTranslation()
  const nameOf = (key: string) =>
    plan.stores.find((store) => store.key === key)?.name ?? key
  const sent = item.deliveries[0]
  const target = sent?.store ?? store
  const product = item.products.find((product) => product.store === target)
  const changed = item.deliveries.some((sent) => sent.changed)
  const state = sent
    ? changed
      ? "check"
      : "sent"
    : !target || target === "out"
      ? "manual"
      : !product
        ? "choose"
        : !product.inStock
          ? "unavailable"
          : "ready"
  const status = t(`list.shopping.compact.${state}`)
  const label = state === "manual" ? status : `${nameOf(target!)} · ${status}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("list.shopping.itemMenu", {
          name: item.name,
          status: label,
        })}
        title={label}
        className={cn(
          "inline-flex h-7 max-w-full min-w-0 shrink-0 items-center justify-center rounded-full border px-2 text-center text-xs leading-none outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 @md:max-w-40",
          state === "manual" ? "text-muted-foreground" : "text-primary"
        )}
      >
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="break-words whitespace-normal">
            {item.name} · {label}
          </DropdownMenuLabel>
          {item.deliveries.length ? (
            item.deliveries.map((sent) => (
              <React.Fragment key={sent.store}>
                <p className="px-3 pb-2 text-xs break-words text-muted-foreground">
                  {t(
                    sent.changed
                      ? "list.shopping.changed"
                      : "list.shopping.sentTo",
                    { store: nameOf(sent.store), count: sent.packages }
                  )}
                  {sent.product && (
                    <>
                      {" "}
                      · {sent.packages} × {sent.product}
                      {sent.size ? ` · ${sent.size}` : ""}
                    </>
                  )}
                </p>
                <DropdownMenuItem onClick={() => onReview(sent.store)}>
                  {t("list.shopping.review", { store: nameOf(sent.store) })}
                </DropdownMenuItem>
              </React.Fragment>
            ))
          ) : (
            <>
              {product && (
                <p className="px-3 pb-2 text-xs break-words text-muted-foreground">
                  {product.name}
                  {product.size ? ` · ${product.size}` : ""}
                </p>
              )}
              {target && target !== "out" && (
                <DropdownMenuItem onClick={() => onReview(target)}>
                  {t(
                    !product || !product.inStock
                      ? "list.shopping.choose"
                      : "list.shopping.review",
                    { store: nameOf(target) }
                  )}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuGroup>
        {!sent && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="break-words whitespace-normal">
                {t("send.whereFor", { name: item.name })}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={store ?? "out"}
                onValueChange={onStore}
              >
                {plan.stores.map((store) => (
                  <DropdownMenuRadioItem key={store.key} value={store.key}>
                    <span className="min-w-0 break-words whitespace-normal">
                      {store.name}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem
                  value="out"
                  className="whitespace-normal"
                >
                  {t("list.shopping.manual")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
        {findStores.some((store) => !store.connected) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("list.findMenu")}</DropdownMenuLabel>
              {findStores
                .filter((store) => !store.connected)
                .map((store) => (
                  <DropdownMenuItem
                    key={store.key}
                    onClick={() => onFind(store)}
                  >
                    {store.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
