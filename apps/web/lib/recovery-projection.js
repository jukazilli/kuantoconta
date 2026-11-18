import { cents, monthOf } from "./finance.js";

/**
 * Computes the three distinct recovery milestones from the daily and monthly projection:
 * - firstCoveredMonth: first month where daily cash stays >= floor and no overdue essentials remain
 * - firstSavingMonth: first month covered with positive net margin and positive saving capacity
 * - firstStableMonth: first month starting K consecutive covered+saving months
 */
export function projectRecoveryMilestones(diagnosisResult) {
  const { asOf, dataQuality, diagnosis, _internal } = diagnosisResult;
  const { indicators } = diagnosis;
  const { range, policy } = _internal;

  if (!indicators.knownCash) {
    return {
      firstCoveredMonth: null,
      firstSavingMonth: null,
      firstStableMonth: null,
      confidence: "insufficient",
      reasons: ["INCOMPLETE_DATA", ...dataQuality.missingFields.map((f) => `MISSING_${f.toUpperCase()}`)],
      monthlyTimeline: [],
    };
  }

  const dailyByMonth = new Map();
  for (const d of range.daily || []) {
    const ym = monthOf(d.date);
    if (!dailyByMonth.has(ym)) dailyByMonth.set(ym, []);
    dailyByMonth.get(ym).push(d);
  }

  const currentMonth = monthOf(asOf);
  const monthlyTimeline = (range.months || []).map((m) => {
    const days = dailyByMonth.get(m.month) || [];
    const minBalance = days.length
      ? days.reduce((min, d) => Math.min(min, d.balance), Infinity)
      : null;
    const isCurrent = m.month === currentMonth;
    const hasOverdueBlock = isCurrent && indicators.overdueEssentialCount > 0;
    const covered =
      minBalance !== null &&
      minBalance >= policy.minimumCashFloorCents &&
      !hasOverdueBlock;
    const savingCapacityCents = covered && m.result > 0 ? Math.min(m.result, Math.max(0, minBalance - policy.minimumCashFloorCents)) : 0;
    const canSave = covered && savingCapacityCents > 0;

    return {
      month: m.month,
      incomeCents: m.income,
      expenseCents: m.expense,
      marginCents: m.result,
      minBalanceCents: minBalance,
      endBalanceCents: m.balance,
      covered,
      canSave,
      savingCapacityCents,
    };
  });

  const firstCovered = monthlyTimeline.find((m) => m.covered)?.month || null;
  const firstSaving = monthlyTimeline.find((m) => m.canSave)?.month || null;

  let firstStable = null;
  const k = Math.max(1, policy.stabilityMonthsK || 3);
  for (let i = 0; i <= monthlyTimeline.length - k; i++) {
    const window = monthlyTimeline.slice(i, i + k);
    if (window.every((m) => m.covered && m.canSave)) {
      firstStable = window[0].month;
      break;
    }
  }

  const reasons = [];
  if (!firstCovered) reasons.push("INSUFFICIENT_CASH");
  if (!firstSaving && firstCovered) reasons.push("NO_SAVING_MARGIN");
  if (firstSaving && !firstStable) {
    reasons.push(
      monthlyTimeline.length < k ? "HORIZON_TOO_SHORT" : "SUSTAINED_STABILITY_NOT_REACHED"
    );
  }
  if (indicators.monthlyRecurringIncomeCents <= 0) {
    reasons.push("UNKNOWN_INCOME");
  }

  const confidence =
    dataQuality.status === "complete" && firstCovered
      ? "high"
      : firstCovered || firstSaving
        ? "conditional"
        : "insufficient";

  return {
    firstCoveredMonth: firstCovered,
    firstSavingMonth: firstSaving,
    firstStableMonth: firstStable,
    confidence,
    reasons: [...new Set(reasons)],
    monthlyTimeline,
  };
}
