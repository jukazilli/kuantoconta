import test from "node:test";
import assert from "node:assert/strict";
import { simulateGoalPurchase } from "./goal-planner.js";
import { buildFinancialHealthPlan } from "./financial-health.js";

test("FH-02: R$ 700 cash with R$ 600 rent tomorrow rejects R$ 500 down payment today", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 70000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [
        { id: "t-rent", direction: "expense", category: "Moradia", amount_cents: 60000, settled_cents: 0, due_on: "2026-11-11" },
        { id: "t-sal", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-15" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 10,
      installmentCents: 20000,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.isFeasible, false);
  assert.equal(result.desiredDateFeasible, false);
  assert.ok(result.rejectionReasons.includes("INSUFFICIENT_CASH"));
  assert.equal(result.bottleneckDate, "2026-11-11");
  // After salary on Nov 15, it becomes feasible!
  assert.equal(result.firstFeasibleDate, "2026-11-15");
});

test("FH-09: notebook R$ 2.500 (R$ 500 down + 10x R$ 200) checks all 10 installments, not just down payment", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      // Only a large expense in month 5 breaks installment #5!
      titles: [
        { id: "t-big", direction: "expense", category: "Outros", amount_cents: 120000, settled_cents: 0, due_on: "2027-04-10" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 10,
      installmentCents: 20000,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.isFeasible, false);
  assert.equal(result.installmentCountVerified, 10);
  assert.equal(result.bottleneckDate, "2027-04-10");
});

test("FH-10: installment beyond horizon rejects with HORIZON_INSUFFICIENT when extension is disabled", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 500000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 18,
      installmentCents: 11112,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10", extendHorizonIfNeeded: false }
  );

  assert.equal(result.isFeasible, false);
  assert.ok(result.rejectionReasons.includes("HORIZON_INSUFFICIENT"));
});

test("FH-11 & FH-18: impossible goal returns null firstFeasibleDate and never mutates real titles", () => {
  const rawData = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 10000, opening_at: "2026-11-01T00:00:00Z" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
    goals: [
      {
        id: "g1",
        title: "Compra Impossivel",
        target_cents: 500000,
        down_payment_cents: 500000,
        installment_count: 1,
        installment_cents: 0,
        desired_on: "2026-11-10",
        status: "simulated",
      },
    ],
  };

  const plan = buildFinancialHealthPlan(rawData, { today: "2026-11-10" });
  assert.equal(plan.goals.isFeasible, false);
  assert.equal(plan.goals.firstFeasibleDate, null);
  assert.equal(rawData.titles.length, 0);
  assert.equal(rawData.settlements.length, 0);
});

test("Caixinhas + Planejamento: linked goal caixinha abates down payment without touching Emergency Reserve", () => {
  // User has R$ 2.000 in checking, R$ 10.000 in Emergency Reserve Caixinha, and R$ 15.000 in Carro Caixinha.
  // Simulates a R$ 55.000 car with R$ 25.000 down payment + 30x R$ 1.000 linked ONLY to Carro Caixinha.
  // Effective down payment needed from checking/future cash is R$ 10.000 (25k - 15k), NEVER touching the R$ 10k Emergency Reserve!
  const rawData = {
    wallets: [
      { id: "w-chk", name: "Nubank", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" },
      { id: "w-res", name: "Reserva", opening_balance_cents: 1000000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "reserve", is_reserved: true, parent_wallet_id: "w-chk", caixinha_purpose: "reserve" },
      { id: "w-car", name: "Caixinha Carro", opening_balance_cents: 1500000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "investment", is_reserved: false, parent_wallet_id: "w-chk", caixinha_purpose: "goal" },
    ],
    goals: [
      { id: "g-res", title: "Reserva de emergência", category: "capital_goal", wallet_id: "w-res", parent_wallet_id: "w-chk", caixinha_purpose: "reserve", target_cents: 1200000, status: "simulated" },
      { id: "g-car", title: "Entrada do carro", category: "capital_goal", wallet_id: "w-car", parent_wallet_id: "w-chk", caixinha_purpose: "goal", target_cents: 2500000, status: "simulated" },
    ],
    recurringRules: [
      { id: "r1", wallet_id: "w-chk", direction: "income", description: "Salário", category: "Salário", amount_cents: 600000, starts_on: "2026-11-05" },
      { id: "r2", wallet_id: "w-chk", direction: "expense", description: "Contas", category: "Moradia", amount_cents: 300000, starts_on: "2026-11-10" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  // Trying today (2026-11-19): only R$ 2.000 free in checking + R$ 15.000 in Carro Caixinha = R$ 17.000 < R$ 25.000.
  // Because Emergency Reserve (R$ 10.000) is strictly protected, it must NOT be feasible today!
  const simToday = simulateGoalPurchase(
    rawData,
    {
      title: "Carro",
      targetCents: 5500000,
      downPaymentCents: 2500000,
      installmentCount: 30,
      installmentCents: 100000,
      sourceGoalId: "g-car",
      desiredOn: "2026-11-19",
    },
    { today: "2026-11-19" }
  );

  assert.equal(simToday.twoStepVerdict.coveredByCaixinhaCents, 1500000);
  assert.equal(simToday.twoStepVerdict.remainingDownPaymentCents, 1000000);
  assert.equal(simToday.twoStepVerdict.hasDownPaymentNow, false);
  assert.equal(simToday.isFeasible, false);

  // With monthly surplus of R$ 3.000/mo, in ~4 months (March 2027) remaining R$ 10k is covered and 30x R$ 1k fits!
  assert.ok(simToday.firstFeasibleDate && simToday.firstFeasibleDate <= "2027-04-05");
});
