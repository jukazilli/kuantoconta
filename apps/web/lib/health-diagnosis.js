import { brDay, cents, dayAdd, isoDate, monthOf } from "./finance.js";
import { computeRange, lastDayOfMonth, moveMonth } from "./period.js";
import { expandRecurring } from "./recurring.js";
import { reconcilePortfolio } from "./reconciliation.js";
import { resolvePolicy } from "./health-policy.js";

const STATE_RANK = {
  unknown: 0,
  red: 1,
  orange: 2,
  blue: 3,
  green: 4,
};

export function isEssentialItem(item, categories = [], policy = resolvePolicy()) {
  if (typeof item?.is_essential === "boolean") return item.is_essential;
  if (item?.category_id) {
    const cat = categories.find((c) => String(c.id) === String(item.category_id));
    if (cat && typeof cat.is_essential === "boolean") return cat.is_essential;
    if (cat?.canonical_key && policy.essentialCategoryKeys.includes(cat.canonical_key)) {
      return true;
    }
  }
  const name = String(item?.category || "").trim();
  return policy.essentialCategoryNames.includes(name);
}

/**
 * Computes canonical financial health indicators, data quality, and explainable state
 * with hysteresis (ADR-009 Sections 4, 5, and 11).
 */
export function diagnoseFinancialHealth(rawData, options = {}) {
  const today = options.today || brDay();
  const policy = resolvePolicy(options.policy);
  const scenario = options.scenario || "contractual";
  const horizonEnd = options.horizonEnd || lastDayOfMonth(moveMonth(today, policy.horizonMonths - 1) + "-01");

  const reconciled = reconcilePortfolio(rawData);
  const filteredForConsumption = {
    ...rawData,
    titles: reconciled.consumptionTitles,
  };
  const expanded = expandRecurring(filteredForConsumption, today, horizonEnd);
  const range = computeRange(expanded, today, horizonEnd, today);

  const titles = expanded.titles || [];
  const categories = rawData?.categories || [];
  const currentMonth = monthOf(today);

  // Recurring monthly income (excluding variable/uncertain if marked variable)
  const monthlyRecurringIncomeCents = titles
    .filter(
      (t) =>
        t.direction === "income" &&
        monthOf(t.due_on) === currentMonth &&
        (t.income_confidence || "confirmed") !== "variable"
    )
    .reduce((sum, t) => sum + cents(t.amount_cents), 0);

  // Essential monthly cost estimate in current month
  const monthlyEssentialCostCents = titles
    .filter(
      (t) =>
        t.direction === "expense" &&
        monthOf(t.due_on) === currentMonth &&
        isEssentialItem(t, categories, policy)
    )
    .reduce((sum, t) => sum + cents(t.amount_cents), 0);

  // Monthly debt service: explicit liability installments + debt-linked titles due this month
  const explicitDebtServiceCents = reconciled.activeLiabilities.reduce(
    (sum, l) => sum + Math.max(0, cents(l.monthly_installment_cents)),
    0
  );
  const linkedDebtTitlesCents = titles
    .filter(
      (t) =>
        t.direction === "expense" &&
        monthOf(t.due_on) === currentMonth &&
        (t.entry_kind === "debt_payment" || t.liability_id)
    )
    .reduce((sum, t) => sum + cents(t.amount_cents), 0);
  const monthlyDebtServiceCents =
    explicitDebtServiceCents > 0 ? explicitDebtServiceCents : linkedDebtTitlesCents;

  // FH-19: never divide by zero/unknown recurring income
  const incomeCommitmentRatio =
    monthlyRecurringIncomeCents > 0
      ? Number((monthlyDebtServiceCents / monthlyRecurringIncomeCents).toFixed(4))
      : null;

  // Overdue essential titles (unpaid with due_on < today)
  const overdueEssentialTitles = titles.filter(
    (t) =>
      t.direction === "expense" &&
      isoDate(t.due_on) < today &&
      cents(t.amount_cents) - cents(t.settled_cents) > 0 &&
      isEssentialItem(t, categories, policy)
  );
  const overdueEssentialCents = overdueEssentialTitles.reduce(
    (sum, t) => sum + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)),
    0
  );

  // Coverage by due date using contractual daily curve (FH-17: never use EOM budget residual for intra-month liquidity)
  const gapDates = (range.daily || [])
    .filter((d) => d.balance < policy.minimumCashFloorCents - policy.materialDeficitCents)
    .map((d) => d.date);

  const minProjectedCashCents =
    scenario === "within_budgets" ? range.minCashWithinBudgets : range.minCash;

  const currentMonthTitles = titles.filter((t) => monthOf(t.due_on) === currentMonth);
  const currentMonthIncomeCents = currentMonthTitles
    .filter((t) => t.direction === "income")
    .reduce((sum, t) => sum + cents(t.amount_cents), 0);
  const currentMonthExpenseCents = currentMonthTitles
    .filter((t) => t.direction === "expense")
    .reduce((sum, t) => sum + cents(t.amount_cents), 0);
  const currentMonthResidualCents = (range.budgetSummary || []).reduce(
    (sum, b) => sum + (b.limitCents !== null ? Math.max(0, b.limitCents - b.usedCents) : 0),
    0
  );
  const planMarginCents =
    currentMonthTitles.length > 0
      ? currentMonthIncomeCents -
        currentMonthExpenseCents -
        (scenario === "within_budgets" ? currentMonthResidualCents : 0)
      : null;

  // Emergency coverage in months (null if denominator unknown)
  const emergencyCoverageMonths =
    reconciled.liquidReserveCents !== null && monthlyEssentialCostCents > 0
      ? Number((reconciled.liquidReserveCents / monthlyEssentialCostCents).toFixed(2))
      : null;

  // Capital formation: reserve + investments + unlinked non-debt assets
  const capitalFormationCents =
    reconciled.knownCash
      ? (reconciled.walletReserveCents || 0) +
        (reconciled.walletInvestmentCents || 0) +
        reconciled.assetReserveCents +
        reconciled.assetInvestmentCents
      : null;

  // Data quality checks (FH-13)
  const missingFields = [];
  if (!reconciled.knownCash) missingFields.push("opening_balance");
  if (monthlyRecurringIncomeCents <= 0) missingFields.push("recurring_income");
  if (monthlyEssentialCostCents <= 0 && titles.filter((t) => t.direction === "expense").length === 0) {
    missingFields.push("essential_expenses");
  }

  const assumptions = [];
  if (policy.isProvisional) {
    assumptions.push(`Politica ${policy.policyVersion} com thresholds provisorios sujeitos a homologacao.`);
  }
  if (reconciled.duplicatedLinkedAssetsCount > 0) {
    assumptions.push("Ativos vinculados a carteiras foram deduplicados para evitar dupla contagem.");
  }
  if ((range.totalPlannedRemainingCents || 0) > 0) {
    assumptions.push("Intencoes de gasto ativas foram consideradas no cenario prudente sem gerar divida.");
  }
  if (range.hasUndatedPlans) {
    assumptions.push("Ha planos de gasto sem dia exato; aplicou-se protecao conservadora no inicio do mes previsto.");
  }

  const dataQualityStatus =
    !reconciled.knownCash || missingFields.length >= 2
      ? "insufficient"
      : missingFields.length > 0
        ? "partial"
        : "complete";

  // Explainable state classification
  const reasonCodes = [];
  const hasProvenRisk =
    overdueEssentialTitles.length > 0 ||
    (reconciled.knownCash && (gapDates.length > 0 || (range.minCash ?? 0) < policy.minimumCashFloorCents));

  if (overdueEssentialTitles.length > 0) reasonCodes.push("ESSENTIAL_OVERDUE");
  if (gapDates.length > 0) reasonCodes.push("DUE_DATE_GAP");
  if (reconciled.knownCash && (reconciled.liveCash ?? 0) < policy.minimumCashFloorCents) {
    reasonCodes.push("NEGATIVE_LIVE_CASH");
  }

  const hasExpensiveDebt = reconciled.activeLiabilities.some(
    (l) =>
      l.interest_rate_bps !== null &&
      l.interest_rate_bps !== undefined &&
      Number(l.interest_rate_bps) >= policy.expensiveDebtMonthlyBps
  );
  if (hasExpensiveDebt) reasonCodes.push("EXPENSIVE_DEBT");
  if (incomeCommitmentRatio !== null && incomeCommitmentRatio > policy.highCommitmentRatio) {
    reasonCodes.push("HIGH_DEBT_COMMITMENT");
  }
  if (planMarginCents !== null && planMarginCents <= 0) reasonCodes.push("MARGIN_UNSTABLE");
  if (emergencyCoverageMonths !== null && emergencyCoverageMonths < policy.initialReserveMonths) {
    reasonCodes.push("LOW_INITIAL_RESERVE");
  } else if (emergencyCoverageMonths !== null && emergencyCoverageMonths < policy.fullReserveMonths) {
    reasonCodes.push("RESERVE_BUILDING");
  }

  let rawState = "unknown";
  if (hasProvenRisk) {
    rawState = "red";
  } else if (dataQualityStatus === "insufficient") {
    rawState = "unknown";
    reasonCodes.push("INCOMPLETE_DATA");
  } else if (
    (planMarginCents !== null && planMarginCents <= 0) ||
    hasExpensiveDebt ||
    (incomeCommitmentRatio !== null && incomeCommitmentRatio > policy.highCommitmentRatio) ||
    (emergencyCoverageMonths !== null && emergencyCoverageMonths < policy.initialReserveMonths)
  ) {
    rawState = "orange";
  } else if (
    emergencyCoverageMonths !== null &&
    emergencyCoverageMonths >= policy.fullReserveMonths &&
    (planMarginCents ?? 0) > 0 &&
    !hasExpensiveDebt
  ) {
    rawState = "green";
    reasonCodes.push("SUSTAINED_PROTECTION");
  } else {
    rawState = "blue";
    if (!reasonCodes.includes("RESERVE_BUILDING")) reasonCodes.push("BALANCED_BUILDING");
  }

  // Hysteresis (FH-14 & FH-15):
  // - Immediate downgrade on real risk (red/orange)
  // - Promotion to green requires K consecutive stable months when previous snapshot exists
  // - Same-day cosmetic cash flow doesn't oscillate state unnecessarily
  let finalState = rawState;
  const previous = options.previousSnapshot || null;
  if (previous && previous.state && previous.state !== "unknown") {
    if (STATE_RANK[rawState] < STATE_RANK[previous.state]) {
      // Immediate downgrade on real risk (FH-15)
      finalState = rawState;
    } else if (
      rawState === "green" &&
      previous.state !== "green" &&
      (previous.stable_streak_months ?? 0) + 1 < policy.stabilityMonthsK
    ) {
      // Require K months of sustained stability before promoting to green
      finalState = "blue";
      reasonCodes.push("HYSTERESIS_HOLD_FOR_K_MONTHS");
    }
  }

  // Coverage check for today's protection window (used by priority engine)
  const windowEnd = dayAdd(today, policy.protectionWindowDays);
  const minInWindow = (range.daily || [])
    .filter((d) => d.date >= today && d.date <= windowEnd)
    .reduce((m, d) => Math.min(m, d.balance), reconciled.knownCash ? reconciled.totalWalletCashCents : 0);
  const minInWindowWithPlans = (range.dailyWithPlans || [])
    .filter((d) => d.date >= today && d.date <= windowEnd)
    .reduce((m, d) => Math.min(m, d.balance), reconciled.knownCash ? reconciled.totalWalletCashCents : 0);

  return {
    asOf: today,
    policyVersion: policy.policyVersion,
    isProvisionalPolicy: policy.isProvisional,
    dataQuality: {
      status: dataQualityStatus,
      missingFields,
      assumptions,
    },
    diagnosis: {
      state: finalState,
      rawState,
      reasonCodes: [...new Set(reasonCodes)],
      scenario,
      indicators: {
        knownCash: reconciled.knownCash,
        liveCashCents: reconciled.totalWalletCashCents,
        operatingCashCents: reconciled.operatingCashCents,
        liquidReserveCents: reconciled.liquidReserveCents,
        outstandingDebtCents: reconciled.outstandingDebtCents,
        monthlyDebtServiceCents,
        monthlyRecurringIncomeCents,
        monthlyEssentialCostCents,
        incomeCommitmentRatio,
        overdueEssentialCount: overdueEssentialTitles.length,
        overdueEssentialCents,
        coverageByDueDate: {
          covered: gapDates.length === 0 && overdueEssentialTitles.length === 0,
          gapDates,
          overdueEssentialCount: overdueEssentialTitles.length,
        },
        minProjectedCashCents,
        minWindowCashCents: reconciled.knownCash ? minInWindow : null,
        minWindowCashWithPlansCents: reconciled.knownCash ? minInWindowWithPlans : null,
        totalPlannedRemainingCents: range.totalPlannedRemainingCents || 0,
        hasUndatedPlans: Boolean(range.hasUndatedPlans),
        firstNegativeWithPlans: range.firstNegativeWithPlans || null,
        planMarginCents,
        emergencyCoverageMonths,
        capitalFormationCents,
        netWorthCents: reconciled.netWorthCents,
        totalInterestCostCents: reconciled.totalInterestCostCents,
      },
    },
    _internal: {
      reconciled,
      expanded,
      range,
      policy,
    },
  };
}
