import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategoryName, canonicalCategoryKey, allowedRoot } from "./taxonomy.js";
import { resolveMonthBudgetLimit, listConfiguredBudgets, isValidMonth } from "./budgets.js";

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
