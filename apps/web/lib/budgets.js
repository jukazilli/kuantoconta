import { brDay, cents, monthOf } from "./finance.js";
import { normalizeCategoryName } from "./taxonomy.js";
import { expandRecurring } from "./recurring.js";
import { enrichSpendingPlans } from "./spending-plans.js";

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

/**
 * Pure budget consumption engine for a single calendar month (YYYY-MM).
 * Zero double-counting invariant:
 * - Reads committed consumption from kc_economic_events by occurred_on month.
 * - Settlements (kc_settlements) and reversals NEVER alter budget consumption.
 * - Legacy titles or virtual recurring occurrences without economic_event_id are included
 *   by due_on month only when economic_event_id is absent.
 */
export function computeBudgetSummary({
  month,
  categories = [],
  budgetRules = [],
  budgetPeriods = [],
  economicEvents = [],
  titles = [],
  recurringRules = [],
  cancelledRecurring = [],
  spendingPlans = [],
  spendingPlanApplications = [],
  today = brDay()
}) {
  if (!isValidMonth(month)) return [];

  const expenseRoots = categories.filter(c => c.direction === "expense" && !c.parent_id);
  const rootById = new Map(expenseRoots.map(c => [String(c.id), c]));
  const rootByNorm = new Map(expenseRoots.map(c => [normalizeCategoryName(c.name), c]));
  const subById = new Map(
    categories.filter(c => c.direction === "expense" && c.parent_id).map(c => [String(c.id), c])
  );

  const buckets = new Map();
  const ensureBucket = root => {
    const key = String(root.id);
    if (!buckets.has(key)) {
      const limitInfo = resolveMonthBudgetLimit({
        categoryId: root.id,
        month,
        budgetRules,
        budgetPeriods
      });
      buckets.set(key, {
        categoryId: key,
        categoryName: root.name,
        canonicalKey: root.canonical_key || null,
        active: root.active !== false,
        limitCents: limitInfo ? limitInfo.limitCents : null,
        version: limitInfo ? limitInfo.version : null,
        ruleId: limitInfo ? limitInfo.ruleId : null,
        realizedCents: 0,
        committedUnrealizedCents: 0,
        plannedRemainingCents: 0,
        subcategories: new Map(),
        events: [],
        plans: []
      });
    }
    return buckets.get(key);
  };

  for (const root of expenseRoots) {
    ensureBucket(root);
  }

  const addRealized = (root, subName, deltaCents, item) => {
    const bucket = ensureBucket(root);
    bucket.realizedCents += deltaCents;
    if (subName) {
      bucket.subcategories.set(subName, (bucket.subcategories.get(subName) || 0) + deltaCents);
    }
    bucket.events.push(item);
  };

  const addCommitted = (root, subName, deltaCents, item) => {
    const bucket = ensureBucket(root);
    bucket.committedUnrealizedCents += deltaCents;
    if (subName) {
      bucket.subcategories.set(subName, (bucket.subcategories.get(subName) || 0) + deltaCents);
    }
    bucket.events.push(item);
  };

  // 1. Realized economic consumption: kc_economic_events by occurred_on month (R)
  for (const ev of economicEvents) {
    if (ev.direction !== "expense" || ev.cancelled_at || ev.status === "cancelled") continue;
    if (monthOf(ev.occurred_on) !== month) continue;
    const root = rootById.get(String(ev.category_id));
    if (!root) continue;
    const sub = ev.subcategory_id ? subById.get(String(ev.subcategory_id)) : null;
    const sign = ev.event_kind === "refund" ? -1 : 1;
    const delta = sign * cents(ev.amount_cents);
    addRealized(root, sub?.name || null, delta, {
      id: ev.id,
      description: ev.description,
      amountCents: delta,
      occurredOn: ev.occurred_on,
      eventKind: ev.event_kind || "one_off",
      subcategoryName: sub?.name || null,
      source: "economic_event"
    });
  }

  // 2. Committed unrealized obligations: titles/virtual recurrences without economic_event_id (C)
  const expanded = expandRecurring(
    { titles, recurringRules, cancelledRecurring },
    `${month}-01`,
    `${month}-31`
  );
  for (const t of expanded.titles || []) {
    if (t.direction !== "expense" || t.cancelled_at || t.economic_event_id) continue;
    if ((t.entry_kind || "standard") === "reserve_transfer") continue;
    if (monthOf(t.due_on) !== month) continue;
    const root =
      (t.category_id && rootById.get(String(t.category_id))) ||
      rootByNorm.get(normalizeCategoryName(t.category || "Outros"));
    if (!root) continue;
    const amountCents = cents(t.amount_cents);
    addCommitted(root, t.subcategory || null, amountCents, {
      id: t.id,
      description: t.description,
      amountCents,
      occurredOn: t.due_on,
      eventKind: t.virtual ? "recurring_occurrence" : "legacy_title",
      subcategoryName: t.subcategory || null,
      source: t.virtual ? "recurring_rule" : "legacy_title"
    });
  }

  // 3. Non-obligational spending intentions remaining for this month (P)
  const enrichedPlans = enrichSpendingPlans(
    spendingPlans,
    spendingPlanApplications,
    today,
    economicEvents
  );
  for (const p of enrichedPlans) {
    if (String(p.planned_month) !== month) continue;
    if (!p.active && p.status !== "fulfilled") continue;
    const root = rootById.get(String(p.category_id));
    if (!root) continue;
    const bucket = ensureBucket(root);
    if (p.active && p.remainingCents > 0) {
      bucket.plannedRemainingCents += p.remainingCents;
      bucket.plans.push(p);
    }
  }

  return Array.from(buckets.values())
    .filter(b => b.limitCents !== null || b.realizedCents !== 0 || b.committedUnrealizedCents !== 0 || b.plannedRemainingCents > 0)
    .map(b => {
      // Backwards-compatible alias: usedCents = R + C
      const usedCents = b.realizedCents + b.committedUnrealizedCents;
      const remainingLimitCents = b.limitCents !== null ? b.limitCents - b.realizedCents : null;
      const remainingCents = b.limitCents !== null ? b.limitCents - usedCents : null;
      const unallocatedCents =
        b.limitCents !== null
          ? b.limitCents - b.realizedCents - b.committedUnrealizedCents - b.plannedRemainingCents
          : null;
      const overLimitCents = b.limitCents !== null ? Math.max(0, usedCents - b.limitCents) : 0;
      const overPlannedCents = unallocatedCents !== null ? Math.max(0, -unallocatedCents) : 0;
      const utilizationPct =
        b.limitCents !== null && b.limitCents > 0
          ? Math.round((usedCents / b.limitCents) * 100)
          : b.limitCents === 0 && usedCents > 0
            ? 100
            : 0;
      return {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        canonicalKey: b.canonicalKey,
        active: b.active,
        limitCents: b.limitCents,
        realizedCents: b.realizedCents,
        committedUnrealizedCents: b.committedUnrealizedCents,
        plannedRemainingCents: b.plannedRemainingCents,
        remainingLimitCents,
        unallocatedCents,
        usedCents,
        remainingCents,
        overLimitCents,
        overPlannedCents,
        utilizationPct,
        version: b.version,
        ruleId: b.ruleId,
        subcategories: Array.from(b.subcategories.entries()).map(([name, used]) => ({
          name,
          usedCents: used
        })),
        events: b.events,
        plans: b.plans
      };
    })
    .sort((a, b) => {
      if (a.limitCents !== null && b.limitCents === null) return -1;
      if (a.limitCents === null && b.limitCents !== null) return 1;
      return (b.usedCents + b.plannedRemainingCents) - (a.usedCents + a.plannedRemainingCents);
    });
}

export function computeMultiMonthBudgets({ months = [], ...rest }) {
  return months.filter(isValidMonth).map(month => ({
    month,
    categories: computeBudgetSummary({ month, ...rest })
  }));
}
