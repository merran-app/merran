import { Link } from "@tanstack/react-router"
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { useActiveHousehold } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"
import { HouseholdReview } from "./household-review"
import { useOnboarding } from "./onboarding-context"
import { Welcome } from "@/features/today/welcome"
import { OptionalSetup } from "./optional-setup"

const STEPS = [
  { id: "recipe", to: "/recipes" },
  { id: "plan", to: "/plan" },
  { id: "list", to: "/list" },
  { id: "cook", to: "/recipes" },
] as const

export function FirstMealChecklist() {
  const { t } = useTranslation()
  const household = useActiveHousehold()
  const { data, isError, refetch, update, saving } = useOnboarding()
  if (isError)
    return (
      <section className="rounded-3xl border p-5">
        <p>{t("onboarding.loadFailed")}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t("onboarding.retry")}
        </Button>
      </section>
    )
  if (!data || data.dismissed) return null
  const completed = STEPS.filter((step) => data.progress[step.id]).length
  const next = STEPS.find((step) => !data.progress[step.id])?.id
  return (
    <section
      data-tour="first-meal"
      aria-labelledby="first-meal-heading"
      className="grid gap-5 rounded-3xl border bg-card p-4 text-card-foreground sm:p-6"
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="first-meal-heading"
            className="font-heading text-2xl font-semibold"
          >
            {t("onboarding.title")}
          </h2>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground tabular-nums">
            {t("onboarding.progress", {
              count: completed,
              total: STEPS.length,
            })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            completed === STEPS.length
              ? "onboarding.allComplete"
              : "onboarding.description"
          )}
        </p>
        <Progress
          value={completed}
          max={STEPS.length}
          aria-label={t("onboarding.title")}
          aria-valuetext={t("onboarding.progress", {
            count: completed,
            total: STEPS.length,
          })}
          className="[&_[data-slot=progress-track]]:h-1.5"
        />
      </div>
      {isAdminRole(household?.role) && !data.reviewed && <HouseholdReview />}
      <ol data-tour="page-actions" className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step, index) => {
          const done = data.progress[step.id]
          const isNext = step.id === next
          return (
            <li key={step.id}>
              <Link
                to={step.to}
                className={cn(
                  "group flex h-full items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isNext ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    done || isNext
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  )}
                >
                  {done ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2.5}
                      className="size-4"
                    />
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isNext ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {t(
                      done
                        ? "onboarding.complete"
                        : isNext
                          ? "onboarding.upNext"
                          : "onboarding.step",
                      { number: index + 1 }
                    )}
                  </span>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {t(`onboarding.steps.${step.id}.title`)}
                    </span>
                    <HugeiconsIcon
                      aria-hidden
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`onboarding.steps.${step.id}.description`)}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
      {!data.progress.recipe && <Welcome />}
      <OptionalSetup />
      <Button
        variant="ghost"
        className="justify-self-start"
        disabled={saving}
        onClick={() => void update({ dismissed: true })}
      >
        {t("onboarding.dismiss")}
      </Button>
    </section>
  )
}
