import { ReceiptDollarIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { TFunction } from "i18next"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api/client"

import { receiptsQuery, useDiscardReceipt, type Receipt } from "./queries"

/** Receipts read and waiting for a look: shared from a phone, say. */
export function WaitingReceipts() {
  const { t } = useTranslation()
  const { data } = useQuery(receiptsQuery)
  const receipts = data?.receipts ?? []
  if (receipts.length === 0) return null
  return (
    <ul className="grid gap-2">
      {receipts.map((receipt) =>
        receipt.status === "ready" ? (
          <li
            key={receipt.id}
            className="flex items-center gap-3 rounded-3xl border bg-card p-3 ps-4"
          >
            <ReceiptIcon />
            <span className="grid min-w-0 flex-1">
              <span className="line-clamp-2 font-medium">
                {receipt.store
                  ? t("pantry.receipts.waitingFrom", { store: receipt.store })
                  : t("pantry.receipts.waiting")}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("pantry.receipts.lines", { count: receipt.lines.length })}
              </span>
            </span>
            <Button
              size="sm"
              render={
                <Link
                  to="/pantry/receipts/$receiptId"
                  params={{ receiptId: receipt.id }}
                />
              }
            >
              {t("pantry.receipts.lookOver")}
            </Button>
          </li>
        ) : (
          <UnfinishedReceipt key={receipt.id} receipt={receipt} />
        )
      )}
    </ul>
  )
}

function ReceiptIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted">
      <HugeiconsIcon icon={ReceiptDollarIcon} strokeWidth={2} />
    </span>
  )
}

/**
 * A receipt that isn't ready to look over: still being read, or it
 * turned out not to be one. Used in the waiting list and on the receipt's
 * own page, for a link or a notice that came after it was set aside.
 */
export function UnfinishedReceipt({
  receipt,
  onDiscarded,
}: {
  receipt: Receipt
  onDiscarded?: () => void
}) {
  const { t } = useTranslation()
  const discardReceipt = useDiscardReceipt()
  const [discarding, setDiscarding] = React.useState(false)
  const reading = receipt.status === "reading"

  async function discard() {
    setDiscarding(true)
    try {
      await discardReceipt(receipt.id)
      onDiscarded?.()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      setDiscarding(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-3xl border bg-card p-3 ps-4">
      <ReceiptIcon />
      <span className="min-w-0 flex-1 font-medium" aria-live="polite">
        {reading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> {t("pantry.receipts.readingOne")}
          </span>
        ) : (
          unfinishedMessage(receipt, t)
        )}
      </span>
      {!reading && (
        <Button
          variant="outline"
          size="sm"
          disabled={discarding}
          onClick={() => void discard()}
        >
          {discarding && <Spinner data-icon="inline-start" />}
          {t("pantry.receipts.discard")}
        </Button>
      )}
    </li>
  )
}

/** Why a receipt that isn't ready isn't. */
export function unfinishedMessage(
  receipt: Pick<Receipt, "status" | "error">,
  t: TFunction
): string {
  switch (receipt.status) {
    case "recipe":
      return t("pantry.receipts.wasRecipe")
    case "none":
      return t("pantry.receipts.noneFound")
    default:
      return receipt.error ?? t("pantry.receipts.couldNotRead")
  }
}
