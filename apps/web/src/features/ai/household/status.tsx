import { AI_TASKS, PROVIDER_NAMES } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { formatMoney, householdAiQuery, type HouseholdAi } from "../queries"

type TaskStatus =
  | { ok: true; ref: string; source: "server" | "household" }
  | { ok: false; why: "noKey" | "notCovered" | "overLimit" | "ownLimit" }

/** A task's status: which model and whose key, or why none. */
const statusOf = (data: HouseholdAi, task: (typeof AI_TASKS)[number]) =>
  (data.status.tasks[task] ?? { ok: false, why: "noKey" }) as TaskStatus

/** A model's name, from the ones on offer, or its reference. */
function modelName(data: HouseholdAi, ref: string) {
  return data.models.find((model) => model.ref === ref)?.name ?? ref
}

/**
 * Whether photos and PDFs go somewhere big tasks don't, so they're worth a
 * line of their own: another model, or one that can't run when big tasks
 * can, or the other way round.
 */
function visionDiffers(vision: TaskStatus, large: TaskStatus) {
  if (vision.ok && large.ok) return vision.ref !== large.ref
  return vision.ok !== large.ok
}

/** What a household's AI does now: which model, on whose key, or why none. */
export function StatusLine({ data }: { data: HouseholdAi }) {
  const { t } = useTranslation()
  const large = statusOf(data, "import")
  const small = statusOf(data, "swaps")
  const vision = data.status.vision as TaskStatus
  if (!data.status.available) {
    const why = large.ok ? "noKey" : large.why
    return (
      <p className="text-sm text-muted-foreground">
        {t(`ai.status.why.${why}`)}
      </p>
    )
  }
  const line = (task: TaskStatus, size: "large" | "small" | "vision") =>
    task.ok
      ? t(`ai.status.uses.${size}`, {
          model: modelName(data, task.ref),
          whose: t(`ai.status.whose.${task.source}`),
        })
      : t(`ai.status.none.${size}`, { why: t(`ai.status.why.${task.why}`) })
  return (
    <ul className="grid gap-1 text-sm">
      <li>{line(large, "large")}</li>
      <li className="text-muted-foreground">{line(small, "small")}</li>
      {visionDiffers(vision, large) && (
        <li className="text-muted-foreground">{line(vision, "vision")}</li>
      )}
    </ul>
  )
}

/** Keys the household relies on that are out of credit, or running low. */
export function useKeyAlertText() {
  const { t, i18n } = useTranslation()
  return (alert: HouseholdAi["status"]["keyAlerts"][number]) => {
    const name =
      alert.provider === "openai-compatible"
        ? (alert.name ?? t("ai.keys.address"))
        : PROVIDER_NAMES[alert.provider]
    const whose = t(`ai.alerts.whose.${alert.source}`, { name })
    return alert.outOfCredit
      ? t("ai.alerts.out", { whose })
      : alert.left === null
        ? t("ai.alerts.lowUnknown", { whose })
        : t("ai.alerts.low", {
            whose,
            left: formatMoney(alert.left, i18n.language),
          })
  }
}

export function KeyAlerts({ data }: { data: HouseholdAi }) {
  const text = useKeyAlertText()
  if (data.status.keyAlerts.length === 0) return null
  return (
    <ul className="grid gap-1.5">
      {data.status.keyAlerts.map((alert) => (
        <li
          key={alert.id}
          className={
            alert.outOfCredit
              ? "rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm"
          }
        >
          {text(alert)}
        </li>
      ))}
    </ul>
  )
}

/**
 * On Today: a warning when this month's AI spend nears its limit, on the
 * server's keys or the household's own.
 */
export function AiLimitNote() {
  const { t, i18n } = useTranslation()
  const keyAlertText = useKeyAlertText()
  const { data } = useQuery({ ...householdAiQuery, staleTime: 5 * 60_000 })
  if (!data) return null
  const { server, own, keyAlerts } = data.status
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const alert = keyAlerts.find((one) => one.outOfCredit) ?? keyAlerts[0] ?? null
  const text = alert
    ? keyAlertText(alert)
    : server.near && server.limit !== null
      ? t("ai.near.server", {
          spent: money(server.spent),
          limit: money(server.limit),
        })
      : own.near && own.limit !== null
        ? t("ai.near.own", { spent: money(own.spent), limit: money(own.limit) })
        : null
  if (!text) return null
  return (
    <p
      role="status"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm"
    >
      {text}
    </p>
  )
}
