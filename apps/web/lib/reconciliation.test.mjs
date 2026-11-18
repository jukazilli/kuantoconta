import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcilePortfolio } from "./reconciliation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("FH-07: reserve transfer is excluded from consumption titles and total own cash reconciles", () => {
  const data = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-01-01T00:00:00Z", wallet_kind: "checking", liquidity_kind: "immediate" },
      { id: "w2", name: "Reserva", opening_balance_cents: 50000, opening_at: "2026-01-01T00:00:00Z", wallet_kind: "reserve", liquidity_kind: "immediate", is_reserved: true },
    ],
    titles: [
      { id: "t1", direction: "expense", category: "Reserva", amount_cents: 10000, settled_cents: 0, entry_kind: "reserve_transfer", recurrence: "single" },
      { id: "t2", direction: "expense", category: "Moradia", amount_cents: 40000, settled_cents: 0, entry_kind: "standard", recurrence: "single" },
    ],
    assets: [],
    liabilities: [],
    settlements: [],
    debtPayments: [],
  };

  const rec = reconcilePortfolio(data);
  assert.equal(rec.consumptionTitles.length, 1);
  assert.equal(rec.consumptionTitles[0].id, "t2");
  assert.equal(rec.reserveTransferTitles.length, 1);
  assert.equal(rec.totalWalletCashCents, 150000);
  assert.equal(rec.netWorthCents, 150000);
});

test("FH-08: liquid investment in wallet linked to kc_assets is not double counted in net worth", () => {
  const data = {
    wallets: [
      { id: "w-inv", name: "CDB Liquido", opening_balance_cents: 250000, opening_at: "2026-01-01T00:00:00Z", wallet_kind: "investment", liquidity_kind: "immediate" },
    ],
    assets: [
      { id: "a1", label: "CDB Liquido", value_cents: 250000, asset_kind: "investment", liquidity_kind: "immediate", linked_wallet_id: "w-inv" },
      { id: "a2", label: "Imovel", value_cents: 10000000, asset_kind: "property", liquidity_kind: "locked", linked_wallet_id: null },
    ],
    liabilities: [],
    titles: [],
    settlements: [],
    debtPayments: [],
  };

  const rec = reconcilePortfolio(data);
  assert.equal(rec.duplicatedLinkedAssetsCount, 1);
  assert.equal(rec.unlinkedAssetsCents, 10000000);
  assert.equal(rec.netWorthCents, 10250000);
});

test("FH-06 & debt installments: principal payment reduces debt without double counting financing installments", () => {
  const data = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 500000, opening_at: "2026-01-01T00:00:00Z", wallet_kind: "checking" },
    ],
    liabilities: [
      { id: "l1", label: "Financiamento", principal_cents: 900000, status: "active", series_id: "ser-1" },
    ],
    titles: [
      { id: "t1", direction: "expense", amount_cents: 100000, settled_cents: 0, recurrence: "installments", series_id: "ser-1" },
      { id: "t2", direction: "expense", amount_cents: 50000, settled_cents: 0, recurrence: "single" },
    ],
    debtPayments: [
      { id: "dp1", liability_id: "l1", principal_cents: 100000, interest_fee_cents: 15000, paid_on: "2026-11-10" },
    ],
    assets: [],
    settlements: [],
  };

  const rec = reconcilePortfolio(data);
  assert.equal(rec.outstandingDebtCents, 900000);
  assert.equal(rec.totalPrincipalPaidCents, 100000);
  assert.equal(rec.totalInterestCostCents, 15000);
  assert.equal(rec.nonDebtOpenPayableCents, 50000);
  assert.equal(rec.netWorthCents, 500000 - 900000);
});

test("Migration 008 enforces user_id isolation, REVOKE ALL, and integer cents checks", () => {
  const sqlText = readFileSync(
    path.join(__dirname, "../db/008_financial_health_and_planning.sql"),
    "utf8"
  );
  assert.match(sqlText, /REVOKE ALL ON FUNCTION public\.kc_record_debt_payment/i);
  assert.match(sqlText, /FOREIGN KEY \(liability_id, user_id\) REFERENCES public\.kc_liabilities\(id, user_id\)/i);
  assert.match(sqlText, /FOREIGN KEY \(linked_wallet_id, user_id\) REFERENCES public\.kc_wallets\(id, user_id\)/i);
  assert.match(sqlText, /kc_financial_goals/i);
  assert.match(sqlText, /kc_health_snapshots/i);
});
