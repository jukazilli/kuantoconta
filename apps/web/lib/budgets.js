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

/**
 * Total expected + confirmed income for a calendar month (YYYY-MM),
 * excluding internal reserve transfers.
 */
export function computeMonthlyIncomeCeilingCents({
  month,
  titles = [],
  recurringRules = [],
  cancelledRecurring = []
}) {
  if (!isValidMonth(month)) return 0;
  const expanded = expandRecurring(
    { titles, recurringRules, cancelledRecurring },
    `${month}-01`,
    `${month}-31`
  );
  return (expanded.titles || []).reduce((sum, t) => {
    if (t.cancelled_at || t.direction !== "income") return sum;
    const kind = t.entry_kind || "standard";
    if (kind === "reserve_transfer" || kind === "debt_payment" || t.liability_id) return sum;
    if (monthOf(t.due_on) !== month) return sum;
    return sum + Math.max(0, cents(t.amount_cents));
  }, 0);
}

/**
 * Enforces zero-based envelope ceiling:
 * - Active budget limits require monthly income > 0.
 * - Sum of active monthly budget limits cannot exceed monthly income.
 * - Budgets marked inactive (controlsLimit=false) do not consume the ceiling.
 */
export function validateBudgetAllocationCeiling({
  month,
  targetCategoryId,
  newLimitCents,
  active = true,
  categories = [],
  budgetRules = [],
  budgetPeriods = [],
  titles = [],
  recurringRules = [],
  cancelledRecurring = []
}) {
  if (!isValidMonth(month)) {
    return { ok: false, code: "INVALID_MONTH", error: "Competência inválida." };
  }
  const monthlyIncomeCents = computeMonthlyIncomeCeilingCents({
    month,
    titles,
    recurringRules,
    cancelledRecurring
  });
  const configured = listConfiguredBudgets({
    month,
    categories,
    budgetRules,
    budgetPeriods
  });
  const otherAllocatedCents = configured
    .filter(b => String(b.categoryId) !== String(targetCategoryId || ""))
    .reduce((sum, b) => sum + Math.max(0, cents(b.limitCents)), 0);

  if (!active || cents(newLimitCents) <= 0) {
    return {
      ok: true,
      monthlyIncomeCents,
      otherAllocatedCents,
      totalAllocatedCents: otherAllocatedCents,
      remainingAllocableCents: Math.max(0, monthlyIncomeCents - otherAllocatedCents)
    };
  }

  if (monthlyIncomeCents <= 0) {
    return {
      ok: false,
      code: "NO_INCOME",
      error: "Cadastre seus valores a receber deste mês antes de definir limites de orçamento.",
      monthlyIncomeCents: 0,
      otherAllocatedCents,
      remainingAllocableCents: 0
    };
  }

  const nextTotal = otherAllocatedCents + cents(newLimitCents);
  if (nextTotal > monthlyIncomeCents) {
    return {
      ok: false,
      code: "EXCEEDS_INCOME",
      error: "A soma dos orçamentos ultrapassa o total a receber deste mês.",
      monthlyIncomeCents,
      otherAllocatedCents,
      totalAllocatedCents: nextTotal,
      remainingAllocableCents: Math.max(0, monthlyIncomeCents - otherAllocatedCents)
    };
  }

  return {
    ok: true,
    monthlyIncomeCents,
    otherAllocatedCents,
    totalAllocatedCents: nextTotal,
    remainingAllocableCents: monthlyIncomeCents - nextTotal
  };
}

/**
 * Generates an initial 50-30-20 personal-finance budget split from monthly income.
 * Fixed contractual categories (Moradia, Educação, Assinaturas, Empréstimos) default to
 * controlsLimit=false so variable daily envelopes (Alimentação, Transporte, Lazer, etc.)
 * carry active spending limits, while 20% is earmarked for Reserva e Capital.
 */
export function suggestBudgetsFromIncome({ incomeCents }) {
  const total = Math.max(0, cents(incomeCents));
  if (total <= 0) return [];

  const template = [
    // 50% Essenciais (Moradia sem limite variável; variáveis com controle)
    { categoryName: "Moradia", bucket: "essential", share: 0, controlsLimit: false },
    { categoryName: "Alimentação", bucket: "essential", share: 0.25, controlsLimit: true },
    { categoryName: "Transporte", bucket: "essential", share: 0.15, controlsLimit: true },
    { categoryName: "Saúde", bucket: "essential", share: 0.10, controlsLimit: true },
    // 30% Estilo de Vida
    { categoryName: "Lazer", bucket: "lifestyle", share: 0.15, controlsLimit: true },
    { categoryName: "Outros", bucket: "lifestyle", share: 0.15, controlsLimit: true },
    { categoryName: "Assinaturas", bucket: "lifestyle", share: 0, controlsLimit: false },
    { categoryName: "Educação", bucket: "essential", share: 0, controlsLimit: false },
    // 20% Futuro / Capital (Pague-se primeiro)
    { categoryName: "Reserva e Capital", bucket: "capital", share: 0.20, controlsLimit: true, isCapital: true }
  ];

  let allocated = 0;
  const rows = template.map(item => {
    const limitCents = item.controlsLimit ? Math.floor(total * item.share) : 0;
    allocated += limitCents;
    return { ...item, limitCents };
  });

  // Distribute integer rounding remainder (at most a few cents) to Reserva e Capital
  const remainder = total - allocated;
  if (remainder > 0) {
    const capitalRow = rows.find(r => r.isCapital);
    if (capitalRow) capitalRow.limitCents += remainder;
  }

  return rows;
}

