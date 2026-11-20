import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sha256Hex,
  sha256Base64Url,
  generateOpaqueToken,
  verifyPkceS256,
  isAllowedRedirectUri,
} from "./oauth.js";
import { createKuantoContaMcpServer, MCP_TOOL_NAMES, MCP_PROMPT_NAMES } from "./mcp-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("OAuth PKCE S256 verification and opaque token hashing", () => {
  const verifier = "a".repeat(64);
  const challenge = sha256Base64Url(verifier);
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256("b".repeat(64), challenge), false);
  assert.equal(verifyPkceS256("too-short", challenge), false);

  const tok1 = generateOpaqueToken("kcat");
  const tok2 = generateOpaqueToken("kcat");
  assert.notEqual(tok1, tok2);
  assert.equal(tok1.startsWith("kcat_"), true);
  assert.equal(sha256Hex(tok1).length, 64);
});

test("OAuth redirect URI validation allows HTTPS and localhost, rejects insecure HTTP and javascript", () => {
  assert.equal(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:3000/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8080/cb"), true);
  assert.equal(isAllowedRedirectUri("http://evil.example.com/cb"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
});

test("Migration 011 enforces hashed tokens, PKCE S256, user_id scoping, and REVOKE ALL", () => {
  const sqlSrc = readFileSync(path.join(__dirname, "../db/011_mcp_oauth.sql"), "utf8");
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_oauth_clients/);
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_oauth_codes/);
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_oauth_tokens/);
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_mcp_audit_logs/);
  assert.match(sqlSrc, /code_challenge_method = 'S256'/);
  assert.match(sqlSrc, /access_token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_oauth_clients FROM PUBLIC/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_oauth_codes FROM PUBLIC/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_oauth_tokens FROM PUBLIC/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_mcp_audit_logs FROM PUBLIC/);
});

test("MCP server registers all tools and prompts and scopes calls strictly to ownerId", async () => {
  const seenOwners = [];
  const postedPayloads = [];
  const server = createKuantoContaMcpServer("user-alpha", {
    loadPortfolio: async (uid) => {
      seenOwners.push(uid);
      return {
        wallets: [{ id: "11111111-1111-4111-8111-111111111111", name: "Nubank", opening_balance_cents: "100000", opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking", is_reserved: false }],
        titles: [],
        settlements: [],
        assets: [],
        liabilities: [],
        recurringRules: [],
        cancelledRecurring: [],
        cancellations: [],
        categories: [{ id: "22222222-2222-4222-8222-222222222222", name: "Alimentação", direction: "expense", parent_id: null }],
        budgetRules: [],
        budgetPeriods: [],
        economicEvents: [],
        debtPayments: [],
        goals: [],
        spendingPlans: [],
        spendingPlanApplications: [],
      };
    },
    executePortfolioPost: async (uid, payload) => {
      seenOwners.push(uid);
      postedPayloads.push(payload);
      return { ok: true, status: 201, data: { saved: true, id: "evt-1" } };
    },
    executePortfolioPatch: async (uid) => {
      seenOwners.push(uid);
      return { ok: true, status: 200, data: { saved: true } };
    },
    recordMcpAudit: async () => {},
  });

  // Verify registered tools & prompts exist on the McpServer instance
  const registeredTools = Object.keys(server._registeredTools || {});
  const registeredPrompts = Object.keys(server._registeredPrompts || {});
  for (const name of MCP_TOOL_NAMES) {
    assert.equal(registeredTools.includes(name), true, `Missing MCP tool: ${name}`);
  }
  for (const name of MCP_PROMPT_NAMES) {
    assert.equal(registeredPrompts.includes(name), true, `Missing MCP prompt: ${name}`);
  }

  // Invoke create_transaction directly via registered handler to verify ownerId isolation & idempotencyKey
  const idem = "33333333-3333-4333-8333-333333333333";
  const createTxTool = server._registeredTools.create_transaction;
  const res = await createTxTool.handler({
    direction: "expense",
    description: "Mercado",
    amountReais: 85.5,
    category: "Alimentação",
    wallet: "Nubank",
    dueOn: "2026-11-19",
    settlementState: "paid",
    idempotencyKey: idem,
  });
  assert.equal(Boolean(res.isError), false);
  assert.deepEqual(seenOwners, ["user-alpha", "user-alpha"]);
  assert.equal(postedPayloads[0].idempotencyKey, idem);
  assert.equal(postedPayloads[0].walletId, "11111111-1111-4111-8111-111111111111");
});
