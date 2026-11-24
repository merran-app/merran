import { ArrowLeft01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { importActions } from "./import-actions"
import { useImportTitle, useSummaryText } from "./imports-list"
import { linkLabel } from "./link-label"
import {
  importQuery,
  isGoing,
  type ImportDetail,
  type ImportPages,
} from "./queries"
import { TokenDialog } from "./token-dialog"
import { UndoDialog } from "./undo-dialog"

/** How many a list shows at a time, as the API sends them. */
const PAGE_SIZE = 100

/**
 * One import: how it's going, its links, what came in (to delete any),
 * what was already here and what didn't come in, with Stop, Undo or
 * Restore, Try again and Delete for the record.
 */
export function ImportPage({ importId }: { importId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshRecipes = useRefreshRecipes()
  const titleOf = useImportTitle()
  const summaryOf = useSummaryText()
  const [pages, setPages] = React.useState<ImportPages>({})
  const query = useQuery({
    ...importQuery(importId, pages),
    placeholderData: keepPreviousData,
  })
  const [busy, setBusy] = React.useState(false)
  const data = query.data

  // Once it's finished, the recipes it brought in show everywhere.
  const finished = Boolean(data && !isGoing(data))
  const refreshed = React.useRef(false)
  React.useEffect(() => {
    if (!finished || refreshed.current) return
    refreshed.current = true
    void refreshRecipes()
  }, [finished, refreshRecipes])

  /** Runs an action, saying what went wrong, then shows the import again. */
  async function act(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
      await queryClient.invalidateQueries({ queryKey: ["imports"] })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (query.isPending) {
    return (
      <>
        <BackToImports />
        <PageHeader title={t("imports.title")} />
        <Skeleton className="h-60 rounded-3xl" />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <BackToImports />
        <PageHeader title={t("imports.title")} />
        <p className="text-muted-foreground">{t("imports.gone")}</p>
      </>
    )
  }

  const going = isGoing(data)
  const { title, detail } = titleOf(data)
  const can = importActions(data)
  // Mealie through its API: its token is asked for again.
  const needsToken = data.kind === "mealie" && data.source !== null
  const tagSearch = data.tag ? { tags: data.tag } : {}

  const stop = () =>
    act(async () => {
      await unwrap(
        api.POST("/api/imports/{importId}/stop", {
          params: { path: { importId } },
        })
      )
    })

  const tryAgain = (token?: string) =>
    act(async () => {
      const started = await unwrap(
        api.POST("/api/imports/{importId}/retry", {
          params: { path: { importId } },
          body: token ? { token } : {},
        })
      )
      toast.success(t("imports.triedAgain"))
      await navigate({
        to: "/recipes/imports/$importId",
        params: { importId: started.id },
      })
    })

  const undo = (keep: string[]) =>
    act(async () => {
      await unwrap(
        api.POST("/api/imports/{importId}/undo", {
          params: { path: { importId } },
          body: { keep },
        })
      )
      await refreshRecipes()
      toast.success(t("imports.undone"))
    })

  const restore = () =>
    act(async () => {
      await unwrap(
        api.POST("/api/imports/{importId}/restore", {
          params: { path: { importId } },
        })
      )
      await refreshRecipes()
      toast.success(t("imports.restored"))
    })

  const deleteRecord = async () => {
    await unwrap(
      api.DELETE("/api/imports/{importId}", { params: { path: { importId } } })
    )
    await queryClient.invalidateQueries({ queryKey: ["imports"] })
    toast.success(t("imports.recordDeleted"))
    await navigate({ to: "/recipes/imports" })
  }

  return (
    <>
      <BackToImports />
      <PageHeader
        title={detail ? `${title}: ${detail}` : title}
        description={summaryOf(data)}
        actions={
          <>
            {can.stop && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void stop()}
              >
                {t("imports.stop")}
              </Button>
            )}
            {can.tryAgain &&
              (needsToken ? (
                <TokenDialog onToken={(token) => tryAgain(token)} />
              ) : (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void tryAgain()}
                >
                  {t("imports.tryAgain")}
                </Button>
              ))}
            {can.undo && <UndoDialog detail={data} onUndo={undo} />}
            {can.restore && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void restore()}
              >
                {t("imports.restore")}
              </Button>
            )}
            {can.deleteRecord && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost">{t("imports.deleteRecord")}</Button>
                }
                title={t("imports.deleteRecordTitle")}
                description={t("imports.deleteRecordDescription")}
                confirm={t("imports.deleteRecordConfirm")}
                onConfirm={deleteRecord}
              />
            )}
          </>
        }
      />

      {going && (
        <Progress
          value={(data.done / Math.max(data.total, 1)) * 100}
          className="mb-4"
          aria-label={summaryOf(data)}
        />
      )}
      {data.error && (
        <p className="mb-4 text-sm text-destructive">
          {t("imports.error", { error: data.error })}
        </p>
      )}
      {data.tag && (
        <p className="mb-4 text-sm text-muted-foreground">
          <Trans
            i18nKey="recipes.links.tagged"
            values={{ tag: data.tag }}
            components={{
              link: (
                <Link
                  to="/recipes"
                  search={tagSearch}
                  className="font-medium text-foreground underline underline-offset-4"
                />
              ),
            }}
          />
        </p>
      )}

      <div className="grid gap-6">
        {/* Each link as it goes; once it's over, the lists below say the
            same with what can be done about it. */}
        {going && data.items.length > 0 && <LinkList items={data.items} />}
        <CameIn
          data={data}
          busy={busy}
          onDelete={(ids) =>
            act(async () => {
              await unwrap(
                api.POST("/api/recipes/bulk", {
                  body: { action: "delete", ids },
                })
              )
              await refreshRecipes()
              toast.success(t("imports.deletedTicked", { count: ids.length }))
            })
          }
          pager={
            <Pager
              offset={pages.cameIn ?? 0}
              more={data.cameIn.more}
              onMove={(cameIn) => setPages((now) => ({ ...now, cameIn }))}
            />
          }
        />
        {data.alreadyHere.items.length > 0 && (
          <Section title={t("imports.alreadyHere")}>
            <ul className="grid divide-y rounded-3xl border bg-card">
              {data.alreadyHere.items.map((item) => (
                <li key={item.position} className="p-3">
                  {item.recipe ? (
                    <RecipeLink recipe={item.recipe} />
                  ) : (
                    <span className="text-muted-foreground">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
            <Pager
              offset={pages.alreadyHere ?? 0}
              more={data.alreadyHere.more}
              onMove={(alreadyHere) =>
                setPages((now) => ({ ...now, alreadyHere }))
              }
            />
          </Section>
        )}
        {data.didntComeIn.items.length > 0 && (
          <Section title={t("imports.didntComeIn")}>
            <ul className="grid divide-y rounded-3xl border bg-card">
              {data.didntComeIn.items.map((item) => (
                <li key={item.position} className="grid gap-0.5 p-3">
                  <span className="truncate font-medium">
                    {item.label.startsWith("http")
                      ? linkLabel(item.label)
                      : item.label}
                  </span>
                  <span className="text-sm text-destructive">{item.error}</span>
                </li>
              ))}
            </ul>
            <Pager
              offset={pages.didntComeIn ?? 0}
              more={data.didntComeIn.more}
              onMove={(didntComeIn) =>
                setPages((now) => ({ ...now, didntComeIn }))
              }
            />
          </Section>
        )}
      </div>
    </>
  )
}

function BackToImports() {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ms-3 mt-2 md:mt-4"
      render={<Link to="/recipes/imports" />}
    >
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        strokeWidth={2}
        className="rtl:-scale-x-100"
      />
      {t("imports.title")}
    </Button>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-2">
      <h2 className="font-heading text-lg">{title}</h2>
      {children}
    </section>
  )
}

function RecipeLink({ recipe }: { recipe: { slug: string; name: string } }) {
  return (
    <Link
      to="/recipes/$slug"
      params={{ slug: recipe.slug }}
      className="truncate font-medium hover:underline"
    >
      {recipe.name}
    </Link>
  )
}

/** The next or previous hundred of a list, when there are more. */
function Pager({
  offset,
  more,
  onMove,
}: {
  offset: number
  more: boolean
  onMove: (offset: number) => void
}) {
  const { t } = useTranslation()
  if (offset === 0 && !more) return null
  return (
    <div className="flex gap-2">
      {offset > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMove(offset - PAGE_SIZE)}
        >
          {t("imports.previous")}
        </Button>
      )}
      {more && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMove(offset + PAGE_SIZE)}
        >
          {t("imports.next")}
        </Button>
      )}
    </div>
  )
}

