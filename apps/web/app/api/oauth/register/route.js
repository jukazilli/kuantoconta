import { registerOAuthClient } from "../../../../lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const client = await registerOAuthClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      grantTypes: body.grant_types,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    });
    return Response.json(client, { status: 201, headers: CORS_HEADERS });
  } catch (e) {
    return Response.json(
      { error: "invalid_client_metadata", error_description: e?.message || "Metadados inválidos." },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
