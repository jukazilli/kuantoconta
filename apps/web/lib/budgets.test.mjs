import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategoryName, canonicalCategoryKey, allowedRoot } from "./taxonomy.js";
import {
  resolveMonthBudgetLimit,
  listConfiguredBudgets,
  computeBudgetSummary,
  computeMultiMonthBudgets,
  isValidMonth
} from "./budgets.js";

test("canonical key and accent/case normalization prevent duplicate category names", () => {
  assert.equal(normalizeCategoryName("  Alimentação "), "alimentacao");
  assert.equal(canonicalCategoryKey("expense", "Alimentação"), "expense.alimentacao");
  assert.equal(allowedRoot("expense", "alimentacao"), true);
  assert.equal(allowedRoot("expense", "Educação"), true);
  assert.equal(allowedRoot("income", "Alimentação"), false);
});

test("budget resolution prefers explicit month period over rule and never rolls over", () => {
  const rules = [{ id: "r1", category_id: "c1", limit_cents: "40000", starts_month: "2026-10", ends_month: null, active: true }];
  const periods = [{ id: "p1", category_id: "c1", month: "2026-11", limit_cents: "45000", source_rule_id: "r1", version: 2 }];

  const oct = resolveMonthBudgetLimit({ categoryId: "c1", month: "2026-10", budgetRules: rules, budgetPeriods: periods });
  assert.equal(oct.limitCents, 40000);
  assert.equal(oct.source, "rule");

  const nov = resolveMonthBudgetLimit({ categoryId: "c1", month: "2026-11", budgetRules: rules, budgetPeriods: periods });
  assert.equal(nov.limitCents, 45000);
  assert.equal(nov.version, 2);
  assert.equal(nov.source, "period");

  const sep = resolveMonthBudgetLimit({ categoryId: "c1", month: "2026-09", budgetRules: rules, budgetPeriods: periods });
  assert.equal(sep, null);
});

test("listConfiguredBudgets lists only active root expense categories with limits", () => {
  const categories = [
    { id: "c1", name: "Alimentação", direction: "expense", parent_id: null, active: true },
    { id: "c2", name: "Mercado", direction: "expense", parent_id: "c1", active: true },
    { id: "c3", name: "Salário", direction: "income", parent_id: null, active: true }
  ];
  const rules = [
    { id: "r1", category_id: "c1", limit_cents: 40000, starts_month: "2026-11", active: true },
    { id: "r2", category_id: "c2", limit_cents: 10000, starts_month: "2026-11", active: true }
  ];
  const list = listConfiguredBudgets({ month: "2026-11", categories, budgetRules: rules });
  assert.equal(list.length, 1);
  assert.equal(list[0].categoryName, "Alimentação");
  assert.equal(list[0].limitCents, 40000);
  assert.equal(isValidMonth("2026-13"), false);
});

test("Case A & B: R$ 29,80 purchase consumes budget once regardless of pending or settled state", () => {
  const categories = [
    { id: "c-food", name: "Alimentação", direction: "expense", parent_id: null, active: true },
    { id: "c-mkt", name: "Mercado", direction: "expense", parent_id: "c-food", active: true }
  ];
  const budgetRules = [{ id: "r1", category_id: "c-food", limit_cents: 40000, starts_month: "2026-11", active: true }];
  const economicEvents = [
    { id: "e1", direction: "expense", description: "Gastos prévios", amount_cents: 13000, occurred_on: "2026-11-05", category_id: "c-food", event_kind: "one_off", status: "committed" },
    { id: "e2", direction: "expense", description: "Mercado", amount_cents: 2980, occurred_on: "2026-11-17", category_id: "c-food", subcategory_id: "c-mkt", event_kind: "one_off", status: "committed" }
  ];
  const titles = [
    { id: "t1", economic_event_id: "e1", direction: "expense", amount_cents: 13000, settled_cents: 13000, due_on: "2026-11-05" },
    { id: "t2", economic_event_id: "e2", direction: "expense", amount_cents: 2980, settled_cents: 0, due_on: "2026-11-25" }
  ];

  const beforeSettle = computeBudgetSummary({ month: "2026-11", categories, budgetRules, economicEvents, titles });
  assert.equal(beforeSettle[0].usedCents, 15980);
  assert.equal(beforeSettle[0].remainingCents, 24020);
  assert.equal(beforeSettle[0].subcategories[0].name, "Mercado");
  assert.equal(beforeSettle[0].subcategories[0].usedCents, 2980);

  // Subsequent settlement does NOT double-count budget
  titles[1].settled_cents = 2980;
  const afterSettle = computeBudgetSummary({ month: "2026-11", categories, budgetRules, economicEvents, titles });
  assert.equal(afterSettle[0].usedCents, 15980);
  assert.equal(afterSettle[0].remainingCents, 24020);
});

