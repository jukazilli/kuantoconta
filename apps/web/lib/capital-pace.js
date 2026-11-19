import { brDay, cents, isoDate } from "./finance.js";

function monthsBetween(fromDay, toDay) {
  const f = isoDate(fromDay);
  const t = isoDate(toDay);
  if (!f || !t || t <= f) return 1;
  const [fy, fm] = f.split("-").map(Number);
  const [ty, tm] = t.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm));
}

function addMonthsYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return d.toISOString().slice(0, 7);
}

/**
 * Evaluates whether the user is on pace to reach a Capital Goal by targetDate.
 */
export function computeCapitalPace({
  targetCents,
  targetDate,
  currentCapitalCents = 0,
  monthlyContributionCents = 0,
  today = brDay(),
}) {
  const target = Math.max(0, cents(targetCents));
  const current = Math.max(0, cents(currentCapitalCents));
  const contribution = Math.max(0, cents(monthlyContributionCents));
  const remainingCents = Math.max(0, target - current);
  const monthsLeft = monthsBetween(today, targetDate || today);
  const requiredMonthlyCents = remainingCents === 0 ? 0 : Math.ceil(remainingCents / monthsLeft);
  const progressPct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const onPace = remainingCents === 0 || contribution >= requiredMonthlyCents;
  const monthlyGapCents = Math.max(0, requiredMonthlyCents - contribution);
  const estimatedMonthsAtCurrentPace =
    remainingCents === 0 ? 0 : contribution > 0 ? Math.ceil(remainingCents / contribution) : null;
  const estimatedCompletionMonth =
    estimatedMonthsAtCurrentPace !== null
      ? addMonthsYm(String(today).slice(0, 7), estimatedMonthsAtCurrentPace)
      : null;

  return {
    targetCents: target,
    currentCapitalCents: current,
    remainingCents,
    monthsLeft,
    requiredMonthlyCents,
    monthlyContributionCents: contribution,
    monthlyGapCents,
    progressPct,
    onPace,
    estimatedMonthsAtCurrentPace,
    estimatedCompletionMonth,
  };
}
