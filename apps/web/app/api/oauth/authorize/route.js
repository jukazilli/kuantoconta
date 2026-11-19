import { getIdentity, legalAccepted, sameOrigin, PRIVATE_HEADERS } from "../../../../lib/authorization";
import { getOAuthClient, issueAuthorizationCode } from "../../../../lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Origem não permitida." }, { status: 403, headers: PRIVATE_HEADERS });
  }
  const user = await getIdentity();
  if (!user) {
    return Response.json({ error: "Sessão não autenticada." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  if (!(await legalAccepted(user.id))) {
    return Response.json({ error: "Aceite os Termos de Uso antes de conectar." }, { status: 403, headers: PRIVATE_HEADERS });
  }

  try {
    const body = await request.json();
    const client = await getOAuthClient(body.clientId);
    if (!client) {
      return Response.json({ error: "Aplicativo OAuth não encontrado." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (!client.redirect_uris.includes(body.redirectUri)) {
      return Response.json({ error: "redirect_uri não autorizada para este aplicativo." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const target = new URL(body.redirectUri);
    if (body.decision !== "approve") {
      target.searchParams.set("error", "access_denied");
      if (body.state) target.searchParams.set("state", body.state);
      return Response.json({ redirectTo: target.toString() }, { headers: PRIVATE_HEADERS });
    }
    if (!body.codeChallenge || body.codeChallengeMethod !== "S256") {
      return Response.json({ error: "PKCE S256 é obrigatório." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const code = await issueAuthorizationCode({
      clientId: client.client_id,
      userId: user.id,
      redirectUri: body.redirectUri,
      codeChallenge: body.codeChallenge,
      scope: body.scope || "mcp:read mcp:write",
      resource: body.resource || null,
    });
    target.searchParams.set("code", code);
    if (body.state) target.searchParams.set("state", body.state);
    return Response.json({ redirectTo: target.toString() }, { headers: PRIVATE_HEADERS });
  } catch (e) {
    console.error("oauth-authorize", e?.name);
    return Response.json({ error: "Falha ao autorizar conexão." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
