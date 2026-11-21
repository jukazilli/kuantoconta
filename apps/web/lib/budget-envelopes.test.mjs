import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthlyIncomeCeilingCents,
  validateBudgetAllocationCeiling,
  suggestBudgetsFromIncome,
  computeBudgetSummary,
  computeProjectedBalanceWithBudgetsCents,
  computeSafeMonthlyContributionCents,
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

test("computeProjectedBalanceWithBudgetsCents treats budget limits as control caps without deducting unspent headroom from Saldo previsto", () => {
  // User canonical rule:
  // Saldo previsto = R$ 120,00 -> defines Mercado budget limit R$ 100,00 -> Saldo previsto remains R$ 120,00.
  const budgetSummary = [
    { categoryId: "cat-mkt", categoryName: "Mercado", limitCents: 10000, usedCents: 0 },
  ];
  const beforeSpend = computeProjectedBalanceWithBudgetsCents({
    openingOperationalCents: 12000,
    rows: [],
    budgetSummary,
  });
  assert.equal(beforeSpend, 12000);

  // Launches R$ 20,00 pending expense in Mercado -> Saldo previsto drops to R$ 100,00 (never deducts remaining R$ 80,00 limit!)
  const afterPendingSpend = computeProjectedBalanceWithBudgetsCents({
    openingOperationalCents: 12000,
    rows: [
      { id: "1", direction: "expense", category: "Mercado", category_id: "cat-mkt", amount_cents: 2000, settled_cents: 0 },
    ],
    budgetSummary: [
      { categoryId: "cat-mkt", categoryName: "Mercado", limitCents: 10000, usedCents: 2000 },
    ],
  });
  assert.equal(afterPendingSpend, 10000);

  // When R$ 20,00 is already paid (opening checking cash is R$ 100,00 and settled_cents is R$ 20,00): stays R$ 100,00!
  const afterSettledSpend = computeProjectedBalanceWithBudgetsCents({
    openingOperationalCents: 10000,
    rows: [
      { id: "1", direction: "expense", category: "Mercado", category_id: "cat-mkt", amount_cents: 2000, settled_cents: 2000 },
    ],
    budgetSummary: [
      { categoryId: "cat-mkt", categoryName: "Mercado", limitCents: 10000, usedCents: 2000 },
    ],
  });
  assert.equal(afterSettledSpend, 10000);
});

test("computeSafeMonthlyContributionCents prioritizes bills and suggests only leftover margin after consumption budgets", () => {
  // Projected balance after pending bills = R$ 100,00; unspent consumption budget headroom = R$ 90,00 -> Safe contribution = R$ 10,00
  const ready = computeSafeMonthlyContributionCents({
    projectedBalanceCents: 10000,
    checkingBalanceCents: 10000,
    budgetSummary: [
      { categoryId: "cat-mkt", categoryName: "Alimentação", limitCents: 10000, usedCents: 1000, active: true },
      { categoryId: "cat-cap", categoryName: "Reserva e Capital", limitCents: 50000, usedCents: 0, active: true },
    ],
  });
  assert.equal(ready.unspentConsumptionBudgetsCents, 9000);
  assert.equal(ready.safeContributionCents, 1000);
  assert.equal(ready.canContribute, true);
  assert.equal(ready.status, "ready");

  // Negative projected balance -> prioritizes paying bills first (safe contribution = R$ 0,00)
  const tight = computeSafeMonthlyContributionCents({
    projectedBalanceCents: -25000,
    checkingBalanceCents: 500,
    budgetSummary: [
      { categoryId: "cat-mkt", categoryName: "Alimentação", limitCents: 30000, usedCents: 0, active: true },
    ],
  });
  assert.equal(tight.safeContributionCents, 0);
  assert.equal(tight.canContribute, false);
  assert.equal(tight.status, "prioritize_bills");
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

test("computeProjectedBalanceWithBudgetsCents counts settledRows from earlier in the month without double-counting", () => {
  // User had R$ 5.000 salary, already spent R$ 800 in Alimentação before today (now R$ 4.200 in checking),
  // and allocates R$ 1.500 budget for Alimentação in the month.
  // Setting the R$ 1.500 limit does NOT deduct R$ 700 unspent headroom from Saldo previsto, so it stays R$ 4.200.
  const projected = computeProjectedBalanceWithBudgetsCents({
    openingOperationalCents: 420000,
    rows: [], // rangeStart = today has no upcoming bills
    settledRows: [
      { id: "s1", direction: "expense", category: "Alimentação", category_id: "c-food", amount_cents: 80000, settled_cents: 80000, due_on: "2026-11-10" },
    ],
    budgetSummary: [
      { categoryId: "c-food", categoryName: "Alimentação", limitCents: 150000, usedCents: 80000 },
    ],
  });
  assert.equal(projected, 420000);
});
