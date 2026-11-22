import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionTitlesFromGoal, comparePlanningQuotes, compareSavedPlans, simulateGoalPurchase } from "./goal-planner.js";
import { buildFinancialHealthPlan } from "./financial-health.js";

test("FH-02: R$ 700 cash with R$ 600 rent tomorrow rejects R$ 500 down payment today", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 70000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [
        { id: "t-rent", direction: "expense", category: "Moradia", amount_cents: 60000, settled_cents: 0, due_on: "2026-11-11" },
        { id: "t-sal", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-15" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 10,
      installmentCents: 20000,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.isFeasible, false);
  assert.equal(result.desiredDateFeasible, false);
  assert.ok(result.rejectionReasons.includes("INSUFFICIENT_CASH"));
  assert.equal(result.bottleneckDate, "2026-11-11");
  // After salary on Nov 15, it becomes feasible!
  assert.equal(result.firstFeasibleDate, "2026-11-15");
});

test("FH-09: notebook R$ 2.500 (R$ 500 down + 10x R$ 200) checks all 10 installments, not just down payment", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      // Only a large expense in month 5 breaks installment #5!
      titles: [
        { id: "t-big", direction: "expense", category: "Outros", amount_cents: 120000, settled_cents: 0, due_on: "2027-04-10" },
      ],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 10,
      installmentCents: 20000,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10" }
  );

  assert.equal(result.isFeasible, false);
  assert.equal(result.installmentCountVerified, 10);
  assert.equal(result.bottleneckDate, "2027-04-10");
});

test("FH-10: installment beyond horizon rejects with HORIZON_INSUFFICIENT when extension is disabled", () => {
  const result = simulateGoalPurchase(
    {
      wallets: [
        { id: "w1", name: "Conta", opening_balance_cents: 500000, opening_at: "2026-11-01T00:00:00Z" },
      ],
      titles: [],
      assets: [],
      liabilities: [],
      settlements: [],
    },
    {
      title: "Notebook",
      targetCents: 250000,
      downPaymentCents: 50000,
      installmentCount: 18,
      installmentCents: 11112,
      desiredOn: "2026-11-10",
    },
    { today: "2026-11-10", extendHorizonIfNeeded: false }
  );

  assert.equal(result.isFeasible, false);
  assert.ok(result.rejectionReasons.includes("HORIZON_INSUFFICIENT"));
});

