import {
  switchSetting,
  textSetting,
  secretSetting,
} from "../../core/settings.ts"
import { z } from "zod"

export const AUTH_SECURITY = {
  passwords: switchSetting({
    key: "auth.passwords",
    env: "MERRAN_AUTH_PASSWORDS",
    envOnly: true,
    default: true,
    description:
      "Allow password sign-in. Disabling takes effect only after an administrator has a usable linked OIDC identity or registered passkey. Set true to recover password access.",
  }),
  oauth: switchSetting({
    key: "auth.oauth",
    env: "MERRAN_AUTH_OAUTH",
    envOnly: true,
    default: false,
    description:
      "Allow connected applications to request household access through OAuth. Requires MERRAN_PUBLIC_URL and a restart.",
  }),
  oidcDiscovery: textSetting({
    key: "auth.oidcDiscovery",
    env: "MERRAN_AUTH_OIDC_DISCOVERY",
    envOnly: true,
    schema: z.url({ protocol: /^https?$/ }),
    description:
      "OIDC discovery document URL for the operator's sign-in provider. Restart after changing.",
  }),
  oidcClientId: textSetting({
    key: "auth.oidcClientId",
    env: "MERRAN_AUTH_OIDC_CLIENT_ID",
    envOnly: true,
    description: "Client ID registered with the external OIDC provider.",
  }),
  oidcClientSecret: secretSetting({
    key: "auth.oidcClientSecret",
    env: "MERRAN_AUTH_OIDC_CLIENT_SECRET",
    envOnly: true,
    description:
      "Client secret for the external OIDC provider. Never exposed to clients.",
  }),
  oidcAllowSignup: switchSetting({
    key: "auth.oidcAllowSignup",
    env: "MERRAN_AUTH_OIDC_ALLOW_SIGNUP",
    envOnly: true,
    default: false,
    description:
      "Allow the configured OIDC provider to create new Merran accounts. Off: people must explicitly link an existing account first.",
  }),
  passkeys: switchSetting({
    key: "auth.passkeys",
    env: "MERRAN_AUTH_PASSKEYS",
    default: false,
    description:
      "Allow passkey registration and sign-in. Requires a stable HTTPS public URL, or localhost for development.",
  }),
  twoFactor: switchSetting({
    key: "auth.twoFactor",
    env: "MERRAN_AUTH_TWO_FACTOR",
    default: false,
    description:
      "Allow people to enroll an authenticator and recovery codes. Turning this off does not bypass an enrolled person's second factor.",
  }),
  requireAdminTwoFactor: switchSetting({
    key: "auth.requireAdminTwoFactor",
    env: "MERRAN_AUTH_REQUIRE_ADMIN_TWO_FACTOR",
    default: false,
    description:
      "Require administrators to verify a second factor or a user-verified passkey before using the app. Also enables authenticator enrollment.",
  }),
}
