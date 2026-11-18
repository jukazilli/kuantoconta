import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFinancialHealthPlan } from "./financial-health.js";
import { diagnoseFinancialHealth } from "./health-diagnosis.js";
import { planAllocationPriorities } from "./priority-planner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("FH-12: income drop and new expense recalculate diagnosis/milestones/goals while preserving realized settlements", () => {
  const base = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" },
    ],
    titles: [
      { id: "t-paid", direction: "expense", category: "Moradia", amount_cents: 50000, settled_cents: 50000, due_on: "2026-11-05" },
      { id: "t-inc", direction: "income", category: "Salário", amount_cents: 400000, settled_cents: 0, due_on: "2026-11-15", income_confidence: "recurring" },
    ],
    settlements: [
      { id: "s1", title_id: "t-paid", wallet_id: "w1", amount_cents: 50000, settled_on: "2026-11-05", created_at: "2026-11-05T12:00:00Z", direction: "expense" },
    ],
    assets: [],
    liabilities: [],
    goals: [
      { id: "g1", title: "Curso", target_cents: 120000, down_payment_cents: 120000, installment_count: 1, desired_on: "2026-11-20", status: "simulated" },
    ],
  };

  const before = buildFinancialHealthPlan(base, { today: "2026-11-10" });
  assert.equal(before.goals.isFeasible, true);

  // Replan after income drop + new essential expense
  const after = buildFinancialHealthPlan(
    {
      ...base,
      titles: [
        base.titles[0],
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 150000, settled_cents: 0, due_on: "2026-11-15", income_confidence: "recurring" },
        { id: "t-new", direction: "expense", category: "Saúde", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-18" },
      ],
    },
    { today: "2026-11-10" }
  );

  assert.equal(after.diagnosis.state, "red");
  assert.equal(after.goals.isFeasible, false);
  // Realized settlement remained untouched
  assert.equal(base.settlements[0].amount_cents, 50000);
});

test("FH-16 & FH-17: EOM within_budgets residual does not mask intra-month due-date cash gap", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 50000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      categories: [
        { id: "c-mor", name: "Moradia", direction: "expense", parent_id: null, canonical_key: "expense.moradia", is_essential: true },
      ],
      budgetRules: [
        { id: "br1", category_id: "c-mor", limit_cents: 150000, starts_month: "2026-11", ends_month: null, active: true },
      ],
      titles: [
        { id: "t-rent", direction: "expense", category: "Moradia", category_id: "c-mor", amount_cents: 100000, settled_cents: 0, due_on: "2026-11-12" },
        { id: "t-sal", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-25", income_confidence: "recurring" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10", scenario: "within_budgets" }
  );

  // Even though monthly margin is positive (+150k after budget), Nov 12 has -50k cash gap!
  assert.equal(diag.diagnosis.state, "red");
  assert.equal(diag.diagnosis.indicators.coverageByDueDate.covered, false);
  assert.ok(diag.diagnosis.indicators.coverageByDueDate.gapDates.includes("2026-11-12"));
});

test("Low debt with uncovered essential bills triggers red and blocks capital allocation", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 10000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      liabilities: [
        { id: "l1", label: "Pequena Divida", principal_cents: 20000, monthly_installment_cents: 5000, status: "active" },
      ],
      titles: [
        { id: "t-ess", direction: "expense", category: "Alimentação", amount_cents: 80000, settled_cents: 0, due_on: "2026-11-12" },
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-20", income_confidence: "recurring" },
      ],
      assets: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  assert.equal(diag.diagnosis.state, "red");
  const alloc = planAllocationPriorities(diag);
  assert.equal(alloc.proposals[0].kind, "regularize_essentials");
});

test("Locked reserve is excluded from immediate emergency liquidity", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 300000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking", liquidity_kind: "immediate" },
      ],
      assets: [
        { id: "a-lock", label: "Previdencia Travada", value_cents: 5000000, asset_kind: "reserve", liquidity_kind: "locked" },
      ],
      titles: [
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 500000, settled_cents: 0, due_on: "2026-11-05", income_confidence: "recurring" },
        { id: "t-mor", direction: "expense", category: "Moradia", amount_cents: 200000, settled_cents: 0, due_on: "2026-11-15" },
      ],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  // Locked reserve must not inflate emergencyCoverageMonths into green
  assert.notEqual(diag.diagnosis.state, "green");
});

test("FH-20: portfolio API queries scope all new ADR-009 tables by owner.id", () => {
  const routeSrc = readFileSync(
    path.join(__dirname, "../app/api/portfolio/route.js"),
    "utf8"
  );
  assert.match(routeSrc, /FROM public\.kc_debt_payments WHERE user_id=\$\{owner\.id\}/);
  assert.match(routeSrc, /FROM public\.kc_financial_goals WHERE user_id=\$\{owner\.id\}/);
  assert.match(routeSrc, /FROM public\.kc_health_snapshots WHERE user_id=\$\{owner\.id\}/);
  assert.match(routeSrc, /UPDATE public\.kc_financial_goals SET status='cancelled' WHERE id=\$\{x\.goalId\}::uuid AND user_id=\$\{owner\.id\}/);
});
