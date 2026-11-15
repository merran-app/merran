import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Markdown } from "@/features/assistant/markdown"
import { SectionActions } from "@/features/settings/card-actions"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { ServerSwitch } from "./server-switch"
import { updatesQuery } from "./updates"

// Apart from the sidebar's Update badge (updates.tsx), so the release notes'
// markdown loads with the This server page, not with every page.

/** The image to pull for a release: its own tag, which never moves. */
const IMAGE = "ghcr.io/merran-app/merran"

/**
 * This server's part of the About card: up to date, or what's new and how
 * to update, with Check now and the switch.
 */
export function UpdatesSection() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: updates } = useQuery(updatesQuery)
  const [checking, setChecking] = React.useState(false)
  if (!updates) return null

  async function checkNow() {
    setChecking(true)
    try {
      const found = await unwrap(api.POST("/api/settings/server/updates/check"))
      queryClient.setQueryData(updatesQuery.queryKey, found)
      if (!found.newer && !found.error) toast.success(t("updates.upToDate"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setChecking(false)
    }
  }

  const latest = updates.latest
  return (
    <div className="grid gap-4 border-t pt-4">
      {updates.devBuild ? (
        <p className="text-sm text-muted-foreground">{t("updates.devBuild")}</p>
      ) : updates.newer && latest ? (
        <div className="grid gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {t("updates.isOut", { version: latest.version })}
            </p>
            {latest.prerelease && (
              <Badge variant="outline">{t("updates.prerelease")}</Badge>
            )}
          </div>
          {latest.notes.trim() && (
            <div className="max-h-72 overflow-y-auto rounded-xl bg-background/60 p-3 text-sm">
              <Markdown>{latest.notes}</Markdown>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {updates.installMethod === "docker"
              ? t("updates.howDocker")
              : t("updates.howSource")}
          </p>
          {updates.installMethod === "docker" ? (
            <>
              <CopyField
                label={t("updates.compose")}
                value="docker compose pull && docker compose up -d"
                description={t("updates.composeHint")}
              />
              <CopyField
                label={t("updates.pinned")}
                value={`docker pull ${IMAGE}:${latest.version}`}
              />
            </>
          ) : (
            <CopyField
              label={t("updates.fromSource")}
              value={`git fetch --tags && git checkout v${latest.version} && pnpm install && pnpm build`}
            />
          )}
          <a
            href={latest.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("updates.onGithub")}
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {!updates.checking
            ? t("updates.off")
            : updates.checkedAt
              ? t("updates.checked", {
                  when: formatRelativeDate(updates.checkedAt, i18n.language),
                })
              : t("updates.notYet")}
        </p>
      )}
      {updates.error && (
        <p className="text-sm text-destructive">
          {t("updates.couldNot", { error: updates.error })}
        </p>
      )}
      {!updates.devBuild && (
        <>
          <ServerSwitch
            settingKey="updates.check"
            label={t("updates.switch")}
            description={t("updates.switchHint")}
          />
          {updates.checking && (
            <SectionActions>
              <Button
                variant="outline"
                disabled={checking}
                onClick={() => void checkNow()}
              >
                {checking && <Spinner data-icon="inline-start" />}
                {t("updates.checkNow")}
              </Button>
            </SectionActions>
          )}
        </>
      )}
    </div>
  )
}
