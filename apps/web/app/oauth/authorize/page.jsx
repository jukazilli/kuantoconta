import { redirect } from "next/navigation";
import { getIdentity, legalAccepted } from "../../../lib/authorization";
import { getOAuthClient } from "../../../lib/oauth";
import AuthorizeConsent from "./AuthorizeConsent";

export const dynamic = "force-dynamic";

export default async function OAuthAuthorizePage({ searchParams }) {
  const params = await searchParams;
  const user = await getIdentity();
  if (!user) {
    const qs = new URLSearchParams(params || {}).toString();
    const nextUrl = `/oauth/authorize${qs ? `?${qs}` : ""}`;
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(nextUrl)}`);
  }
  if (!(await legalAccepted(user.id))) {
    redirect("/legal/accept");
  }

  const clientId = String(params?.client_id || "");
  const redirectUri = String(params?.redirect_uri || "");
  const responseType = String(params?.response_type || "");
  const codeChallenge = String(params?.code_challenge || "");
  const codeChallengeMethod = String(params?.code_challenge_method || "S256");
  const state = String(params?.state || "");
  const scope = String(params?.scope || "mcp:read mcp:write");
  const resource = String(params?.resource || "");

  const client = await getOAuthClient(clientId);
  let validationError = "";
  if (!client) validationError = "Aplicativo OAuth não registrado.";
  else if (responseType !== "code") validationError = "response_type deve ser 'code'.";
  else if (!client.redirect_uris.includes(redirectUri)) validationError = "redirect_uri não corresponde ao aplicativo.";
  else if (!codeChallenge || codeChallengeMethod !== "S256") validationError = "PKCE S256 é obrigatório.";

  return (
    <AuthorizeConsent
      user={{ name: user.name || user.email, email: user.email }}
      clientName={client?.client_name || "ChatGPT / MCP"}
      validationError={validationError}
      oauthParams={{
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        state,
        scope,
        resource,
      }}
    />
  );
}
