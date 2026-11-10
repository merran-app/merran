import { AiMagicIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Trans, useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { aiStatusFor } from "@/features/ai/ai-for"
import { householdAiQuery } from "@/features/ai/queries"
import { householdQuery, isAdminRole } from "@/features/household/queries"

/** The tasks a notice can be about. */
type Task = "import" | "tidy" | "swaps" | "assistant" | "discover" | "receipts"

/** What a notice can be about: a task, or photos and PDFs being read. */
type Topic = Task | "vision"

/**
 * Whether the household can use AI for a task, and if not, why. Undefined
 * until it's known. `visual` is for photos and PDFs being imported.
 */
export function useAiFor(task: Task, options: { visual?: boolean } = {}) {
  const { data } = useQuery(householdAiQuery)
  return aiStatusFor(data?.status, task, options)
}

/** Why a task, or reading photos and PDFs, can't use AI, and who can set it up. */
export function NeedsAi({
  task,
  why,
  onNavigate,
}: {
  /** The task, or "vision" for photos and PDFs being read. */
  task: Topic
  why: "noKey" | "notCovered" | "overLimit" | "ownLimit"
  /** Following the link to Settings closes the dialog. */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { data: household } = useQuery(householdQuery)
  return (
    <Alert>
      <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} />
      <AlertDescription>
        <p>
          {t(`ai.needs.${task}.${why}`)}{" "}
          {isAdminRole(household?.role) ? (
            <Trans
              i18nKey="ai.needs.fixAdmin"
              components={{
                link: (
                  <Link
                    to="/settings/household"
                    className="underline underline-offset-3"
                    onClick={onNavigate}
                  />
                ),
              }}
            />
          ) : (
            t("ai.needs.fixMember")
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}
