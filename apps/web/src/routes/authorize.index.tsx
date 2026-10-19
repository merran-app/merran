import { createFileRoute } from "@tanstack/react-router"
import { AuthorizationPage } from "@/features/auth/authorization"

export const Route = createFileRoute("/authorize/")({
  component: AuthorizationPage,
})
