import { cents } from "./finance.js";

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(ym) {
  return VALID_MONTH.test(String(ym || ""));
}

/**
 * Resolves the effective monthly budget limit for a root expense category in a given month.
 * Precedence: explicit kc_budget_periods snapshot/override > active kc_budget_rules within [starts_month, ends_month].
 * Never rolls over unused balance from previous months.
 */
export function resolveMonthBudgetLimit({ categoryId, month, budgetRules = [], budgetPeriods = [] }) {
  if (!categoryId || !isValidMonth(month)) return null;

  const period = budgetPeriods.find(
    p => String(p.category_id) === String(categoryId) && String(p.month) === String(month)
  );
  if (period) {
    return {
      categoryId: String(categoryId),
      month: String(month),
      limitCents: cents(period.limit_cents),
      version: Number(period.version || 1),
      ruleId: period.source_rule_id ? String(period.source_rule_id) : null,
      source: "period"
    };
  }

  const rule = budgetRules.find(
    r =>
      String(r.category_id) === String(categoryId) &&
      r.active !== false &&
      String(r.starts_month) <= String(month) &&
      (!r.ends_month || String(r.ends_month) >= String(month))
  );
  if (rule) {
    return {
      categoryId: String(categoryId),
      month: String(month),
      limitCents: cents(rule.limit_cents),
      version: 1,
      ruleId: String(rule.id),
      source: "rule"
    };
  }

  return null;
}

export function listConfiguredBudgets({ month, categories = [], budgetRules = [], budgetPeriods = [] }) {
  if (!isValidMonth(month)) return [];
  const expenseRoots = categories.filter(
    c => c.direction === "expense" && !c.parent_id && c.active !== false
  );
  const results = [];
  for (const cat of expenseRoots) {
    const resolved = resolveMonthBudgetLimit({
      categoryId: cat.id,
      month,
      budgetRules,
      budgetPeriods
    });
    if (resolved) {
      results.push({
        ...resolved,
        categoryName: cat.name,
        canonicalKey: cat.canonical_key || null
      });
    }
  }
  return results;
}
