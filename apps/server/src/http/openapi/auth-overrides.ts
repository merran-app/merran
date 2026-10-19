/** Merran adds household selection and connection metadata to the provider's protocol schemas. */
export function authOverrides(
  path: string,
  operation: Record<string, unknown>
) {
  const result = structuredClone(operation)
  const responses = (result.responses ?? {}) as Record<string, unknown>
  const json = (schema: unknown) => ({
    description: "Success.",
    content: { "application/json": { schema } },
  })
  if (path === "/oauth2/continue" || path === "/oauth2/consent") {
    const body = result.requestBody as {
      content: Record<
        string,
        { schema: { properties: Record<string, unknown>; required?: string[] } }
      >
    }
    const schema = body.content["application/json"]!.schema
    schema.properties.householdId = {
      type: "string",
      description: "The household explicitly selected by the person.",
    }
    schema.required = [
      ...new Set([...(schema.required ?? []), "householdId", "oauth_query"]),
    ]
    responses["200"] = json({
      type: "object",
      properties: { redirect: { type: "boolean" }, url: { type: "string" } },
      required: ["redirect", "url"],
    })
  }
  if (path === "/oauth2/get-consents") {
    const nullable = { type: ["string", "null"] }
    responses["200"] = json({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clientId: { type: "string" },
          name: nullable,
          householdName: nullable,
          referenceId: nullable,
          scopes: { type: "array", items: { type: "string" } },
          resources: { type: ["array", "null"], items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: nullable,
        },
        required: [
          "id",
          "clientId",
          "name",
          "householdName",
          "referenceId",
          "scopes",
          "resources",
          "createdAt",
          "lastUsedAt",
        ],
      },
    })
  }
  if (path === "/oauth2/delete-consent")
    responses["200"] = json({
      type: "object",
      properties: { status: { type: "boolean" } },
      required: ["status"],
    })
  result.responses = responses
  return result
}
