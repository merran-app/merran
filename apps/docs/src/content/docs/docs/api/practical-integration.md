---
title: Build a recipe-index integration
description: Use scoped keys, pagination, and bounded retries to read a household's recipe index.
---

This tutorial reads recipe names and IDs into a JSON file. It makes no changes and is not a household export or server backup. The example was exercised against the published **0.1.0-alpha.1** image with synthetic recipes.

## Before you start

Install Node.js 24 or later and make sure this computer can reach your server. Open **Settings → You → API keys** in the intended household, create a dedicated key with **recipes:read**, and copy its secret once. Keep it in a local environment variable or your integration's secret store; never put it in a public webpage, URL, repository, or screenshot.

## Choose the smallest permission set

| Task                                     | Permission object when creating a key |
| ---------------------------------------- | ------------------------------------- |
| Read recipes                             | `{ "recipes": "read" }`               |
| Add/edit recipes                         | `{ "recipes": "write" }`              |
| Add links through `/api/share`           | `{ "imports": "write" }`              |
| Read a plan and maintain a shopping list | `{ "plan": "read", "list": "write" }` |
| Read pantry stock                        | `{ "pantry": "read" }`                |

These are independent areas: recipe write access does not automatically grant import or list access. Write includes read within the same area. Keys belong to one household and cannot select another by changing a request parameter. Account and administrative routes can require a signed-in session even for a key's owner. The generated schema's `x-merran-permission` and security declarations describe each route.

## Read one page

In Bash, set the URL and load the key without echoing it:

```bash
export MERRAN_URL='https://food.example.com'
read -rs -p 'Merran API key: ' MERRAN_API_KEY; echo
export MERRAN_API_KEY
curl --fail-with-body "$MERRAN_URL/api/recipes?limit=1&offset=0&sort=name" \
  -H "Authorization: Bearer $MERRAN_API_KEY"
```

**Expected result:** JSON with a `recipes` array and a `total` count. An empty library returns an empty array. Recipe listing uses `limit` (1–100, default 48) and `offset` (default 0), not a cursor or a universal `page` parameter. Fetch the next page by increasing the offset by the number of returned recipes. Other endpoints have their own response shapes and pagination; consult their reference rather than assuming this convention everywhere.

## Run the complete example

Download <a href="../../../examples/recipe-index.mjs" download>recipe-index.mjs</a>, inspect it, and run:

```bash
node recipe-index.mjs > recipe-index.json
```

In PowerShell, use `$env:MERRAN_URL` and `$env:MERRAN_API_KEY` for environment variables instead of `export`; obtain the key privately rather than putting it in shell history.

The script reads pages in name order, deduplicates by recipe ID, times out stalled requests, refuses redirects, and retries HTTP 429 responses a bounded number of times. It prints only IDs, names, and slugs. Check the process exit status before consuming the file: shell redirection can leave an empty file when the command fails.

**Expected result:** One JSON array of the household's recipe summaries. Pagination is not a frozen database snapshot: concurrent inserts, deletes, or renames can shift offsets. Run again while the library is quiet if completeness matters. Use the supported export or backup workflow for recovery, not this index.

## Handle errors and limits

Merran application routes normally return:

```json
{
  "error": {
    "code": "missing_permission",
    "message": "This API key can't read list."
  }
}
```

Validation errors can include `error.fields`. Authentication-library endpoints or a reverse proxy can return a different body, including non-JSON errors. Handle the HTTP status first; retain `X-Request-Id` for operator troubleshooting without logging the authorization header.

| Status    | Action                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------- |
| 400       | Fix fields or request format; inspect `error.fields` when present.                                 |
| 401       | Check the key, expiration/revocation, and whether the owner still has access.                      |
| 403       | Check the permission and whether the endpoint accepts keys at all.                                 |
| 404       | Check the path, identifier, and household; do not assume another household's object is accessible. |
| 409 / 410 | Resolve the conflict or stale/deleted resource before retrying.                                    |
| 413 / 422 | Reduce the payload or resolve an unsupported/unprocessable input.                                  |
| 429       | Respect `Retry-After` when provided; otherwise back off and retry sparingly.                       |
| 500 / 502 | Inspect the request ID and server/upstream status; avoid an unbounded retry loop.                  |

In alpha.1, authenticated API keys are limited to **300 requests per 60-second window per key**. The counter is in memory and resets with the server. Exceeding it returns 429 and `Retry-After` in seconds. Sign-in/setup, AI providers, and other upstream services have separate limits; this is not a guarantee that every request below 300 succeeds.

Retrying a read is usually safe. Do not automatically replay imports, cart transfers, or other writes after an ambiguous network failure: the first request may have succeeded. There is no universal idempotency-key guarantee in this API.

## Next steps

Use [live events](../live-events/) to refresh when data changes, and the [endpoint reference](../reference/) for complete schemas. Revoke test keys after use. If versions differ, prefer your server's `/api/openapi.json` over the site's generated reference.