test("FH-11 & FH-18: impossible goal returns null firstFeasibleDate and never mutates real titles", () => {
  const rawData = {
    wallets: [
      { id: "w1", name: "Conta", opening_balance_cents: 10000, opening_at: "2026-11-01T00:00:00Z" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
    goals: [
      {
        id: "g1",
        title: "Compra Impossivel",
        target_cents: 500000,
        down_payment_cents: 500000,
        installment_count: 1,
        installment_cents: 0,
        desired_on: "2026-11-10",
        status: "simulated",
      },
    ],
  };

  const plan = buildFinancialHealthPlan(rawData, { today: "2026-11-10" });
  assert.equal(plan.goals.isFeasible, false);
  assert.equal(plan.goals.firstFeasibleDate, null);
  assert.equal(rawData.titles.length, 0);
  assert.equal(rawData.settlements.length, 0);
});

test("Caixinhas + Planejamento: linked goal caixinha abates down payment without touching Emergency Reserve", () => {
  // User has R$ 2.000 in checking, R$ 10.000 in Emergency Reserve Caixinha, and R$ 15.000 in Carro Caixinha.
  // Simulates a R$ 55.000 car with R$ 25.000 down payment + 30x R$ 1.000 linked ONLY to Carro Caixinha.
  // Effective down payment needed from checking/future cash is R$ 10.000 (25k - 15k), NEVER touching the R$ 10k Emergency Reserve!
  const rawData = {
    wallets: [
      { id: "w-chk", name: "Nubank", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" },
      { id: "w-res", name: "Reserva", opening_balance_cents: 1000000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "reserve", is_reserved: true, parent_wallet_id: "w-chk", caixinha_purpose: "reserve" },
      { id: "w-car", name: "Caixinha Carro", opening_balance_cents: 1500000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "investment", is_reserved: false, parent_wallet_id: "w-chk", caixinha_purpose: "goal" },
    ],
    goals: [
      { id: "g-res", title: "Reserva de emergência", category: "capital_goal", wallet_id: "w-res", parent_wallet_id: "w-chk", caixinha_purpose: "reserve", target_cents: 1200000, status: "simulated" },
      { id: "g-car", title: "Entrada do carro", category: "capital_goal", wallet_id: "w-car", parent_wallet_id: "w-chk", caixinha_purpose: "goal", target_cents: 2500000, status: "simulated" },
    ],
    recurringRules: [
      { id: "r1", wallet_id: "w-chk", direction: "income", description: "Salário", category: "Salário", amount_cents: 600000, starts_on: "2026-11-05" },
      { id: "r2", wallet_id: "w-chk", direction: "expense", description: "Contas", category: "Moradia", amount_cents: 300000, starts_on: "2026-11-10" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  // Trying today (2026-11-19): only R$ 2.000 free in checking + R$ 15.000 in Carro Caixinha = R$ 17.000 < R$ 25.000.
  // Because Emergency Reserve (R$ 10.000) is strictly protected, it must NOT be feasible today!
  const simToday = simulateGoalPurchase(
    rawData,
    {
      title: "Carro",
      targetCents: 5500000,
      downPaymentCents: 2500000,
      installmentCount: 30,
      installmentCents: 100000,
      sourceGoalId: "g-car",
      desiredOn: "2026-11-19",
    },
    { today: "2026-11-19" }
  );

  assert.equal(simToday.twoStepVerdict.coveredByCaixinhaCents, 1500000);
  assert.equal(simToday.twoStepVerdict.remainingDownPaymentCents, 1000000);
  assert.equal(simToday.twoStepVerdict.hasDownPaymentNow, false);
  assert.equal(simToday.isFeasible, false);

  // With monthly surplus of R$ 3.000/mo, in ~4 months (March 2027) remaining R$ 10k is covered and 30x R$ 1k fits!
  assert.ok(simToday.firstFeasibleDate && simToday.firstFeasibleDate <= "2027-04-05");
});

test("Credit Card purchase planning validates limit on purchase date, projects invoice due dates, and combines with Caixinha down payment", () => {
  const rawData = {
    wallets: [
      { id: "w-chk", name: "Nubank", opening_balance_cents: 300000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" },
      { id: "w-cx", name: "Caixinha Notebook", opening_balance_cents: 150000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "investment", parent_wallet_id: "w-chk", caixinha_purpose: "goal" },
    ],
    goals: [
      { id: "g-cx", title: "Caixinha Notebook", category: "capital_goal", wallet_id: "w-cx", parent_wallet_id: "w-chk", caixinha_purpose: "goal", target_cents: 150000, status: "simulated" },
    ],
    creditCards: [
      { id: "cc1", name: "Nubank Roxinho", limit_cents: 200000, closing_day: 5, due_day: 10 },
    ],
    recurringRules: [
      { id: "r1", wallet_id: "w-chk", direction: "income", description: "Salário", category: "Salário", amount_cents: 500000, starts_on: "2026-11-05" },
    ],
    titles: [
      // Existing open invoice due 2026-12-10 occupies R$ 1.200 -> only R$ 800 limit left on 2026-11-20!
      { id: "t-old", direction: "expense", category: "Outros", credit_card_id: "cc1", invoice_month: "2026-12", due_on: "2026-12-10", amount_cents: 120000, settled_cents: 0 },
    ],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  // Trying R$ 3.000 purchase on 2026-11-20 with R$ 1.500 down from Caixinha + R$ 1.500 in 5x on card:
  // Needs R$ 1.500 limit, but only R$ 800 is free on 2026-11-20!
  // On 2026-12-10, the R$ 1.200 invoice falls due and frees full R$ 2.000 limit!
  const sim = simulateGoalPurchase(
    rawData,
    {
      title: "Notebook",
      targetCents: 300000,
      downPaymentCents: 150000,
      installmentCount: 5,
      installmentCents: 30000,
      sourceGoalId: "g-cx",
      paymentMethod: "credit_card",
      creditCardId: "cc1",
      desiredOn: "2026-11-20",
    },
    { today: "2026-11-20" }
  );

  assert.equal(sim.isFeasible, false);
  assert.ok(sim.rejectionReasons.includes("INSUFFICIENT_CARD_LIMIT"));
  assert.equal(sim.twoStepVerdict.coveredByCaixinhaCents, 150000);
  assert.equal(sim.twoStepVerdict.creditCardVerdict.hasLimitOnDesiredDate, false);
  assert.equal(sim.twoStepVerdict.creditCardVerdict.availableOnDesiredDateCents, 80000);
  assert.equal(sim.twoStepVerdict.creditCardVerdict.requiredLimitCents, 150000);
  assert.equal(sim.twoStepVerdict.creditCardVerdict.limitReadyDate, "2026-12-10");
  assert.equal(sim.firstFeasibleDate, "2026-12-10");
  // Purchased on 2026-11-20 after closing day 5 -> would land in Dec; on Dec 10 -> rolls to Jan invoice
  assert.equal(sim.twoStepVerdict.creditCardVerdict.firstInvoiceMonth, "2026-12");
});

test("comparePlanningQuotes ranks Gol 2020 vs Cruze with links and projects wallet/caixinha/card Antes->Depois", () => {
  const rawData = {
    wallets: [
      { id: "w-chk", name: "Nubank", opening_balance_cents: 2200000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" },
    ],
    creditCards: [],
    recurringRules: [
      { id: "r1", wallet_id: "w-chk", direction: "income", description: "Salário", category: "Salário", amount_cents: 800000, starts_on: "2026-11-05" },
      { id: "r2", wallet_id: "w-chk", direction: "expense", description: "Moradia", category: "Moradia", amount_cents: 300000, starts_on: "2026-11-10" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  const result = comparePlanningQuotes(
    rawData,
    {
      title: "Trocar de carro",
      planType: "purchase",
      desiredOn: "2026-11-20",
      quotes: [
        {
          id: "q-cruze",
          label: "Cruze 2020",
          url: "https://example.com/cruze",
          targetCents: 6800000, // R$ 68.000
          downPaymentCents: 2000000, // R$ 20.000
          installmentCount: 48,
          paymentStructure: "hybrid",
          paymentMethod: "standard",
        },
        {
          id: "q-gol",
          label: "Gol 2020",
          url: "https://example.com/gol",
          targetCents: 6300000, // R$ 63.000
          downPaymentCents: 1800000, // R$ 18.000
          installmentCount: 48,
          paymentStructure: "hybrid",
          paymentMethod: "standard",
        },
      ],
    },
    { today: "2026-11-20" }
  );

  assert.equal(result.hasComparison, true);
  assert.equal(result.winner.id, "q-gol");
  assert.equal(result.winner.isWinner, true);
  assert.equal(result.winner.url, "https://example.com/gol");
  assert.equal(result.totalSavedVsWorstCents, 500000);
  const wp = result.winner.sim.projectedPositions.walletPosition;
  assert.equal(wp.balanceOnDateBeforeCents, 2200000);
  assert.equal(wp.immediateOutflowOnDateCents, 1800000);
  assert.equal(wp.balanceOnDateAfterCents, 400000);
});

test("Trip planning (Viagem Paraná dia 19) and Caixinha without down payment compute itemized card + checking positions", () => {
  const rawData = {
    wallets: [
      { id: "w-chk", name: "Itaú", opening_balance_cents: 400000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" },
    ],
    creditCards: [
      { id: "cc1", name: "Itaucard", limit_cents: 300000, closing_day: 5, due_day: 10 },
    ],
    recurringRules: [
      { id: "r1", wallet_id: "w-chk", direction: "income", description: "Salário", category: "Salário", amount_cents: 600000, starts_on: "2026-11-05" },
      { id: "r2", wallet_id: "w-chk", direction: "expense", description: "Fixos", category: "Moradia", amount_cents: 250000, starts_on: "2026-11-10" },
    ],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  // Viagem Paraná com itens mistos: Passagens 6x no cartão (R$ 1.200) + Hospedagem e alimentação à vista (R$ 1.500)
  const tripSim = simulateGoalPurchase(
    rawData,
    {
      title: "Viagem Paraná",
      planType: "trip",
      desiredOn: "2026-11-19",
      items: [
        { id: "1", title: "Passagens", amountCents: 120000, paymentMethod: "credit_card", creditCardId: "cc1", installmentCount: 6 },
        { id: "2", title: "Hospedagem", amountCents: 90000, paymentMethod: "standard", installmentCount: 1 },
        { id: "3", title: "Alimentação", amountCents: 60000, paymentMethod: "standard", installmentCount: 1 },
      ],
    },
    { today: "2026-11-19" }
  );

  assert.equal(tripSim.isFeasible, true);
  assert.equal(tripSim.totalCostCents, 270000);
  // Only Hospedagem + Alimentação leave checking immediately on Nov 19 (R$ 1.500 -> 400k - 150k = 250k)!
  assert.equal(tripSim.projectedPositions.walletPosition.immediateOutflowOnDateCents, 150000);
  assert.equal(tripSim.projectedPositions.walletPosition.balanceOnDateAfterCents, 250000);
  // Card limit reduced by R$ 1.200 (Passagens)
  assert.equal(tripSim.projectedPositions.cardPosition.chargeAmountCents, 120000);
  assert.equal(tripSim.projectedPositions.cardPosition.availableLimitAfterCents, 180000);

  // Buying a laptop upfront with zero down payment entered, choosing "create Caixinha" to save total R$ 3.000
  const caixinhaNoDown = simulateGoalPurchase(
    rawData,
    {
      title: "Notebook",
      targetCents: 300000,
      downPaymentCents: 0,
      paymentStructure: "upfront",
      downPaymentSource: "create_caixinha",
      createLinkedCaixinha: true,
      desiredOn: "2026-12-20",
    },
    { today: "2026-11-19" }
  );
  assert.ok(caixinhaNoDown.projectedPositions.caixinhaPosition);
  assert.equal(caixinhaNoDown.projectedPositions.caixinhaPosition.targetForPlanCents, 300000);
  assert.equal(caixinhaNoDown.projectedPositions.caixinhaPosition.stillNeededCents, 300000);
});

test("non-caixinha plan never leaks unrelated Caixinha (e.g. Entrada do carro) into caixinhaPosition", () => {
  const rawData = {
    wallets: [{ id: "w-chk", name: "Nubank", opening_balance_cents: 200000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" }],
    goals: [{ id: "g-car", title: "Entrada do carro", category: "capital_goal", target_cents: 1000000, wallet_id: "w-car" }],
    creditCards: [{ id: "cc1", name: "Nubank", limit_cents: 300000, closing_day: 10, due_day: 17 }],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  const sim = simulateGoalPurchase(
    rawData,
    {
      title: "Viagem ônibus ida e volta",
      targetCents: 123000,
      installmentCount: 12,
      paymentMethod: "credit_card",
      creditCardId: "cc1",
      downPaymentSource: "checking",
      sourceGoalId: "g-car", // stale/accidental sourceGoalId when not using caixinha
      desiredOn: "2026-12-16",
    },
    { today: "2026-11-22" }
  );

  assert.equal(sim.projectedPositions.caixinhaPosition, null);
});

test("buildExecutionTitlesFromGoal launches each trip item individually with its own card and installments", () => {
  const goalRecord = {
    id: "g-trip",
    title: "Viagem Paraná",
    desired_on: "2026-12-16",
    selected_wallet_id: "w-chk",
    quotes_json: [
      {
        id: "q-1",
        isChosen: true,
        items: [
          { id: "i1", title: "Passagens", amountCents: 56000, paymentMethod: "credit_card", creditCardId: "cc1", installmentCount: 12 },
          { id: "i2", title: "Hospedagem", amountCents: 35000, paymentMethod: "credit_card", creditCardId: "cc1", installmentCount: 1 },
          { id: "i3", title: "Alimentação", amountCents: 12000, paymentMethod: "standard", creditCardId: null, installmentCount: 1 },
        ],
      },
    ],
  };

  const items = buildExecutionTitlesFromGoal(goalRecord, { defaultWalletId: "w-chk", defaultCategory: "Lazer", today: "2026-11-22" });
  assert.equal(items.length, 3);
  assert.equal(items[0].description, "Passagens");
  assert.equal(items[0].amountCents, 56000);
  assert.equal(items[0].mode, "installments");
  assert.equal(items[0].installmentCount, 12);
  assert.equal(items[0].creditCardId, "cc1");

  assert.equal(items[1].description, "Hospedagem");
  assert.equal(items[1].mode, "single");
  assert.equal(items[1].creditCardId, "cc1");

  assert.equal(items[2].description, "Alimentação");
  assert.equal(items[2].paymentMethod, "standard");
  assert.equal(items[2].creditCardId, null);
});

test("compareSavedPlans ranks 2+ saved plans side by side after creation", () => {
  const rawData = {
    wallets: [{ id: "w-chk", name: "Nubank", opening_balance_cents: 150000, opening_at: "2026-11-01T00:00:00Z", wallet_kind: "checking" }],
    creditCards: [],
    titles: [],
    settlements: [],
    assets: [],
    liabilities: [],
  };

  const planBus = { id: "p-bus", title: "Viagem de ônibus", target_cents: 60000, installment_count: 1, desired_on: "2026-12-10", payment_method: "standard" };
  const planPlane = { id: "p-plane", title: "Viagem de avião", target_cents: 220000, installment_count: 1, desired_on: "2026-12-10", payment_method: "standard" };

  const cmp = compareSavedPlans(rawData, [planPlane, planBus], { today: "2026-11-22" });
  assert.equal(cmp.hasComparison, true);
  assert.equal(cmp.winner.id, "p-bus");
  assert.equal(cmp.totalSavedVsWorstCents, 160000);
});
