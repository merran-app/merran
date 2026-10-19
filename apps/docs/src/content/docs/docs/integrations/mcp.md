---
title: Connect an AI app with MCP
description: Connect a compatible AI app to your household with an API key and review its suggestions in Merran.
---

:::note[Not released yet]
MCP is implemented after alpha.4. These instructions apply to builds containing this change.

API key setup opens in a drawer on mobile and a dialog on larger screens. The generated key and connection details appear there after creation.
:::

Merran serves MCP over Streamable HTTP at `/mcp`. A compatible client can read the kitchen data you allow and suggest recipes, recipe edits, meals and shopping items. All MCP changes wait in **Recipes → Review**. The external app supplies its own model; these tools do not call a Merran AI provider.

## Connect

1. Switch to the household the app should use.
2. Open **Settings → You → API keys → Use with an AI app**. Give the key a recognizable name and choose its expiry and permissions. Start with read access; add write access only for areas where you want proposals.
3. Make the key and save it while it is shown. Copy the **MCP server URL** and **Authorization header value** into a client that supports Streamable HTTP and bearer tokens. The header name is `Authorization`; its value starts with `Bearer mrn_`.
4. Ask the app to list Merran's tools or search your recipes. Tools it cannot use are omitted from the list.
5. Follow the returned review link after asking for a change. Read the proposal and apply or dismiss it in Merran. New recipes include **Review the full recipe** before saving; recipe edits let you choose individual sections.

The client needs network access to the server. A local client can use a reachable LAN address; a cloud client cannot reach your private LAN without an appropriate connection. Use HTTPS for connections outside a trusted local network. Set `MERRAN_PUBLIC_URL` for absolute review links. Without it, results return the relative path `/recipes/review`. Browser clients that send an Origin must match the configured public origin; cross-origin browser access is not enabled.

This is a regular Merran API key. Its write permissions also authorize direct changes through the REST API; MCP's proposal-only behavior does not make the key itself proposal-only. Revoking it in **API keys**, expiry, or leaving its household stops subsequent MCP requests. Switching households in the web app does not move the key to another household.

### Claude Code

Claude Code supports Streamable HTTP with an Authorization header. Replace the example address and key in your own terminal:

```sh
claude mcp add --transport http merran https://meals.example.com/mcp --header "Authorization: Bearer YOUR_MERRAN_KEY"
```

Use `/mcp` in Claude Code to check the connection. Keep the key out of shared project configuration, source control and screenshots. See [Claude Code's MCP instructions](https://code.claude.com/docs/en/mcp) for configuration scopes and credential options.

### Other clients

Use the same URL and bearer header in any client that supports them. An OAuth-only remote connector is not compatible with this first version: Merran does not yet provide MCP OAuth discovery or a sign-in flow. Do not assume that a Claude Desktop or ChatGPT connector accepts a raw API key merely because it supports MCP. Check the client's supported authentication methods.

## Tools and permissions

Write access includes read access. These are the same permissions used by the REST API.

| Tools                                       | Required access               |
| ------------------------------------------- | ----------------------------- |
| `search_recipes`, `get_recipe`, `list_tags` | Recipes: read                 |
| `get_meal_plan`, `get_household_tastes`     | Plan: read                    |
| `get_shopping_list`                         | Shopping list: read           |
| `get_pantry`                                | Pantry: read                  |
| `propose_new_recipe`, `propose_recipe_edit` | Recipes: write                |
| `propose_meals`                             | Plan: write and Recipes: read |
| `propose_list_items`                        | Shopping list: write          |

`get_recipe` includes dietary warnings only when the key also has Plan read access. Meal proposals use the assistant's existing allergy checks. There is no MCP tool to apply a proposal, change household tastes, import from the web, scan receipts or generate media. Those workflows remain in Merran; optional direct application of plan/list proposals is future work.

MCP requests share the existing limit of 300 requests per minute per key with REST requests. The endpoint accepts request bodies up to 1 MiB. It is stateless, reauthenticates each request, and supports current protocol requests and the SDK's legacy Streamable HTTP negotiation. It does not expose the old standalone SSE transport, persistent sessions or subscriptions. A GET to `/mcp` is not a tool-list page; clients use the protocol's `tools/list` request.

## Troubleshooting

| What happens                                  | What to check                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 401                                           | Send the bearer key, not a browser session cookie. Check expiry and revocation.                                                               |
| 403 with `invalid_origin`                     | A browser client's Origin must match `MERRAN_PUBLIC_URL`. Native clients normally omit Origin.                                                |
| A tool is missing                             | Check the key's area permissions, including Recipes read access for meal proposals.                                                           |
| A suggestion was returned but nothing changed | Open **Recipes → Review**. Proposing never applies it.                                                                                        |
| The connection asks for OAuth                 | Use a client that accepts a bearer header; OAuth is not implemented yet.                                                                      |
| 429                                           | Wait for the `Retry-After` interval. REST and MCP share the key's allowance.                                                                  |
| A connection was interrupted                  | Check Review before asking again. A completed proposal may exist even if the client missed its response; retries can create another proposal. |

Automated checks exercise the official TypeScript client, legacy negotiation, permissions, household isolation and proposal review. Real-client installation and network/proxy acceptance remain separate checks.
