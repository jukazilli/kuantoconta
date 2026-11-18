import { diagnoseFinancialHealth } from "./health-diagnosis.js";
import { projectRecoveryMilestones } from "./recovery-projection.js";
import { planAllocationPriorities } from "./priority-planner.js";
import { simulateGoalPurchase } from "./goal-planner.js";

/**
 * Unified Financial Health & Planning facade matching ADR-009 Section 11 output contract.
 */
export function buildFinancialHealthPlan(rawData, options = {}) {
  const diag = diagnoseFinancialHealth(rawData, options);
  const milestones = projectRecoveryMilestones(diag);
  const allocation = planAllocationPriorities(diag);

  const goals = (rawData?.goals || [])
    .filter((g) => g.status !== "cancelled")
    .map((g) =>
      simulateGoalPurchase(
        rawData,
        {
          id: g.id,
          title: g.title,
          targetCents: g.target_cents,
          downPaymentCents: g.down_payment_cents,
          installmentCount: g.installment_count,
          installmentCents: g.installment_cents,
          interestBps: g.interest_bps,
          desiredOn: g.desired_on,
        },
        options
      )
    );

  const primaryGoal = goals[0] || null;

  return {
    asOf: diag.asOf,
    policyVersion: diag.policyVersion,
    isProvisionalPolicy: diag.isProvisionalPolicy,
    dataQuality: diag.dataQuality,
    diagnosis: diag.diagnosis,
    milestones: {
      firstCoveredMonth: milestones.firstCoveredMonth,
      firstSavingMonth: milestones.firstSavingMonth,
      firstStableMonth: milestones.firstStableMonth,
      confidence: milestones.confidence,
      reasons: milestones.reasons,
      monthlyTimeline: milestones.monthlyTimeline,
    },
    allocation,
    goals: primaryGoal
      ? {
          firstFeasibleDate: primaryGoal.firstFeasibleDate,
          isFeasible: primaryGoal.isFeasible,
          rejectionReasons: primaryGoal.rejectionReasons,
          items: goals,
        }
      : {
          firstFeasibleDate: null,
          isFeasible: false,
          rejectionReasons: [],
          items: [],
        },
  };
}
