import { createFileRoute, redirect } from "@tanstack/react-router"

/** Settings → You became Profile, Sign-in, and Apps and devices; old links open Profile. */
export const Route = createFileRoute("/_app/settings/you")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile", replace: true })
  },
})
