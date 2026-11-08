import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AfterCookingDialog, type AfterCooking } from "./after-cooking"

// Marking a meal cooked anywhere but the cook view (the plan, Today, a
// recipe's I made this) says so in a message that offers "How did it
// go?": the same two steps the cook view asks when it's finished.

type AfterCookingContext = {
  /** Opens the two steps for a cooked meal. */
  ask: (asking: AfterCooking) => void
  /** Says a meal's cooked, offering the two steps. */
  offer: (message: string, asking: AfterCooking) => void
}

const Context = React.createContext<AfterCookingContext | null>(null)

/** How long the message stays, to find the button. */
const OFFER_MS = 10_000

export function AfterCookingProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = React.useState<AfterCooking | null>(null)

  const value = React.useMemo<AfterCookingContext>(
    () => ({
      ask: setAsking,
      offer: (message, cooked) =>
        toast.success(message, {
          duration: OFFER_MS,
          action: {
            label: t("cook.howDidItGo"),
            onClick: () => setAsking(cooked),
          },
        }),
    }),
    [t]
  )

  return (
    <Context.Provider value={value}>
      {children}
      <AfterCookingDialog asking={asking} onDone={() => setAsking(null)} />
    </Context.Provider>
  )
}

export function useAfterCooking() {
  const context = React.useContext(Context)
  if (!context) {
    throw new Error("useAfterCooking needs an AfterCookingProvider around it.")
  }
  return context
}
