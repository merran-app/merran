---
title: Make your first API request
description: Connect a script using a household-scoped Merran API key.
---

The web app, browser extension, and external integrations use the same API. The endpoint reference is generated from the server's committed OpenAPI schema.

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

- [Endpoint reference](./reference/): routes, schemas, permissions, and examples.
- <a href="../../openapi.json" download="merran-openapi.json">Download OpenAPI JSON</a>: use it in an API client or generate types.
- Your server's **/api/docs**: interactive API explorer.
- Your server's **/api/openapi.json**: schema for the version you actually run.

This public site does not need your key. Use your own instance's explorer for authenticated requests. During alpha, the API may change between releases; prefer your running instance's schema when versions differ.
