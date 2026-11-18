import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseFinancialHealth } from "./health-diagnosis.js";
import { projectRecoveryMilestones } from "./recovery-projection.js";
import { planAllocationPriorities } from "./priority-planner.js";

test("FH-03: future unreceived income does not become eligible cash today", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 10000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [
        { id: "t-sal", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-15", income_confidence: "recurring" },
        { id: "t-mor", direction: "expense", category: "Moradia", amount_cents: 5000, settled_cents: 0, due_on: "2026-11-20" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  const alloc = planAllocationPriorities(diag);
  assert.equal(alloc.eligibleTodayCents, 10000);
});

test("FH-04: overdue essential bill blocks investment proposals even with positive monthly margin", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [
        { id: "t-late", direction: "expense", category: "Moradia", amount_cents: 40000, settled_cents: 0, due_on: "2026-11-05" },
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-15", income_confidence: "recurring" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  const alloc = planAllocationPriorities(diag);
  assert.equal(alloc.proposals[0].kind, "regularize_essentials");
  assert.equal(alloc.proposals.some((p) => p.kind === "capital_or_goals"), false);
});

test("FH-05: expensive debt + zero reserve offers explicit comparison without fixed 70/30 split", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      liabilities: [
        { id: "l1", label: "Cartão Rotativo", principal_cents: 150000, interest_rate_bps: 900, monthly_installment_cents: 50000, status: "active" },
      ],
      titles: [
        { id: "t-inc", direction: "income", category: "Salário", amount_cents: 400000, settled_cents: 0, due_on: "2026-11-05", income_confidence: "recurring" },
        { id: "t-mor", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2026-11-20" },
      ],
      assets: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  const alloc = planAllocationPriorities(diag);
  assert.equal(alloc.proposals[0].kind, "compare_debt_vs_cushion");
  assert.equal(alloc.proposals[0].options.length, 2);
});

test("Recovery milestones distinguish covered, saving, and K-month sustained stability", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 20000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      recurringRules: [
        { id: "r-inc", wallet_id: "w1", direction: "income", description: "Salário", category: "Salário", amount_cents: 300000, starts_on: "2026-11-05", ends_on: "2027-12-31" },
        { id: "r-exp", wallet_id: "w1", direction: "expense", description: "Aluguel", category: "Moradia", amount_cents: 150000, starts_on: "2026-11-10", ends_on: "2027-12-31" },
      ],
      titles: [
        { id: "t-debt", direction: "expense", category: "Empréstimos", amount_cents: 200000, settled_cents: 0, due_on: "2026-11-12" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  const milestones = projectRecoveryMilestones(diag);
  assert.equal(milestones.firstCoveredMonth, "2027-03");
  assert.equal(milestones.firstSavingMonth, "2027-03");
  assert.equal(milestones.firstStableMonth, "2027-03");
});

test("Recovery milestones separate firstCoveredMonth from firstSavingMonth when margin is initially zero", () => {
  const diag = diagnoseFinancialHealth(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [
        // Nov: negative margin (-500)
        { id: "t-n-inc", direction: "income", category: "Salário", amount_cents: 100000, settled_cents: 0, due_on: "2026-11-12" },
        { id: "t-n-exp", direction: "expense", category: "Moradia", amount_cents: 200000, settled_cents: 0, due_on: "2026-11-20" },
        // Dec: covered (minBalance >= 0) but zero margin (1000 - 1000 = 0)
        { id: "t-d-inc", direction: "income", category: "Salário", amount_cents: 150000, settled_cents: 0, due_on: "2026-12-01" },
        { id: "t-d-exp", direction: "expense", category: "Moradia", amount_cents: 150000, settled_cents: 0, due_on: "2026-12-15" },
        // Jan..Mar: positive margin and covered
        { id: "t-j-inc", direction: "income", category: "Salário", amount_cents: 200000, settled_cents: 0, due_on: "2027-01-01" },
        { id: "t-j-exp", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2027-01-15" },
        { id: "t-f-inc", direction: "income", category: "Salário", amount_cents: 200000, settled_cents: 0, due_on: "2027-02-01" },
        { id: "t-f-exp", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2027-02-15" },
        { id: "t-m-inc", direction: "income", category: "Salário", amount_cents: 200000, settled_cents: 0, due_on: "2027-03-01" },
        { id: "t-m-exp", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2027-03-15" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    { today: "2026-11-10" }
  );

  const milestones = projectRecoveryMilestones(diag);
  assert.equal(milestones.firstCoveredMonth, "2026-11");
  assert.equal(milestones.firstSavingMonth, "2027-01");
  assert.equal(milestones.firstStableMonth, "2027-01");
});
