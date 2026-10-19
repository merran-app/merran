import { createAuthClient } from "better-auth/react"
import { twoFactorClient, usernameClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    usernameClient(),
    twoFactorClient(),
    passkeyClient(),
    oauthProviderClient(),
  ],
})

/** Return URLs are local page paths, including after verification and external sign-in. */
export function safeReturnTo(target: string | undefined) {
  if (
    !target ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(target)
  )
    return "/"
  return target
}