/** Several links' or a collection's links, in order, as it goes. */
function LinkList({ items }: { items: ImportDetail["items"] }) {
  const { t } = useTranslation()
  return (
    <ul className="grid divide-y rounded-3xl border bg-card">
      {items.map((item) => (
        <li key={item.position} className="flex items-center gap-3 p-3">
          {item.recipe?.photo ? (
            <img
              src={item.recipe.photo}
              alt=""
              className="size-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              {item.state === "adding" ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={Link01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              )}
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-0.5">
            {item.recipe ? (
              <RecipeLink recipe={item.recipe} />
            ) : (
              <a
                href={item.label}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium hover:underline"
              >
                {linkLabel(item.label)}
              </a>
            )}
            <span
              className={cn(
                "text-sm text-muted-foreground",
                item.state === "added" && "text-primary",
                item.state === "failed" && "text-destructive"
              )}
            >
              {item.state === "failed" && item.error
                ? item.error
                : t(`recipes.links.state.${item.state}`)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The recipes it brought in, each to tick and delete. */
function CameIn({
  data,
  busy,
  onDelete,
  pager,
}: {
  data: ImportDetail
  busy: boolean
  onDelete: (ids: string[]) => Promise<void>
  pager: React.ReactNode
}) {
  const { t } = useTranslation()
  const [ticked, setTicked] = React.useState<ReadonlySet<string>>(new Set())
  // Those in Recently deleted already can't be deleted again.
  const items = data.cameIn.items.filter((item) => !item.recipe.deleted)
  if (items.length === 0) return null

  function toggle(id: string, on: boolean) {
    setTicked((now) => {
      const next = new Set(now)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <Section title={t("imports.cameIn")}>
      <ul className="grid divide-y rounded-3xl border bg-card">
        {items.map(({ position, recipe }) => (
          <li key={position} className="flex items-center gap-3 p-3">
            <Checkbox
              checked={ticked.has(recipe.id)}
              onCheckedChange={(on) => toggle(recipe.id, on)}
              aria-label={recipe.name}
            />
            {recipe.photo && (
              <img
                src={recipe.photo}
                alt=""
                className="size-10 shrink-0 rounded-lg object-cover"
              />
            )}
            <RecipeLink recipe={recipe} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {ticked.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() =>
              void onDelete([...ticked]).then(() => setTicked(new Set()))
            }
          >
            {t("imports.deleteTicked", { count: ticked.size })}
          </Button>
        )}
        {pager}
      </div>
    </Section>
  )
}
