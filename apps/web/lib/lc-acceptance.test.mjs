import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeBudgetSummary } from "./budgets.js";
import { computeRange } from "./period.js";
import { diagnoseFinancialHealth } from "./health-diagnosis.js";
import { planAllocationPriorities } from "./priority-planner.js";
import { simulateGoalPurchase } from "./goal-planner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("LC-01 & LC-02: budget R$ 600 and plan R$ 300 on 01/12 create zero debt, titles, or realized consumption", () => {
  const data = {
    wallets: [{ id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" }],
    categories: [{ id: "c-food", name: "Alimentação", direction: "expense", parent_id: null, canonical_key: "expense.alimentacao", is_essential: true }],
    budgetRules: [{ id: "br1", category_id: "c-food", limit_cents: 60000, starts_month: "2026-12", active: true }],
    spendingPlans: [{ id: "p1", category_id: "c-food", description: "Mercado", estimated_amount_cents: 30000, planned_for: "2026-12-01", planned_month: "2026-12", status: "planned" }],
    titles: [],
    settlements: [],
    economicEvents: [],
    liabilities: [],
    assets: [],
  };

  const diag = diagnoseFinancialHealth(data, { today: "2026-11-17" });
  assert.equal(diag.diagnosis.indicators.liveCashCents, 100000);
  assert.equal(diag.diagnosis.indicators.outstandingDebtCents, 0);

  const bud = computeBudgetSummary({
    month: "2026-12",
    categories: data.categories,
    budgetRules: data.budgetRules,
    spendingPlans: data.spendingPlans,
    today: "2026-11-17",
  });
  assert.equal(bud[0].realizedCents, 0);
  assert.equal(bud[0].plannedRemainingCents, 30000);
  assert.equal(bud[0].unallocatedCents, 30000);
  assert.equal(bud[0].remainingLimitCents, 60000);
});

test("LC-08 & LC-10: credit purchase R$ 300 on 01/12 due 10/01 consumes Dec budget once and hits cash only on 10/01", () => {
  const categories = [{ id: "c-food", name: "Alimentação", direction: "expense", parent_id: null }];
  const budgetRules = [{ id: "br1", category_id: "c-food", limit_cents: 60000, starts_month: "2026-12", active: true }];
  const economicEvents = [
    { id: "ev1", direction: "expense", description: "Mercado crédito", amount_cents: 30000, occurred_on: "2026-12-01", category_id: "c-food", status: "committed" },
  ];
  const titles = [
    { id: "t1", direction: "expense", description: "Mercado crédito", category: "Alimentação", category_id: "c-food", economic_event_id: "ev1", amount_cents: 30000, settled_cents: 0, due_on: "2027-01-10" },
  ];

  const decBud = computeBudgetSummary({ month: "2026-12", categories, budgetRules, economicEvents, titles });
  const janBud = computeBudgetSummary({ month: "2027-01", categories, budgetRules, economicEvents, titles });
  assert.equal(decBud[0].realizedCents, 30000);
  assert.equal(decBud[0].committedUnrealizedCents, 0);
  assert.equal(janBud[0].realizedCents, 0);
  assert.equal(janBud[0].committedUnrealizedCents, 0);
});

test("LC-09, LC-11, LC-17, LC-24: category without limit allows plans, and recurring rent is committed unrealized without duplicating", () => {
  const categories = [
    { id: "c-mor", name: "Moradia", direction: "expense", parent_id: null },
    { id: "c-laz", name: "Lazer", direction: "expense", parent_id: null },
  ];
  const recurringRules = [
    { id: "rr1", wallet_id: "w1", direction: "expense", description: "Aluguel", category: "Moradia", category_id: "c-mor", amount_cents: 120000, starts_on: "2026-12-05", ends_on: "2099-12-31" },
  ];
  const spendingPlans = [
    { id: "p-laz", category_id: "c-laz", description: "Show", estimated_amount_cents: 15000, planned_for: "2026-12-12", planned_month: "2026-12", status: "planned" },
  ];

  const summary = computeBudgetSummary({
    month: "2026-12",
    categories,
    recurringRules,
    spendingPlans,
    today: "2026-11-17",
  });
  const mor = summary.find((x) => x.categoryId === "c-mor");
  const laz = summary.find((x) => x.categoryId === "c-laz");

  assert.equal(mor.realizedCents, 0);
  assert.equal(mor.committedUnrealizedCents, 120000);
  assert.equal(laz.limitCents, null);
  assert.equal(laz.plannedRemainingCents, 15000);
});

