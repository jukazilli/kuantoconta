import { getIdentity, sameOrigin, PRIVATE_HEADERS } from "../../../../lib/authorization";
import { listUserOAuthTokens, revokeUserOAuthToken } from "../../../../lib/oauth";
import { isUuid } from "../../../../lib/portfolio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getIdentity();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const connections = await listUserOAuthTokens(user.id);
    return Response.json({ connections }, { headers: PRIVATE_HEADERS });
  } catch (e) {
    // Gracefully return empty if migration 011 has not been applied yet
    if (e?.code === "42P01") return Response.json({ connections: [] }, { headers: PRIVATE_HEADERS });
    console.error("oauth-connections-get", e?.name);
    return Response.json({ error: "Falha ao listar conexões." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function DELETE(request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Origem não permitida." }, { status: 403, headers: PRIVATE_HEADERS });
  }
  const user = await getIdentity();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const body = await request.json().catch(() => ({}));
    if (!isUuid(body.id)) {
      return Response.json({ error: "Conexão inválida." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    await revokeUserOAuthToken(user.id, body.id);
    return Response.json({ revoked: true }, { headers: PRIVATE_HEADERS });
  } catch (e) {
    console.error("oauth-connections-delete", e?.name);
    return Response.json({ error: "Falha ao revogar conexão." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
