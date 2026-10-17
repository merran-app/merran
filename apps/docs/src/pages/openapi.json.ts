import schema from "../../../server/src/http/openapi/openapi.json?raw"

export function GET() {
  return new Response(schema, {
    headers: { "Content-Type": "application/json" },
  })
}
