import { ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { ShowMoreButton } from "@/components/show-more-button"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAiFor } from "@/features/ai/needs-ai"
import { Search } from "@/features/find/discover-tab"
import { collectionQuery, discoveryQuery } from "@/features/find/queries"
import { ShelfRecipeCard } from "@/features/find/shelf-recipe-card"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { uniqueById } from "@/lib/pages"

export const Route = createFileRoute("/_app/recipes/find/$collection")({
  component: CollectionPage,
})

/** The most recipes one import takes. */
const MOST_IMPORTED = 100

/**
 * A starter collection: its recipes, Show more, Import what's shown, and
 * Find more with AI.
 */
function CollectionPage() {
  const { t } = useTranslation()
  const { collection: id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ai = useAiFor("discover")
  const pages = useInfiniteQuery(collectionQuery(id))
  const { isPending, isError } = pages
  // The header, its counts and Find more's search come with the first page.
  const collection = pages.data?.pages[0]
  const recipes = uniqueById(
    pages.data?.pages.flatMap((page) => page.recipes) ?? []
  )
  // What's shown and not in the library yet: what the button imports.
  const toImportShown = recipes
    .filter((recipe) => !recipe.inLibrary)
    .slice(0, MOST_IMPORTED)
  const [busy, setBusy] = React.useState<"import" | "find" | null>(null)

  async function importShown() {
    setBusy("import")
    try {
      const started = await unwrap(
        api.POST("/api/collections/{collection}/import", {
          params: { path: { collection: id } },
          body: { recipes: toImportShown.map((recipe) => recipe.id) },
        })
      )
      await navigate({
        to: "/recipes/imports/$importId",
        params: { importId: started.id },
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function findMore() {
    setBusy("find")
    try {
      await unwrap(
        api.POST("/api/collections/{collection}/find", {
          params: { path: { collection: id } },
        })
      )
      await queryClient.invalidateQueries({
        queryKey: collectionQuery(id).queryKey,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  // While Find more searches, ask after the search alone; once it's done,
  // the collection comes in again, once, with what it found.
  const found = collection?.found ?? null
  const searching = found?.status === "searching"
  const { data: progress } = useQuery({
    ...discoveryQuery(found?.id ?? ""),
    enabled: searching,
  })
  const search = searching && progress ? progress : found
  const finding = search?.status === "searching"
  const finished = Boolean(
    searching && progress && progress.status !== "searching"
  )
  React.useEffect(() => {
    if (!finished) return
    void queryClient.invalidateQueries({
      queryKey: collectionQuery(id).queryKey,
    })
  }, [finished, id, queryClient])

  // "Import all" only when it really is all: nothing hidden, and no more
  // than one import takes.
  const everythingImports =
    !pages.hasNextPage &&
    collection !== undefined &&
    toImportShown.length === collection.toImport

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-ms-3 mt-2 md:mt-4"
        render={<Link to="/recipes/find" search={{ tab: "collections" }} />}
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="rtl:-scale-x-100"
        />
        {t("find.title")}
      </Button>
      {isPending ? (
        <div className="grid gap-4 pt-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        </div>
      ) : isError || !collection ? (
        <p className="pt-4 text-muted-foreground">
          {t("find.collections.missing")}
        </p>
      ) : (
        <>
          <PageHeader
            title={collection.title}
            description={collection.description}
            actions={
              toImportShown.length > 0 && (
                <Button
                  disabled={busy !== null}
                  onClick={() => void importShown()}
                >
                  {busy === "import" && <Spinner data-icon="inline-start" />}
                  {everythingImports
                    ? t("find.collections.importAll", {
                        count: collection.toImport,
                      })
                    : t("find.collections.importShown", {
                        count: toImportShown.length,
                      })}
                </Button>
              )
            }
          />
          <div className="grid gap-8">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recipes.map((recipe) => (
                <li key={recipe.id}>
                  <ShelfRecipeCard recipe={recipe} />
                </li>
              ))}
            </ul>
            {pages.hasNextPage && (
              <div className="flex justify-center">
                <ShowMoreButton query={pages} />
              </div>
            )}

            {ai.ready && (
              <section className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <h2 className="font-heading text-xl font-semibold">
                      {t("find.collections.moreTitle")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t("find.collections.moreHint")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy !== null || finding}
                    onClick={() => void findMore()}
                  >
                    {busy === "find" || finding ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <HugeiconsIcon
                        icon={Search01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                    )}
                    {t("find.collections.findMore")}
                  </Button>
                </div>
                {search && <Search search={search} hideTheme />}
              </section>
            )}
          </div>
        </>
      )}
    </>
  )
}
