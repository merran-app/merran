# Authentication and connected apps

Decided October 19, 2026. This round covers passwords, passkeys, authenticator-based two-step sign-in, external OIDC single sign-on, and OAuth access to Merran's MCP and REST interfaces. It does not make Merran a general identity provider: “Sign in with Merran”, OIDC identity scopes and machine-to-machine grants are outside this round.

## Status

Implemented, not released. Browser sessions, API keys and OAuth credentials are distinct. Passkeys, TOTP and recovery codes, one operator-configured OIDC provider, and OAuth authorization-code connections for MCP and REST are available behind opt-in settings. Automated protocol tests run on SQLite and Postgres. Real-provider, physical authenticator, external MCP client and TrueNAS/Dockge acceptance remain deployment checks; earlier successful MCP testing used API keys.

## Identity and authorization

Better Auth establishes identity and implements protocols. Merran owns household membership, roles, permissions and grants. A grant belongs to a person, a client and one household. The browser's active household is not the grant's household after approval. Leaving that household, losing the necessary role, being banned, revoking the grant or disabling the client stops access.

Every authenticated request carries an explicit credential kind. A credential does not become a session because it lacks an API-key identifier or because its person is a server administrator. Session-only operations remain session-only. Invalid or malformed Authorization headers never fall back to browser cookies. OAuth protocol endpoints handle client authentication ahead of resource authentication: HTTP Basic client credentials at the token endpoint are not interpreted as a household bearer token.

Data permissions use the existing areas: household, recipes, plan, list, pantry, imports and assistant. Write includes read in that area. Household access is read-only; delegated credentials cannot administer households or the server. Unknown OAuth scopes grant nothing.

The REST API and MCP are separate resources and token audiences. An MCP token cannot call REST writes to bypass proposals. REST clients request direct write access separately and consent explains that effect. API keys keep their existing behavior: REST writes remain direct and MCP writes remain proposals.

## Sign-in methods and policies

- Password sign-in stays available during migration. An operator may disable it only after configuring and verifying an alternative and preserving operator recovery.
- Passkeys require a configured, stable origin and relying-party identity, verified WebAuthn challenges and appropriate user verification. Registration requires an authenticated person; this is not an alternate open-signup route.
- Two-step sign-in uses authenticator codes and single-use recovery codes. Enrollment is incomplete until a code is verified. Secrets and recovery material must not appear in logs or ordinary account responses.
- External OIDC providers are operator-controlled, with an explicit create-account or link-existing policy. No automatic linking by matching email: Merran's existing email addresses are unverified. Linking requires proof of control of both identities. Removing a sign-in method must not remove the last usable method.
- A shared authentication-strength policy applies to password, SSO and passkey flows before protected access and OAuth approval. Operator-required two-step sign-in for administrators must also cover existing sessions. Define how verified passkeys satisfy that policy, and do not trust an upstream provider's assurance claim without an explicit configured mapping.
- Recovery, disabling methods, password changes and administrative account changes need explicit session and grant invalidation rules. A normal logout and revoking an integration are separate actions.

Implementation decision, October 19, 2026: the Better Auth 1.7.8 two-factor hook challenges password sign-ins, but does not itself enforce policy across SSO. Merran records strong authentication only after verified TOTP, recovery-code or user-verified WebAuthn ceremonies. Shared session guards enforce enrolled two-factor and mandatory administrator policy, including existing sessions and OAuth consent. Upstream OIDC assurance claims do not satisfy that policy. Better Auth's WebAuthn callbacks explicitly reject assertions without user verification.

Method removal checks ownership and the remaining usable methods in the same write transaction, preventing concurrent removal of the final two methods. OIDC unlinking retains Better Auth's fresh-session requirement. Password sign-in cannot be disabled until a non-banned administrator has a usable alternative. Operator recovery can establish a password for an SSO-only account and reset a lost authenticator; recovery revokes sessions and OAuth grants.

## OAuth connections

Use the Better Auth OAuth Provider plugin, with package versions aligned with Better Auth and respecting pnpm's minimum release age. Confirm the installed package's behavior rather than relying on current online examples alone.

Authorization code plus S256 PKCE is implemented. Opaque access tokens expire after ten minutes; rotating refresh tokens expire after thirty days, without a reuse grace interval. Authorization codes and signed pending requests expire after five minutes. Tokens are stored as hashes, client secrets are encrypted, and protocol state lives in the database. Merran's persistent server secret protects signed pending requests; this implementation does not issue JWT access tokens or maintain a separate signing-key service.

Support administrator-managed clients for ordinary REST integrations and the client registration mechanisms required by tested MCP clients. Dynamic registration is not a grant of user access. Rate-limit public registration; do not blindly fetch arbitrary client metadata or icons. Keep identity scopes, client-credentials grants and unrelated provider endpoints closed.

Login and approval are ordinary Merran pages. Preserve a validated pending authorization request through password, SSO, two-step verification and recovery. Select the household explicitly. Consent identifies the app, resource, household and requested permissions, distinguishes direct REST writes from MCP proposals, and offers refusal.

Personal settings show Connected apps: client, household, permissions, when approved, last use and revoke. Server settings manage clients and authentication policy. Mobile overlays use drawers; the consent flow itself uses a dedicated page.

Revocation must invalidate active access as well as refresh. Signature-only JWT checks are insufficient for immediate revocation: validate current grant, client, membership and account state on requests, or use an equivalent revocation-aware mechanism. Token refresh cannot widen scopes or change households.

Current lifetime decision, October 19, 2026: delegated access also requires the original issuing browser session to exist and remain unexpired. Signing out that session ends access, but does not erase the consent record; Disconnect explicitly removes the grant and its tokens. Password changes and recovery remove grants. This conservative session binding means integrations may need reconnecting after browser sign-out. API keys remain independently managed. A future change to persistent grants must preserve explicit recovery and revocation guarantees.

## Delivery and acceptance

1. Shared authentication and permission foundation, preserving existing session and API-key behavior.
2. Sign-in methods, account linking, recovery and operator policy. Verify each allowed method and each forbidden bypass.
3. OAuth provider, consent, connection management, MCP discovery and REST authentication.

Each stage updates internal plans, public documentation marked unreleased, generated API clients, settings references and any schema migrations. MikroORM remains the single migration authority for SQLite and Postgres.

Acceptance includes:

- Existing password sessions and API keys retain their allowed access and limitations.
- Delegated tokens cannot reach session-only account/admin operations, borrow a browser cookie or cross resource audiences.
- Passkey challenge binding, failed/cancelled ceremonies, key removal and last-method protection.
- TOTP enrollment, wrong codes, recovery-code reuse, rate limits, lost-device recovery and mandatory administrator assurance.
- OIDC state/nonce/issuer checks, callback validation, explicit linking, signup policy and failures without account takeover.
- OAuth approval and refusal, household binding, code replay, invalid PKCE, expired/revoked tokens, refresh reuse, scope escalation, disabled clients and removed members.
- A real MCP client and a non-MCP REST client, with disjoint resource access.
- Restart and deployment tests on SQLite and Postgres, including TrueNAS/Dockge and proxy URL configuration.

## References

- [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth passkeys](https://better-auth.com/docs/plugins/passkey)
- [Better Auth two-factor authentication](https://better-auth.com/docs/plugins/2fa)
- [Better Auth SSO](https://better-auth.com/docs/plugins/sso)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
