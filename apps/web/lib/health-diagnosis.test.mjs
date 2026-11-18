import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseFinancialHealth } from "./health-diagnosis.js";

test("FH-01: high nominal debt with manageable installments, positive cash, and adequate reserve is not red", () => {
  const result = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 400000, opening_at: "2026-10-01T00:00:00Z", wallet_kind: "checking" },
        { id: "w2", name: "Reserva", opening_balance_cents: 1200000, opening_at: "2026-10-01T00:00:00Z", wallet_kind: "reserve", is_reserved: true },
      ],
      liabilities: [
        { id: "l1", label: "Financiamento Imovel", principal_cents: 15000000, monthly_installment_cents: 150000, interest_rate_bps: 80, status: "active", series_id: "ser-fin" },
      ],
      titles: [
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 800000, settled_cents: 0, due_on: "2026-11-05", income_confidence: "recurring" },
        { id: "t-mor", direction: "expense", category: "Moradia", amount_cents: 150000, settled_cents: 0, due_on: "2026-11-20", series_id: "ser-fin" },
      ],
      assets: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  assert.notEqual(result.diagnosis.state, "red");
  assert.ok(["blue", "green"].includes(result.diagnosis.state));
  assert.equal(result.diagnosis.indicators.outstandingDebtCents, 15000000);
});

test("FH-13: incomplete structural data returns neutral unknown state without fake green", () => {
  const result = diagnoseFinancialHealth(
    {
      wallets: [],
      titles: [],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.diagnosis.state, "unknown");
  assert.equal(result.dataQuality.status, "insufficient");
  assert.ok(result.dataQuality.missingFields.includes("opening_balance"));
});

test("FH-19: zero or unknown recurring income returns null incomeCommitmentRatio (no division by zero)", () => {
  const result = diagnoseFinancialHealth(
    {
      wallets: [{ id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-10-01T00:00:00Z" }],
      liabilities: [{ id: "l1", label: "Emprestimo", principal_cents: 200000, monthly_installment_cents: 50000, status: "active" }],
      titles: [],
      assets: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.diagnosis.indicators.incomeCommitmentRatio, null);
});

test("FH-14 & FH-15: hysteresis holds promotion to green until K months, but downgrades immediately on real risk", () => {
  const baseData = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 500000, opening_at: "2026-10-01T00:00:00Z", wallet_kind: "checking" },
      { id: "w2", name: "Reserva", opening_balance_cents: 2000000, opening_at: "2026-10-01T00:00:00Z", wallet_kind: "reserve", is_reserved: true },
    ],
    titles: [
      { id: "t-inc", direction: "income", category: "Salário", amount_cents: 600000, settled_cents: 0, due_on: "2026-11-05", income_confidence: "recurring" },
      { id: "t-exp", direction: "expense", category: "Moradia", amount_cents: 200000, settled_cents: 0, due_on: "2026-11-20" },
    ],
    liabilities: [],
    assets: [],
    settlements: [],
  };

  // Previous state was blue with streak 1 (< K=3): should hold at blue
  const held = diagnoseFinancialHealth(baseData, {
    today: "2026-11-10",
    previousSnapshot: { state: "blue", stable_streak_months: 1 },
  });
  assert.equal(held.diagnosis.rawState, "green");
  assert.equal(held.diagnosis.state, "blue");
  assert.ok(held.diagnosis.reasonCodes.includes("HYSTERESIS_HOLD_FOR_K_MONTHS"));

  // Immediate downgrade when an essential bill is overdue (FH-15)
  const risked = diagnoseFinancialHealth(
    {
      ...baseData,
      titles: [
        ...baseData.titles,
        { id: "t-late", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2026-11-02" },
      ],
    },
    {
      today: "2026-11-10",
      previousSnapshot: { state: "green", stable_streak_months: 4 },
    }
  );
  assert.equal(risked.diagnosis.state, "red");
  assert.ok(risked.diagnosis.reasonCodes.includes("ESSENTIAL_OVERDUE"));
});
