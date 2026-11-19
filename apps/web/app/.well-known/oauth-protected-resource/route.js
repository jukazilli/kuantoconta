import { getRequestOrigin } from "../../../lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const origin = getRequestOrigin(request);
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      scopes_supported: ["mcp:read", "mcp:write"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/legal/terms`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