test("Case C: edit value adds only delta and category transfer moves consumption atomically", () => {
  const categories = [
    { id: "c-food", name: "Alimentação", direction: "expense", parent_id: null, active: true },
    { id: "c-fun", name: "Lazer", direction: "expense", parent_id: null, active: true }
  ];
  const budgetRules = [
    { id: "r1", category_id: "c-food", limit_cents: 40000, starts_month: "2026-11", active: true },
    { id: "r2", category_id: "c-fun", limit_cents: 10000, starts_month: "2026-11", active: true }
  ];
  const economicEvents = [
    { id: "e1", direction: "expense", description: "Mercado", amount_cents: 3980, occurred_on: "2026-11-17", category_id: "c-fun", event_kind: "one_off", status: "committed" }
  ];
  const summary = computeBudgetSummary({ month: "2026-11", categories, budgetRules, economicEvents });
  const food = summary.find(s => s.categoryId === "c-food");
  const fun = summary.find(s => s.categoryId === "c-fun");
  assert.equal(food.usedCents, 0);
  assert.equal(food.remainingCents, 40000);
  assert.equal(fun.usedCents, 3980);
  assert.equal(fun.remainingCents, 6020);
});

test("Case E: 6x installment purchase of R$ 1.200 consumes full 120000 once in purchase month", () => {
  const categories = [{ id: "c-home", name: "Moradia", direction: "expense", parent_id: null, active: true }];
  const budgetRules = [{ id: "r1", category_id: "c-home", limit_cents: 200000, starts_month: "2026-11", active: true }];
  const economicEvents = [
    { id: "e-inst", direction: "expense", description: "Móvel", amount_cents: 120000, occurred_on: "2026-11-10", category_id: "c-home", event_kind: "installment_purchase", status: "committed" }
  ];
  const titles = Array.from({ length: 6 }, (_, i) => ({
    id: "t-" + i,
    economic_event_id: "e-inst",
    direction: "expense",
    amount_cents: 20000,
    settled_cents: 0,
    due_on: `2026-11-10`
  }));

  const nov = computeBudgetSummary({ month: "2026-11", categories, budgetRules, economicEvents, titles });
  assert.equal(nov[0].usedCents, 120000);
  assert.equal(nov[0].remainingCents, 80000);

  const dec = computeBudgetSummary({ month: "2026-12", categories, budgetRules, economicEvents, titles: [] });
  assert.equal(dec[0].usedCents, 0);
  assert.equal(dec[0].remainingCents, 200000);
});

test("Case J & over-limit & no-rollover: recurring rules, negative remaining, multi-month isolation", () => {
  const categories = [{ id: "c-food", name: "Alimentação", direction: "expense", parent_id: null, active: true }];
  const budgetRules = [{ id: "r1", category_id: "c-food", limit_cents: 40000, starts_month: "2026-10", active: true }];
  const economicEvents = [
    { id: "e-oct", direction: "expense", description: "Mercado Out", amount_cents: 10000, occurred_on: "2026-10-15", category_id: "c-food", event_kind: "one_off", status: "committed" },
    { id: "e-nov", direction: "expense", description: "Mercado Nov", amount_cents: 45000, occurred_on: "2026-11-15", category_id: "c-food", event_kind: "one_off", status: "committed" }
  ];
  const multi = computeMultiMonthBudgets({ months: ["2026-10", "2026-11"], categories, budgetRules, economicEvents });
  // Oct had 30000 unused; Nov limit stays 40000 (no rollover!) and shows -5000 over-limit
  assert.equal(multi[0].categories[0].remainingCents, 30000);
  assert.equal(multi[1].categories[0].limitCents, 40000);
  assert.equal(multi[1].categories[0].remainingCents, -5000);
  assert.equal(multi[1].categories[0].overLimitCents, 5000);
});
