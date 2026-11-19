import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthlyIncomeCeilingCents,
  validateBudgetAllocationCeiling,
  suggestBudgetsFromIncome,
  computeBudgetSummary,
} from "./budgets.js";

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
