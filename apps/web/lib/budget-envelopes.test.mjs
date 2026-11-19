import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthlyIncomeCeilingCents,
  validateBudgetAllocationCeiling,
  suggestBudgetsFromIncome,
  computeBudgetSummary,
  computeProjectedBalanceWithBudgetsCents,
  computeTotalDebtCents,
} from "./budgets.js";
import { buildNotifications } from "./notifications.js";

test("blocks active budget limit when monthly income is zero", () => {
  const res = validateBudgetAllocationCeiling({
    month: "2026-11",
    targetCategoryId: "cat-food",
    newLimitCents: 60000,
    active: true,
    categories: [{ id: "cat-food", name: "Alimentação", direction: "expense", parent_id: null }],
    titles: [],
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, "NO_INCOME");
});

test("blocks budget sum exceeding monthly income (e.g. 2500 > 2400)", () => {
  const categories = [
    { id: "cat-food", name: "Alimentação", direction: "expense", parent_id: null },
    { id: "cat-trans", name: "Transporte", direction: "expense", parent_id: null },
  ];
  const titles = [
    { id: "inc-1", direction: "income", amount_cents: 240000, due_on: "2026-11-05", entry_kind: "standard" },
  ];
  const budgetRules = [
    { id: "r-1", category_id: "cat-food", limit_cents: 200000, starts_month: "2026-11", active: true },
  ];

  const bad = validateBudgetAllocationCeiling({
    month: "2026-11",
    targetCategoryId: "cat-trans",
    newLimitCents: 50000, // 2000 + 500 = 2500 > 2400
    active: true,
    categories,
    budgetRules,
    titles,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "EXCEEDS_INCOME");
  assert.equal(bad.remainingAllocableCents, 40000);

  const good = validateBudgetAllocationCeiling({
    month: "2026-11",
    targetCategoryId: "cat-trans",
    newLimitCents: 40000, // 2000 + 400 = 2400 <= 2400
    active: true,
    categories,
    budgetRules,
    titles,
  });
  assert.equal(good.ok, true);
  assert.equal(good.remainingAllocableCents, 0);
});

test("allows inactive (não controla limite) budget without consuming income ceiling", () => {
  const res = validateBudgetAllocationCeiling({
    month: "2026-11",
    targetCategoryId: "cat-home",
    newLimitCents: 0,
    active: false,
    categories: [{ id: "cat-home", name: "Moradia", direction: "expense", parent_id: null }],
    titles: [],
  });
  assert.equal(res.ok, true);
});

test("computeMonthlyIncomeCeilingCents excludes reserve transfers", () => {
  const income = computeMonthlyIncomeCeilingCents({
    month: "2026-11",
    titles: [
      { id: "1", direction: "income", amount_cents: 240000, due_on: "2026-11-05", entry_kind: "standard" },
      { id: "2", direction: "income", amount_cents: 48000, due_on: "2026-11-05", entry_kind: "reserve_transfer" },
    ],
  });
  assert.equal(income, 240000);
});

test("suggestBudgetsFromIncome generates 50-30-20 split within income and keeps Moradia without variable cap", () => {
  const plan = suggestBudgetsFromIncome({ incomeCents: 240000 });
  const totalControlled = plan.filter((p) => p.controlsLimit).reduce((s, p) => s + p.limitCents, 0);
  assert.equal(totalControlled, 240000);

  const moradia = plan.find((p) => p.categoryName === "Moradia");
  assert.equal(moradia.controlsLimit, false);
  assert.equal(moradia.limitCents, 0);

  const capital = plan.find((p) => p.categoryName === "Reserva e Capital");
  assert.equal(capital.controlsLimit, true);
  assert.equal(capital.limitCents, 48000);
});

test("computeBudgetSummary reports negative overrun when expenses exceed budget limit", () => {
  const summary = computeBudgetSummary({
    month: "2026-11",
    categories: [{ id: "cat-trans", name: "Transporte", direction: "expense", parent_id: null }],
    budgetRules: [{ id: "r1", category_id: "cat-trans", limit_cents: 10000, starts_month: "2026-11", active: true }],
    economicEvents: [
      { id: "ev1", direction: "expense", description: "Uber", amount_cents: 11700, occurred_on: "2026-11-18", category_id: "cat-trans" },
    ],
  });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].remainingLimitCents, -1700);
  assert.equal(summary[0].overLimitCents, 1700);
});

