---
title: Make your first API request
description: Connect a script using a household-scoped Merran API key.
---

The web app, browser extension, and external integrations use the same API. The endpoint reference is generated from the server's committed OpenAPI schema.

:::note[Not released yet]
Initial claiming now commits the account, password credentials and household together. If sign-in or the connection fails afterward, try signing in before retrying setup. `GET/PATCH /api/auth/me/onboarding` use browser sessions to remember personal tour choices and household progress; only household owners/admins can mark household preferences reviewed. These changes are in development. Password confirmation is a web-form check and is not an additional API field.

Household admins can queue an address-bound invitation with `POST /api/households/current/invites/email` and resend with `POST /api/households/current/invites/{inviteId}/resend`; both require browser sessions. The response contains delivery state, never a token or link. `GET /api/auth/join/{token}` includes the invited address for email invitations, and joining with another address returns `403 invite_email_mismatch`. The invited account must still sign in or register and explicitly join. `429` limits sends to 20 per household per hour and resends to once per minute; resending keeps the original expiry. SMTP acceptance is not an inbox-delivery receipt.

The separate password-recovery update adds public `POST /api/auth/password-reset/request` with `{ email }` and `POST /api/auth/password-reset/complete` with `{ token, password }`. Requests return `{ requested: true }` for known/unknown accounts, unavailable SMTP and per-recipient suppression. Client-address limits return `429` with `Retry-After`; limits are five requests or ten completions per 15-minute fixed window, plus three queued emails per recipient. Completion rejects invalid, used, expired or credential-superseded tokens with `400`, changes the password and revokes sessions atomically, and returns `{ reset: true }` without signing in. Tokens expire after 30 minutes, appear in the emailed web URL fragment, and are sent to the API only in the JSON body. Both responses use `Cache-Control: no-store`. Account email verification is skipped; recovery never sets emailVerified.
:::

## Create a key

Sign in to Merran and open your personal API key settings. Create a key for the intended household and grant only the permissions your integration needs. Store the returned secret securely.

Keys are scoped to a household. A key's permissions determine which areas it can read or change. Routes without API-key support require a browser session instead; check each endpoint's security requirements.

## Check the key

Replace the address and placeholder key with your own:

```bash
curl --fail-with-body http://localhost:3000/api/auth/api-keys/current \
  -H "Authorization: Bearer YOUR_MERRAN_API_KEY"
```

This endpoint returns the current key's details. A successful response confirms that the server accepted it.

## Read your recipes

Grant recipes:read to the key, then call:

```bash
curl --fail-with-body http://localhost:3000/api/recipes \
  -H "Authorization: Bearer YOUR_MERRAN_API_KEY"
```

Check the generated reference for response fields and pagination parameters. Missing permissions produce an error rather than access to another household.

## Explore the API

For permission examples, pagination, errors, rate limits, and a runnable script, follow [Build a recipe-index integration](./practical-integration/). Then [listen for live changes](./live-events/) to keep a client refreshed.

- [Endpoint reference](./reference/): routes, schemas, permissions, and examples.
- <a href="../../openapi.json" download="merran-openapi.json">Download OpenAPI JSON</a>: use it in an API client or generate types.
- Your server's **/api/docs**: interactive API explorer.
- Your server's **/api/openapi.json**: schema for the version you actually run.

This public site does not need your key. Use your own instance's explorer for authenticated requests. During alpha, the API may change between releases; prefer your running instance's schema when versions differ.
