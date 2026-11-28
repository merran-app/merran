import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { PageProgress } from "@/components/layout/page-progress"
import { NotFound, RouteError } from "@/components/layout/status-pages"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootComponent,
    notFoundComponent: NotFound,
    errorComponent: RouteError,
  }
)

function RootComponent() {
  return (
    <>
      <PageProgress />
      <Outlet />
    </>
  )
}
