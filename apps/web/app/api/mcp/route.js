import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { legalAccepted } from "../../../lib/authorization";
import { getRequestOrigin, verifyBearerToken } from "../../../lib/oauth";
import { createKuantoContaMcpServer } from "../../../lib/mcp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
    "Cache-Control": "private, no-store, max-age=0",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function handleMcpRequest(request) {
  const origin = getRequestOrigin(request);
  const auth = await verifyBearerToken(request.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: "unauthorized", error_description: "Token OAuth 2.1 ausente ou expirado." },
      {
        status: 401,
        headers: {
          ...corsHeaders(),
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"`,
        },
      }
    );
  }

  if (!(await legalAccepted(auth.userId))) {
    return Response.json(
      { error: "forbidden", error_description: "Aceite os Termos de Uso no KuantoConta antes de usar via MCP." },
      { status: 403, headers: corsHeaders() }
    );
  }

  const server = createKuantoContaMcpServer(auth.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  const response = await transport.handleRequest(request);

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function POST(request) {
  return handleMcpRequest(request);
}

export async function GET(request) {
  return handleMcpRequest(request);
}

export async function DELETE(request) {
  return handleMcpRequest(request);
}
