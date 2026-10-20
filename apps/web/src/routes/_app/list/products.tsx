import { createFileRoute } from "@tanstack/react-router"
import { ProductMappingsPage } from "@/features/stores/product-mappings-page"
import { productMappingsQuery } from "@/features/stores/queries"

export const Route = createFileRoute("/_app/list/products")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(productMappingsQuery),
  component: ProductMappingsPage,
})
