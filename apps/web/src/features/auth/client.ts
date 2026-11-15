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