/**
 * Computes "Saldo previsto" accumulated with prior/live operational cash:
 * - Starts from openingOperationalCents (live checking cash, excluding Capital/Reserve wallets).
 * - Adds remaining pending receivables in the period (excluding loan_principal & reserve_transfer).
 * - Subtracts remaining controlled budget commitments max(0, max(used, limit) - settledInBudget)
 *   so already-settled expenses in live checking cash are never double-counted, and spending inside
 *   a budget does not reduce Saldo previsto twice.
 * - Subtracts pending uncapped expenses (categories without a controlled limit, e.g. Moradia).
 */
export function computeProjectedBalanceWithBudgetsCents({
  openingOperationalCents = 0,
  receivableCents = null,
  rows = [],
  budgetSummary = []
}) {
  // Backwards-compatible fallback when caller passes explicit receivableCents without settlement breakdown
  const hasSettlementData = rows.some((t) => t.settled_cents !== undefined);
  const pendingReceivableCents =
    receivableCents !== null && !hasSettlementData
      ? cents(receivableCents)
      : rows.reduce((sum, t) => {
          if (t.cancelled_at || t.direction !== "income") return sum;
          const kind = t.entry_kind || "standard";
          if (kind === "reserve_transfer" || kind === "loan_principal") return sum;
          return sum + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
        }, 0);

  const controlledById = new Map();
  const controlledByNorm = new Map();
  let controlledRemainingCommitmentCents = 0;

  for (const b of budgetSummary) {
    if (b.limitCents === null || b.limitCents === undefined) continue;
    const used = Math.max(0, cents(b.usedCents));
    const limit = Math.max(0, cents(b.limitCents));
    const settledInBudget = rows.reduce((sum, t) => {
      if (t.cancelled_at || t.direction !== "expense") return sum;
      if ((t.entry_kind || "standard") === "reserve_transfer") return sum;
      const matchesId = b.categoryId && t.category_id && String(t.category_id) === String(b.categoryId);
      const matchesName = b.categoryName && normalizeCategoryName(t.category || "") === normalizeCategoryName(b.categoryName);
      if (!matchesId && !matchesName) return sum;
      return sum + Math.max(0, cents(t.settled_cents));
    }, 0);
    const totalNeeded = Math.max(used, limit);
    controlledRemainingCommitmentCents += Math.max(0, totalNeeded - settledInBudget);
    if (b.categoryId) controlledById.set(String(b.categoryId), true);
    if (b.categoryName) controlledByNorm.set(normalizeCategoryName(b.categoryName), true);
  }

  let uncappedPendingExpenseCents = 0;
  for (const t of rows) {
    if (t.direction !== "expense" || t.cancelled_at) continue;
    if ((t.entry_kind || "standard") === "reserve_transfer") continue;
    const inControlled =
      (t.category_id && controlledById.has(String(t.category_id))) ||
      controlledByNorm.has(normalizeCategoryName(t.category || ""));
    if (!inControlled) {
      const pending = hasSettlementData
        ? Math.max(0, cents(t.amount_cents) - cents(t.settled_cents))
        : Math.max(0, cents(t.amount_cents));
      uncappedPendingExpenseCents += pending;
    }
  }

  return cents(openingOperationalCents) + pendingReceivableCents - (controlledRemainingCommitmentCents + uncappedPendingExpenseCents);
}

/**
 * Total Endividamento: sum of ALL remaining pending payable installments/titles
 * across the entire future horizon (2028, 2029, etc.), excluding open-ended recurring bills
 * without an end date, plus active liabilities not already linked to a title series.
 */
export function computeTotalDebtCents({ titles = [], liabilities = [], knownCash = false }) {
  const pendingTitles = titles.filter(
    (t) =>
      !t.cancelled_at &&
      t.direction === "expense" &&
      (t.entry_kind || "standard") !== "reserve_transfer" &&
      !t.virtual // open-ended virtual recurrences are excluded; materialized & finite installments are included
  );
  const titleSeriesIds = new Set(
    pendingTitles.filter((t) => t.series_id).map((t) => String(t.series_id))
  );

  const pendingPayableCents = pendingTitles.reduce((sum, t) => {
    const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
    return sum + rem;
  }, 0);

  const unlinkedLiabilitiesCents = (liabilities || [])
    .filter((l) => l.status !== "settled" && (!l.series_id || !titleSeriesIds.has(String(l.series_id))))
    .reduce((sum, l) => sum + Math.max(0, cents(l.principal_cents)), 0);

  if (!knownCash && pendingTitles.length === 0 && (liabilities || []).length === 0) {
    return null;
  }
  return pendingPayableCents + unlinkedLiabilitiesCents;
}
