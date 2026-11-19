import crypto from "node:crypto";
import { sql } from "./db.js";

export const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const AUTH_CODE_TTL_SECONDS = 300; // 5 minutes

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

export function sha256Base64Url(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateOpaqueToken(prefix = "kc") {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

export function verifyPkceS256(codeVerifier, codeChallenge) {
  if (typeof codeVerifier !== "string" || typeof codeChallenge !== "string") return false;
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const computed = sha256Base64Url(codeVerifier);
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isAllowedRedirectUri(uri) {
  if (typeof uri !== "string" || uri.length > 512) return false;
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

export function getRequestOrigin(request) {
  const fwdProto = request.headers.get("x-forwarded-proto");
  const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (fwdProto && fwdHost) {
    return `${fwdProto.split(",")[0].trim()}://${fwdHost.split(",")[0].trim()}`;
  }
  return new URL(request.url).origin;
}

export async function registerOAuthClient({ clientName, redirectUris, grantTypes, tokenEndpointAuthMethod }) {
  const validUris = Array.isArray(redirectUris) ? redirectUris.filter(isAllowedRedirectUri) : [];
  if (!validUris.length) {
    throw new Error("Informe ao menos uma redirect_uri HTTPS válida.");
  }
  const clientId = `kc_cli_${crypto.randomBytes(16).toString("hex")}`;
  const name = String(clientName || "ChatGPT MCP").trim().slice(0, 120) || "ChatGPT MCP";
  const grants = Array.isArray(grantTypes) && grantTypes.length
    ? grantTypes.filter((g) => ["authorization_code", "refresh_token"].includes(g))
    : ["authorization_code", "refresh_token"];
  const authMethod = tokenEndpointAuthMethod === "none" ? "none" : "none";

  await sql`
    INSERT INTO public.kc_oauth_clients(client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
    VALUES (${clientId}, ${name}, ${validUris}, ${grants}, ${authMethod})
  `;
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: validUris,
    grant_types: grants,
    response_types: ["code"],
    token_endpoint_auth_method: authMethod,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export async function getOAuthClient(clientId) {
  if (typeof clientId !== "string" || !clientId.trim()) return null;
  const rows = await sql`
    SELECT client_id, client_name, redirect_uris, grant_types, token_endpoint_auth_method
    FROM public.kc_oauth_clients
    WHERE client_id = ${clientId.trim()}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function issueAuthorizationCode({
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  scope = "mcp:read mcp:write",
  resource = null,
}) {
  const code = generateOpaqueToken("kccode");
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString();

  await sql`
    INSERT INTO public.kc_oauth_codes(code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
    VALUES (${codeHash}, ${clientId}, ${userId}, ${redirectUri}, ${codeChallenge}, 'S256', ${scope}, ${resource}, ${expiresAt}::timestamptz)
  `;
  return code;
}

export async function exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier }) {
  const codeHash = sha256Hex(code);
  const rows = await sql`
    SELECT c.code_hash, c.client_id, c.user_id, c.redirect_uri, c.code_challenge, c.scope, c.resource, c.expires_at, c.used_at, cl.client_name
    FROM public.kc_oauth_codes c
    JOIN public.kc_oauth_clients cl ON cl.client_id = c.client_id
    WHERE c.code_hash = ${codeHash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: "invalid_grant", description: "Código de autorização inválido." };
  if (row.used_at) return { ok: false, error: "invalid_grant", description: "Código já utilizado." };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, error: "invalid_grant", description: "Código expirado." };
  if (row.client_id !== clientId) return { ok: false, error: "invalid_grant", description: "client_id divergente." };
  if (redirectUri && row.redirect_uri !== redirectUri) return { ok: false, error: "invalid_grant", description: "redirect_uri divergente." };
  if (!verifyPkceS256(codeVerifier, row.code_challenge)) {
    return { ok: false, error: "invalid_grant", description: "Validação PKCE S256 falhou." };
  }

  await sql`UPDATE public.kc_oauth_codes SET used_at = now() WHERE code_hash = ${codeHash}`;

  const accessToken = generateOpaqueToken("kcat");
  const refreshToken = generateOpaqueToken("kcrt");
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  await sql`
    INSERT INTO public.kc_oauth_tokens(user_id, client_id, client_name, access_token_hash, refresh_token_hash, scope, resource, expires_at, refresh_expires_at)
    VALUES (${row.user_id}, ${row.client_id}, ${row.client_name || "ChatGPT"}, ${sha256Hex(accessToken)}, ${sha256Hex(refreshToken)}, ${row.scope}, ${row.resource}, ${expiresAt}::timestamptz, ${refreshExpiresAt}::timestamptz)
  `;

  return {
    ok: true,
    token: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: row.scope,
    },
  };
}

export async function refreshAccessToken({ refreshToken, clientId }) {
  const refreshHash = sha256Hex(refreshToken);
  const rows = await sql`
    SELECT id, user_id, client_id, client_name, scope, resource, refresh_expires_at, revoked_at
    FROM public.kc_oauth_tokens
    WHERE refresh_token_hash = ${refreshHash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.revoked_at) return { ok: false, error: "invalid_grant", description: "Refresh token inválido ou revogado." };
  if (clientId && row.client_id !== clientId) return { ok: false, error: "invalid_grant", description: "client_id divergente." };
  if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "invalid_grant", description: "Refresh token expirado." };
  }

  const newAccessToken = generateOpaqueToken("kcat");
  const newRefreshToken = generateOpaqueToken("kcrt");
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  await sql`UPDATE public.kc_oauth_tokens SET revoked_at = now() WHERE id = ${row.id}::uuid`;
  await sql`
    INSERT INTO public.kc_oauth_tokens(user_id, client_id, client_name, access_token_hash, refresh_token_hash, scope, resource, expires_at, refresh_expires_at)
    VALUES (${row.user_id}, ${row.client_id}, ${row.client_name}, ${sha256Hex(newAccessToken)}, ${sha256Hex(newRefreshToken)}, ${row.scope}, ${row.resource}, ${expiresAt}::timestamptz, ${refreshExpiresAt}::timestamptz)
  `;

  return {
    ok: true,
    token: {
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: row.scope,
    },
  };
}

export async function verifyBearerToken(authHeader) {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw) return null;
  const hash = sha256Hex(raw);
  const rows = await sql`
    SELECT id, user_id, client_id, client_name, scope, expires_at, revoked_at
    FROM public.kc_oauth_tokens
    WHERE access_token_hash = ${hash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  await sql`UPDATE public.kc_oauth_tokens SET last_used_at = now() WHERE id = ${row.id}::uuid`;
  return { tokenId: row.id, userId: row.user_id, clientId: row.client_id, clientName: row.client_name, scope: row.scope };
}

export async function listUserOAuthTokens(userId) {
  return sql`
    SELECT id, client_id, client_name, scope, expires_at, last_used_at, created_at
    FROM public.kc_oauth_tokens
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `;
}

export async function revokeUserOAuthToken(userId, tokenId) {
  await sql`
    UPDATE public.kc_oauth_tokens
    SET revoked_at = now()
    WHERE id = ${tokenId}::uuid AND user_id = ${userId} AND revoked_at IS NULL
  `;
}

export async function recordMcpAudit(userId, toolName, status = "ok") {
  try {
    await sql`
      INSERT INTO public.kc_mcp_audit_logs(user_id, tool_name, status)
      VALUES (${userId}, ${String(toolName || "unknown").slice(0, 80)}, ${String(status || "ok").slice(0, 24)})
    `;
  } catch {
    // Non-blocking audit log
  }
}
