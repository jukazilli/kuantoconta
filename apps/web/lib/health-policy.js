/**
 * Versioned financial health policy (ADR-009 Section 5.2 & 15).
 * Provisional thresholds are explicitly marked and centralized so product homologation
 * can tune them without altering financial invariants.
 */
export const PROPOSED_HEALTH_POLICY_V1 = Object.freeze({
  policyVersion: "proposed-v1",
  isProvisional: true,
  horizonMonths: 12,
  stabilityMonthsK: 3, // Provisional K consecutive months for sustained stability
  minimumCashFloorCents: 0, // Provisional floor; configurable per homologation
  initialReserveMonths: 1, // Provisional initial cushion target (months of essential cost)
  fullReserveMonths: 6, // Provisional full emergency reserve target
  expensiveDebtMonthlyBps: 250, // Provisional 2.50% a.m. threshold for expensive debt
  highCommitmentRatio: 0.35, // Provisional 35% recurring debt-to-income threshold
  protectionWindowDays: 30, // Provisional window for today's allocable cash check
  materialDeficitCents: 100, // Minimum gap considered material for risk triggers
  essentialCategoryKeys: [
    "expense.moradia",
    "expense.alimentacao",
    "expense.saude",
  ],
  essentialCategoryNames: ["Moradia", "Alimentação", "Saúde"],
  // ADR-010 spending-plan & budget policy defaults (conservative, explicit, configurable)
  undatedPlanStrategy: "conservative_month_start",
  partialReconciliationMode: "explicit_when_below_estimate",
  recurringRecognitionMode: "committed_until_event",
});

export function resolvePolicy(overrides = {}) {
  return {
    ...PROPOSED_HEALTH_POLICY_V1,
    ...overrides,
  };
}
