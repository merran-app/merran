import type * as React from "react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  BookOpen01Icon,
  Link01Icon,
  RefreshIcon,
  Settings01Icon,
  SparklesIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { useActiveHousehold, useMe } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"
import { ConnectionOverview } from "./connections"
import { TermHelp } from "./term-help"

export function OptionalSetup() {
  const { t } = useTranslation()
  const me = useMe()
  const household = useActiveHousehold()
  return (
    <details className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("onboarding.optional")}
      </summary>
      <div className="grid gap-5 pt-4">
        <div className="grid gap-3">
          <p className="text-muted-foreground">
            {t("onboarding.optionalHint")}
          </p>
          <ConnectionOverview />
          <p className="text-xs text-muted-foreground">
            {t("onboarding.connections.hint")}
          </p>
        </div>
        <section
          className="grid gap-3"
          aria-label={t("onboarding.resources.household")}
        >
          <h3 className="font-semibold">
            {t("onboarding.resources.household")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <ResourceCard
              to="/settings/household"
              icon={UserGroupIcon}
              title={t("onboarding.householdSettings")}
              hint={t("onboarding.resources.householdHint")}
            />
            {isAdminRole(household?.role) && (
              <ResourceCard
                to="/settings/import-export"
                icon={BookOpen01Icon}
                title={t("onboarding.migrate")}
                hint={t("onboarding.resources.importHint")}
              />
            )}
            <ResourceCard
              href="https://merran.app/docs/run/ai-setup/"
              icon={SparklesIcon}
              title={t("onboarding.ai")}
              hint={t("onboarding.resources.aiHint")}
            >
              <TermHelp term="keys" />
            </ResourceCard>
            <ResourceCard
              href="https://merran.app/docs/run/https-and-remote-access/"
              icon={Link01Icon}
              title={t("onboarding.https")}
              hint={t("onboarding.resources.httpsHint")}
            />
          </div>
        </section>
        {me.serverAdmin && (
          <section
            className="grid gap-3 border-t pt-4"
            aria-label={t("onboarding.resources.server")}
          >
            <h3 className="font-semibold">
              {t("onboarding.resources.server")}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ResourceCard
                to="/settings/server"
                icon={Settings01Icon}
                title={t("onboarding.serverSettings")}
                hint={t("onboarding.resources.serverHint")}
              />
              <ResourceCard
                href="https://merran.app/docs/run/updating-and-backups/"
                icon={RefreshIcon}
                title={t("onboarding.backups")}
                hint={t("onboarding.resources.backupsHint")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("onboarding.adminHint")}
            </p>
          </section>
        )}
      </div>
    </details>
  )
}

function ResourceCard({
  to,
  href,
  icon,
  title,
  hint,
  children,
}: {
  to?: "/settings/household" | "/settings/import-export" | "/settings/server"
  href?: string
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  title: string
  hint: string
  children?: React.ReactNode
}) {
  const content = (
    <>
      <HugeiconsIcon
        aria-hidden
        icon={icon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <HugeiconsIcon
        aria-hidden
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
    </>
  )
  const className =
    "flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <div className="flex items-center rounded-xl border bg-card">
      {to ? (
        <Link to={to} className={className}>
          {content}
        </Link>
      ) : (
        <a href={href} className={className} target="_blank" rel="noreferrer">
          {content}
        </a>
      )}
      {children}
    </div>
  )
}
