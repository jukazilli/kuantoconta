-- Migration 011: OAuth 2.1 (PKCE) and MCP audit tables for ChatGPT remote MCP integration

CREATE TABLE IF NOT EXISTS public.kc_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name VARCHAR(120) NOT NULL DEFAULT 'ChatGPT MCP Client',
  redirect_uris TEXT[] NOT NULL,
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  token_endpoint_auth_method VARCHAR(32) NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kc_oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES public.kc_oauth_clients(client_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method VARCHAR(10) NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  scope TEXT NOT NULL DEFAULT 'mcp:read mcp:write',
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kc_oauth_codes_user_idx ON public.kc_oauth_codes(user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.kc_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES public.kc_oauth_clients(client_id) ON DELETE CASCADE,
  client_name VARCHAR(120) NOT NULL DEFAULT 'ChatGPT',
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  scope TEXT NOT NULL DEFAULT 'mcp:read mcp:write',
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kc_oauth_tokens_user_idx ON public.kc_oauth_tokens(user_id, revoked_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.kc_mcp_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tool_name VARCHAR(80) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kc_mcp_audit_logs_user_idx ON public.kc_mcp_audit_logs(user_id, created_at DESC);

REVOKE ALL ON TABLE public.kc_oauth_clients FROM PUBLIC;
REVOKE ALL ON TABLE public.kc_oauth_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.kc_oauth_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.kc_mcp_audit_logs FROM PUBLIC;
