import { brDay, cents, isoDate, monthOf } from "./finance.js";

export function isPlanActive(plan) {
  return plan && (plan.status === "planned" || plan.status === "partially_fulfilled") && !plan.cancelled_at;
}

export function computePlanAllocatedCents(planId, applications = [], cancelledEventIds = new Set()) {
  let total = 0;
  for (const app of applications) {
    if (String(app.plan_id) !== String(planId)) continue;
    if (cancelledEventIds.has(String(app.economic_event_id))) continue;
    total += Math.max(0, cents(app.allocated_cents));
  }
  return total;
}

/**
 * Remaining unfulfilled estimate of a spending plan:
 * - Active ('planned' | 'partially_fulfilled'): max(0, estimated - sum(valid applications))
 * - 'fulfilled' or 'cancelled': 0 (preserves history without projecting residual)
 */
export function computePlanRemainingCents(plan, applications = [], cancelledEventIds = new Set()) {
  if (!isPlanActive(plan)) return 0;
  const allocated = computePlanAllocatedCents(plan.id, applications, cancelledEventIds);
  return Math.max(0, cents(plan.estimated_amount_cents) - allocated);
}

/**
 * Enriches spending plans with allocatedCents, remainingCents, and needsReview
 * (LC-07: a past planned_for date flags review, NEVER overdue debt/default).
 */
export function enrichSpendingPlans(plans = [], applications = [], today = brDay(), economicEvents = []) {
  const cancelledEventIds = new Set(
    economicEvents.filter((e) => e.cancelled_at || e.status === "cancelled").map((e) => String(e.id))
  );

  return plans.map((p) => {
    const allocatedCents = computePlanAllocatedCents(p.id, applications, cancelledEventIds);
    const remainingCents = computePlanRemainingCents(p, applications, cancelledEventIds);
    const active = isPlanActive(p);
    const plannedFor = p.planned_for ? isoDate(p.planned_for) : null;
    const needsReview = Boolean(
      active &&
        ((plannedFor && plannedFor < today) ||
          (!plannedFor && p.planned_month && String(p.planned_month) < monthOf(today)))
    );

    return {
      ...p,
      estimatedCents: cents(p.estimated_amount_cents),
      allocatedCents,
      remainingCents,
      active,
      hasExactDate: Boolean(plannedFor),
      needsReview,
    };
  });
}

/**
 * Discrete suggestion helper (LC-21): finds active spending plans in the same category and month
 * so the UI can ask the user explicitly without auto-linking silently.
 */
export function findMatchingSpendingPlans({
  plans = [],
  applications = [],
  categoryId,
  occurredOn,
  today = brDay(),
}) {
  if (!categoryId || !occurredOn) return [];
  const targetMonth = monthOf(occurredOn);
  const enriched = enrichSpendingPlans(plans, applications, today);

  return enriched
    .filter(
      (p) =>
        p.active &&
        p.remainingCents > 0 &&
        String(p.category_id) === String(categoryId) &&
        String(p.planned_month) === targetMonth
    )
    .sort((a, b) => {
      const da = a.planned_for ? Math.abs(new Date(isoDate(a.planned_for)) - new Date(isoDate(occurredOn))) : Number.MAX_SAFE_INTEGER;
      const db = b.planned_for ? Math.abs(new Date(isoDate(b.planned_for)) - new Date(isoDate(occurredOn))) : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
}