test("LC-12, LC-13, LC-14, LC-15, LC-25: dated plan hits 01/12 (not 31/12), undated plan flags assumption, and within_budgets never double counts", () => {
  const data = {
    wallets: [{ id: "w1", name: "Conta", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" }],
    categories: [{ id: "c-food", name: "Alimentação", direction: "expense", parent_id: null }],
    budgetRules: [{ id: "br1", category_id: "c-food", limit_cents: 60000, starts_month: "2026-12", active: true }],
    titles: [
      { id: "t-rent", direction: "expense", description: "Aluguel", category: "Moradia", amount_cents: 60000, settled_cents: 0, due_on: "2026-12-02" },
    ],
    spendingPlans: [
      { id: "p1", category_id: "c-food", description: "Mercado", estimated_amount_cents: 30000, planned_for: "2026-12-01", planned_month: "2026-12", status: "planned" },
    ],
    settlements: [],
    economicEvents: [],
    assets: [],
    liabilities: [],
  };

  // Range Dec 1..31 from Nov 25:
  // Opening = 1000; Dec 1 plan (-300) => 700; Dec 2 rent (-600) => 100; Dec 31 unallocated residual (-300) => -200
  const r = computeRange(data, "2026-11-25", "2026-12-31", "2026-11-25");
  const dec1WithPlans = r.dailyWithPlans.find((d) => d.date === "2026-12-01");
  const dec2WithPlans = r.dailyWithPlans.find((d) => d.date === "2026-12-02");
  assert.equal(dec1WithPlans.balance, 70000);
  assert.equal(dec2WithPlans.balance, 10000);
  // Contractual does NOT subtract spending plan: 1000 - 600 = 400
  assert.equal(r.projectedCash, 40000);
  // With plans: 1000 - 600 - 300 = 100
  assert.equal(r.projectedCashWithPlans, 10000);
  // Within budgets: 1000 - 600 - 300 (plan) - 300 (unallocated) = -200 (total food = 600, NOT 900!)
  assert.equal(r.projectedCashWithinBudgets, -20000);

  // LC-25: Priority planner & Goal planner respect the R$ 300 plan on 01/12!
  const diag = diagnoseFinancialHealth(data, { today: "2026-11-25" });
  const alloc = planAllocationPriorities(diag);
  assert.equal(alloc.eligibleTodayCents, 10000); // 1000 - 600 rent - 300 plan = 100!

  const sim = simulateGoalPurchase(
    data,
    { title: "Compra R$ 200", targetCents: 20000, downPaymentCents: 20000, installmentCount: 1, desiredOn: "2026-12-01" },
    { today: "2026-11-25" }
  );
  assert.equal(sim.isFeasible, false);
  assert.equal(sim.bottleneckDate, "2026-12-02");

  // LC-15: Undated plan sets hasUndatedPlans=true and explicit assumption
  const undated = {
    ...data,
    spendingPlans: [{ ...data.spendingPlans[0], planned_for: null }],
  };
  const rUndated = computeRange(undated, "2026-11-25", "2026-12-31", "2026-11-25");
  assert.equal(rUndated.hasUndatedPlans, true);
});

test("LC-18 & LC-23: API isolates spending plans by owner.id and EntryDrawer avoids technical jargon", () => {
  const routeSrc = readFileSync(path.join(__dirname, "./portfolio-service.js"), "utf8");
  assert.match(routeSrc, /FROM public\.kc_spending_plans WHERE user_id=\$\{owner\.id\}/);
  assert.match(routeSrc, /FROM public\.kc_spending_plan_applications WHERE user_id=\$\{owner\.id\}/);
  assert.match(routeSrc, /UPDATE public\.kc_spending_plans SET status='cancelled'.*AND user_id=\$\{owner\.id\}/);

  const drawerSrc = readFileSync(path.join(__dirname, "../app/dashboard/EntryDrawer.jsx"), "utf8");
  assert.match(drawerSrc, />A pagar</);
  assert.match(drawerSrc, />A receber</);
  assert.match(drawerSrc, />Emprestar</);
  assert.match(drawerSrc, />Já paguei</);
  assert.doesNotMatch(drawerSrc, />[A-Za-zÀ-ÿ0-9\s·\-:]*\b(economic_event|competence_source|title_id|ledger|settlement)\b[A-Za-zÀ-ÿ0-9\s·\-:]*</i);

  const dashSrc = readFileSync(path.join(__dirname, "../app/dashboard/Dashboard.jsx"), "utf8");
  assert.doesNotMatch(dashSrc, />\s*A receber<\/button>/);
  assert.doesNotMatch(dashSrc, />\s*A pagar<\/button>/);
});