test("computeProjectedBalanceWithBudgetsCents commits budget limits without double-counting expenses inside budget", () => {
  const budgetSummary = [
    { categoryId: "cat-trans", categoryName: "Transporte", limitCents: 30000, usedCents: 0 },
  ];
  // 1. Before spending: 2400 income - 300 budget - 790 uncapped Moradia = 1310
  const beforeSpend = computeProjectedBalanceWithBudgetsCents({
    receivableCents: 240000,
    rows: [
      { id: "1", direction: "expense", category: "Moradia", amount_cents: 79000 },
    ],
    budgetSummary,
  });
  assert.equal(beforeSpend, 131000);

  // 2. Spend R$ 17 inside Transporte: Saldo previsto remains 1310 (no double counting)
  const afterUber = computeProjectedBalanceWithBudgetsCents({
    receivableCents: 240000,
    rows: [
      { id: "1", direction: "expense", category: "Moradia", amount_cents: 79000 },
      { id: "2", direction: "expense", category: "Transporte", category_id: "cat-trans", amount_cents: 1700 },
    ],
    budgetSummary: [
      { categoryId: "cat-trans", categoryName: "Transporte", limitCents: 30000, usedCents: 1700 },
    ],
  });
  assert.equal(afterUber, 131000);

  // 3. Overrun Transporte to R$ 350: Saldo previsto reflects the R$ 50 overrun -> 1260
  const afterOverrun = computeProjectedBalanceWithBudgetsCents({
    receivableCents: 240000,
    rows: [
      { id: "1", direction: "expense", category: "Moradia", amount_cents: 79000 },
      { id: "2", direction: "expense", category: "Transporte", category_id: "cat-trans", amount_cents: 35000 },
    ],
    budgetSummary: [
      { categoryId: "cat-trans", categoryName: "Transporte", limitCents: 30000, usedCents: 35000 },
    ],
  });
  assert.equal(afterOverrun, 126000);
});

test("computeProjectedBalanceWithBudgetsCents carries forward operational cash and excludes settled budget expenses", () => {
  // Month 10 left R$ 300 in checking (after R$ 700 went to Capital).
  // Month 11 has R$ 2400 pending salary and R$ 300 Transporte budget (R$ 17 already settled in checking).
  // Live checking = 300 - 17 = 283. Remaining Transporte commitment = 300 - 17 = 283.
  // Projected = 283 + 2400 - 283 = 2400.
  const projected = computeProjectedBalanceWithBudgetsCents({
    openingOperationalCents: 28300,
    rows: [
      { id: "inc", direction: "income", amount_cents: 240000, settled_cents: 0 },
      { id: "exp", direction: "expense", category: "Transporte", category_id: "cat-trans", amount_cents: 1700, settled_cents: 1700 },
    ],
    budgetSummary: [
      { categoryId: "cat-trans", categoryName: "Transporte", limitCents: 30000, usedCents: 1700 },
    ],
  });
  assert.equal(projected, 240000);
});

test("computeMonthlyIncomeCeilingCents excludes loan principal inflows", () => {
  const income = computeMonthlyIncomeCeilingCents({
    month: "2026-11",
    titles: [
      { id: "1", direction: "income", amount_cents: 240000, due_on: "2026-11-05", entry_kind: "standard" },
      { id: "2", direction: "income", amount_cents: 1000000, due_on: "2026-11-10", entry_kind: "debt_payment", liability_id: "liab-1" },
    ],
  });
  assert.equal(income, 240000);
});

test("computeTotalDebtCents sums all future finite installments (including 2028) without counting open-ended rent or double-counting linked liabilities", () => {
  const debt = computeTotalDebtCents({
    knownCash: true,
    titles: [
      { id: "1", direction: "expense", amount_cents: 50000, settled_cents: 0, due_on: "2026-12-10", series_id: "s-loan" },
      { id: "2", direction: "expense", amount_cents: 50000, settled_cents: 0, due_on: "2028-05-10", series_id: "s-loan" },
      { id: "3", direction: "expense", amount_cents: 79000, settled_cents: 0, due_on: "2026-12-05", virtual: true }, // open-ended rent
    ],
    liabilities: [
      { id: "l-1", principal_cents: 100000, status: "active", series_id: "s-loan" }, // linked -> not double-counted
      { id: "l-2", principal_cents: 25000, status: "active" }, // unlinked -> summed
    ],
  });
  assert.equal(debt, 125000);
});

test("buildNotifications surfaces planned goals, due bills, budget overruns, capital reminders, and cash risk", () => {
  const alerts = buildNotifications({
    today: "2026-11-19",
    summary: { firstNegative: "2026-11-28" },
    healthPlan: { goals: { items: [{ title: "Notebook", targetCents: 250000, desiredOn: "2026-11-25" }] } },
    titles: [
      { id: "1", direction: "income", description: "Salário", amount_cents: 240000, settled_cents: 240000, due_on: "2026-11-05", entry_kind: "standard" },
      { id: "2", direction: "expense", description: "Aluguel", amount_cents: 79000, settled_cents: 0, due_on: "2026-11-20" },
    ],
    budgetSummary: [
      { categoryId: "c1", categoryName: "Transporte", limitCents: 30000, remainingLimitCents: -1700, utilizationPct: 106 },
      { categoryId: "c2", categoryName: "Reserva e Capital", limitCents: 48000, remainingLimitCents: 48000, utilizationPct: 0 },
    ],
  });
  assert.equal(alerts.some((a) => a.id.startsWith("goal-")), true);
  assert.equal(alerts.some((a) => a.id === "bills-soon"), true);
  assert.equal(alerts.some((a) => a.id === "budget-over-c1"), true);
  assert.equal(alerts.some((a) => a.id === "capital-pending"), true);
  assert.equal(alerts.some((a) => a.id === "negative-cash"), true);
});
