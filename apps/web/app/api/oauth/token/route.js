import { exchangeAuthorizationCode, refreshAccessToken } from "../../../../lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: TOKEN_HEADERS });
}

async function parseTokenBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return request.json().catch(() => ({}));
  }
  const text = await request.text();
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}

export async function POST(request) {
  try {
    const body = await parseTokenBody(request);
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      if (!body.code || !body.client_id || !body.code_verifier) {
        return Response.json(
          { error: "invalid_request", error_description: "code, client_id e code_verifier são obrigatórios." },
          { status: 400, headers: TOKEN_HEADERS }
        );
      }
      const res = await exchangeAuthorizationCode({
        code: body.code,
        clientId: body.client_id,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier,
      });
      if (!res.ok) {
        return Response.json(
          { error: res.error, error_description: res.description },
          { status: 400, headers: TOKEN_HEADERS }
        );
      }
      return Response.json(res.token, { status: 200, headers: TOKEN_HEADERS });
    }

    if (grantType === "refresh_token") {
      if (!body.refresh_token) {
        return Response.json(
          { error: "invalid_request", error_description: "refresh_token é obrigatório." },
          { status: 400, headers: TOKEN_HEADERS }
        );
      }
      const res = await refreshAccessToken({
        refreshToken: body.refresh_token,
        clientId: body.client_id,
      });
      if (!res.ok) {
        return Response.json(
          { error: res.error, error_description: res.description },
          { status: 400, headers: TOKEN_HEADERS }
        );
      }
      return Response.json(res.token, { status: 200, headers: TOKEN_HEADERS });
    }

    return Response.json(
      { error: "unsupported_grant_type", error_description: "Grant type não suportado." },
      { status: 400, headers: TOKEN_HEADERS }
    );
  } catch (e) {
    console.error("oauth-token", e?.name);
    return Response.json(
      { error: "server_error", error_description: "Falha ao emitir token." },
      { status: 500, headers: TOKEN_HEADERS }
    );
  }
}
