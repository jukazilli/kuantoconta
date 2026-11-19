import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeTotalDebtCents } from "./budgets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("computeTotalDebtCents supports all_commitments (default) and financial_only modes", () => {
  const titles = [
    { id: "1", direction: "expense", category: "Empréstimos", entry_kind: "debt_payment", amount_cents: "500000", settled_cents: "0", installment_total: 12 },
    { id: "2", direction: "expense", category: "Cartão de crédito", entry_kind: "standard", amount_cents: "200000", settled_cents: "0", installment_total: 3 },
    { id: "3", direction: "expense", category: "Moradia", entry_kind: "standard", amount_cents: "80000", settled_cents: "0", installment_total: 1 },
    { id: "4", direction: "expense", category: "Assinaturas", entry_kind: "standard", amount_cents: "3000", settled_cents: "0", installment_total: 1 },
    { id: "5", direction: "expense", category: "Empréstimos", entry_kind: "loan_out", amount_cents: "100000", settled_cents: "0", installment_total: 1 },
  ];

  const allCommitments = computeTotalDebtCents({ titles, liabilities: [], mode: "all_commitments" });
  const financialOnly = computeTotalDebtCents({ titles, liabilities: [], mode: "financial_only" });

  // all_commitments sums 5000 + 2000 + 800 + 30 = 7830 (excludes loan_out)
  assert.equal(allCommitments, 783000);
  // financial_only sums 5000 + 2000 = 7000 (excludes Moradia & Assinaturas single bills)
  assert.equal(financialOnly, 700000);
});

test("Migration 013 defines kc_archive_wallet migrating all 5 wallet FK tables and zeroing balance", () => {
  const sqlSrc = readFileSync(path.join(__dirname, "../db/013_wallet_archive.sql"), "utf8");
  assert.match(sqlSrc, /ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
  assert.match(sqlSrc, /CREATE OR REPLACE FUNCTION public\.kc_archive_wallet/);
  assert.match(sqlSrc, /UPDATE public\.kc_titles/);
  assert.match(sqlSrc, /UPDATE public\.kc_settlements/);
  assert.match(sqlSrc, /UPDATE public\.kc_recurring_rules/);
  assert.match(sqlSrc, /UPDATE public\.kc_debt_payments/);
  assert.match(sqlSrc, /UPDATE public\.kc_assets/);
  assert.match(sqlSrc, /opening_balance_cents = 0/);
  assert.match(sqlSrc, /REVOKE ALL ON FUNCTION public\.kc_archive_wallet/);
});
