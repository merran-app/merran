---
title: Authentication and connected apps
description: Configure passkeys, authenticators, single sign-on, and OAuth connections.
sidebar:
  order: 4
---

:::note[Not released yet]
These features were added after alpha.4. Use a build containing the authentication changes before following this guide.
:::

Passwords and API keys continue to work by default. Passkeys, authenticator enrollment, external single sign-on and OAuth connections are opt-in. All methods use the same Merran account and household permissions.

## Passkeys and authenticators

In **Settings → This server → Authentication**, enable **Passkeys** or **Two-step sign-in**. Passkeys require `MERRAN_PUBLIC_URL` to be your stable HTTPS address; localhost works for development. Changing the hostname can make existing passkeys unusable.

In **Settings → You → Passkeys**, name the device and choose **Add a passkey**. Complete your device's identity check. Use **Sign in with a passkey** on the sign-in page afterward. A verified passkey satisfies Merran's strong sign-in policy.

In **Settings → You → Two-step sign-in**, enter your current password if your account has one, then choose **Set up authenticator**. Add the displayed **Setup key** to an authenticator as a time-based account, save the **Recovery codes**, and enter an **Authenticator code** to finish. Enrollment is not active until verification succeeds. Each recovery code works once; **Replace recovery codes** invalidates the old set.

**Require strong sign-in for administrators** also applies to existing sessions and external SSO. Administrators must use a verified passkey or an authenticator code before accessing protected data. The policy does not trust an external provider's assurance claim. Turning off enrollment does not bypass an already enrolled person's authenticator.

## External single sign-on

Register Merran as an OIDC client with your identity provider, such as Authentik, Authelia or Keycloak. Set its callback to `https://meals.example.com/api/auth/callback/oidc`, replacing the origin with your own. Enable authorization code with PKCE at the provider.

Set these environment variables on the Merran service and restart it:

```dotenv
MERRAN_PUBLIC_URL=https://meals.example.com
MERRAN_AUTH_OIDC_DISCOVERY=https://identity.example.com/.well-known/openid-configuration
MERRAN_AUTH_OIDC_CLIENT_ID=your-registered-client-id
MERRAN_AUTH_OIDC_CLIENT_SECRET=your-client-secret
```

The discovery URL must be the provider's actual discovery document, including any realm or application path. Provider registration and secret requirements vary; use its settings for a confidential web client.

By default, people first sign into their existing Merran account and choose **Settings → You → Single sign-on → Link single sign-on**. They then authenticate with the external provider. Matching email addresses never link accounts automatically. **Unlink single sign-on** requires another usable sign-in method.

`MERRAN_AUTH_OIDC_ALLOW_SIGNUP=true` permits the configured provider to create accounts. It does not add them to existing households or make them administrators. Leave it off if accounts should be created through Merran's invitation workflow. This release supports one operator-configured OIDC provider.

To require alternative sign-in, set `MERRAN_AUTH_PASSWORDS=false`. Password sign-in remains available until an administrator has a usable linked OIDC identity or a registered passkey. Verify the alternative in another browser before relying on it. Setting the variable back to `true` restores password sign-in. Password recovery does not override this setting.

## OAuth for MCP and REST

External apps can request limited access without asking you to copy an API key. This is separate from signing into Merran with an external identity provider. Merran does not offer a general “Sign in with Merran” service.

Set `MERRAN_PUBLIC_URL` to the stable HTTPS origin and `MERRAN_AUTH_OAUTH=true`, then restart. Localhost is allowed for development. Cloud clients still need network access to this address; OAuth does not expose a private server to the internet.

For MCP, enter `https://meals.example.com/mcp` in a compatible OAuth client. Merran publishes discovery metadata and supports dynamic client registration. Registration alone gives no household access. Sign into Merran, select a household, review the requested permissions, then choose **Allow access** or **Deny access**. MCP permissions allow reading data and creating reviewable proposals; MCP tokens cannot call REST routes.

For ordinary REST integrations, administrators can use **Settings → This server → OAuth applications** to register an **Application name**, **Redirect URL** and **Interface**. Save the **Client ID** and **Client secret** immediately. The integration must use authorization code with S256 PKCE and request the `https://meals.example.com/api` resource. REST write scopes authorize direct changes, which the consent page explains. Client-credentials and identity grants are not supported.

**Settings → You → Connected apps** shows the app, household, permissions, approval date and last use. **Disconnect** invalidates access and refresh tokens immediately. Administrators can choose **Remove application and all connections** to revoke an application's access for everyone.

Access tokens last ten minutes; refresh tokens rotate and expire after thirty days. Access is rechecked against current account state, household membership and the grant. Switching households in the browser does not move an approved connection. Signing out the browser session used for approval ends its token access; reconnect the app if needed. Password changes, password recovery and authenticator recovery disconnect apps. Existing API keys are managed separately.

## Operator recovery and backups

If a person loses both their authenticator and recovery codes, an operator can run:

```bash
docker exec -it merran merran reset-two-factor username-or-email
```

This removes the authenticator, revokes sessions and disconnects OAuth apps. The person can sign in again and enroll a replacement; mandatory administrator verification still applies. Passkeys are not deleted. For a lost password, use the existing interactive `merran reset-password username-or-email` command. It can also establish a recovery password on an SSO-only account; enable password sign-in if operator policy disabled it.

Back up the database and matching server secret together. Authenticator secrets, recovery material, external-provider access tokens and OAuth client secrets are encrypted. Use `merran rotate-secret` to rotate them; replacing the secret file by hand makes encrypted credentials unreadable. See [backup and restore](../backup-restore/).

## Troubleshooting

| What happens                                  | What to check                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Passkeys are missing                          | Enable **Passkeys**, configure the HTTPS public origin, and use that same hostname.            |
| SSO refuses an existing email                 | Sign in normally and use **Link single sign-on**. Email matching does not establish ownership. |
| OAuth will not start                          | Check the public HTTPS origin and `MERRAN_AUTH_OAUTH`, then restart.                           |
| Consent expires                               | Start the connection again; signed authorization requests expire after five minutes.           |
| An MCP token fails on REST                    | Request a separate `/api` resource grant.                                                      |
| A connection stops after sign-out or recovery | Reconnect from the external app.                                                               |

Automated tests cover protocol flows on SQLite and Postgres. Verify your own provider, external MCP client, proxy and device before requiring alternative sign-in for everyone.
