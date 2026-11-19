import { brDay, cents, compute, dayAdd, isoDate, monthOf } from "./finance.js";
import { lastDayOfMonth, moveMonth } from "./period.js";
import { expandRecurring } from "./recurring.js";
import { reconcilePortfolio } from "./reconciliation.js";
import { resolvePolicy } from "./health-policy.js";
import { enrichSpendingPlans } from "./spending-plans.js";
import { computeBudgetSummary } from "./budgets.js";

/**
 * Brazilian Tabela Price (French amortization) monthly installment in integer cents.
 */
export function computePriceInstallmentCents({
  financedCents = 0,
  installmentCount = 1,
  monthlyInterestBps = 0,
}) {
  const pv = Math.max(0, cents(financedCents));
  const n = Math.max(1, Number(installmentCount || 1));
  if (pv <= 0) return 0;
  const bps = Math.max(0, Number(monthlyInterestBps || 0));
  if (bps <= 0) return Math.ceil(pv / n);
  const i = bps / 10000;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  return Math.ceil(pv * factor);
}

function addMonthsIso(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(end, d));
  return dt.toISOString().slice(0, 10);
}

function buildSchedule(goal, startDate) {
  const target = Math.max(0, cents(goal.targetCents));
  const down = Math.min(target, Math.max(0, cents(goal.downPaymentCents)));
  const count = Math.max(1, Number(goal.installmentCount || 1));
  const remaining = Math.max(0, target - down);
  const explicitInst = cents(goal.installmentCents);
  const perInst =
    explicitInst > 0
      ? explicitInst
      : remaining > 0
        ? computePriceInstallmentCents({
            financedCents: remaining,
            installmentCount: count,
            monthlyInterestBps: goal.interestBps || 0,
          })
        : 0;

  const outflows = [];
  if (down > 0) {
    outflows.push({ date: startDate, amountCents: down, kind: "down_payment" });
  }

  if (remaining > 0 || (down === 0 && perInst > 0)) {
    for (let i = 0; i < count; i++) {
      const date = down === 0 && i === 0 ? startDate : addMonthsIso(startDate, down > 0 ? i + 1 : i);
      outflows.push({ date, amountCents: perInst, kind: "installment", index: i + 1 });
    }
  } else if (down === 0 && target > 0) {
    outflows.push({ date: startDate, amountCents: target, kind: "single" });
  }

  outflows.sort((a, b) => a.date.localeCompare(b.date));
  return outflows;
}

function evaluateCandidate(daily, floorCents, outflows, horizonEnd) {
  if (!daily.length) {
    return { feasible: false, reason: "INCOMPLETE_DATA", bottleneckDate: null, shortfallCents: 0 };
  }

  const lastOutflowDate = outflows[outflows.length - 1]?.date;
  if (lastOutflowDate && lastOutflowDate > horizonEnd) {
    return {
      feasible: false,
      reason: "HORIZON_INSUFFICIENT",
      bottleneckDate: lastOutflowDate,
      shortfallCents: 0,
    };
  }

  const extraByDate = new Map();
  for (const o of outflows) {
    extraByDate.set(o.date, (extraByDate.get(o.date) || 0) + o.amountCents);
  }

  let cumulativeExtra = 0;
  let worstShortfall = 0;
  let bottleneckDate = null;
  const startDate = outflows[0]?.date;

  for (const d of daily) {
    if (d.date < startDate) continue;
    cumulativeExtra += extraByDate.get(d.date) || 0;
    const simulated = d.balance - cumulativeExtra;
    if (simulated < floorCents) {
      const shortfall = floorCents - simulated;
      if (!bottleneckDate) bottleneckDate = d.date;
      if (shortfall > worstShortfall) {
        worstShortfall = shortfall;
      }
    }
  }

  if (worstShortfall > 0) {
    return {
      feasible: false,
      reason: "INSUFFICIENT_CASH",
      bottleneckDate,
      shortfallCents: worstShortfall,
    };
  }

  return { feasible: true, reason: null, bottleneckDate: null, shortfallCents: 0 };
}

/**
 * PCP/MRP-inspired goal & purchase feasibility planner (ADR-009 Section 8).
 * Never mutates real titles, settlements, or balances.
 */
export function simulateGoalPurchase(rawData, goal, options = {}) {
  const today = options.today || brDay();
  const policy = resolvePolicy(options.policy);
  const extendHorizonIfNeeded = options.extendHorizonIfNeeded !== false;
  const baseHorizonEnd =
    options.horizonEnd || lastDayOfMonth(moveMonth(today, policy.horizonMonths - 1) + "-01");

  const reconciled = reconcilePortfolio(rawData);
  if (!reconciled.knownCash) {
    return {
      title: goal.title || "Objetivo",
      isFeasible: false,
      firstFeasibleDate: null,
      desiredDateFeasible: null,
      rejectionReasons: ["INCOMPLETE_DATA"],
      assumptions: ["Informe o saldo inicial das contas para simular compras."],
      bottleneckDate: null,
      bottleneckShortfallCents: 0,
      scenarios: [],
    };
  }

  const installmentCount = Math.max(1, Number(goal.installmentCount || 1));
  const maxMonthsNeeded = policy.horizonMonths + installmentCount + 1;
  const simulationEnd = extendHorizonIfNeeded
    ? lastDayOfMonth(moveMonth(today, Math.min(36, maxMonthsNeeded)) + "-01")
    : baseHorizonEnd;

  const filteredData = {
    ...rawData,
    titles: reconciled.consumptionTitles,
  };
  const expanded = expandRecurring(filteredData, today, simulationEnd);
  const computed = compute(expanded, simulationEnd, today);

  // LC-14, LC-15, LC-25: Include active spending plans in the prudent daily curve
  // Dated plans hit expected_payment_on || planned_for; undated plans conservatively hit max(today, firstDayOfMonth(planned_month)).
  const enrichedPlans = enrichSpendingPlans(
    rawData?.spendingPlans || [],
    rawData?.spendingPlanApplications || [],
    today,
    rawData?.economicEvents || []
  );
  const plansByDay = new Map();
  let activePlansCount = 0;
  let hasUndatedPlans = false;
  for (const p of enrichedPlans) {
    if (!p.active || p.remainingCents <= 0) continue;
    const rawDay = p.expected_payment_on || p.planned_for || null;
    if (!rawDay) hasUndatedPlans = true;
    const targetDay = rawDay ? isoDate(rawDay) : `${p.planned_month}-01`;
    const effectiveDay = targetDay < today ? today : targetDay;
    if (effectiveDay <= simulationEnd) {
      plansByDay.set(effectiveDay, (plansByDay.get(effectiveDay) || 0) + p.remainingCents);
      activePlansCount++;
    }
  }
  let cumPlans = 0;
  const daily = (computed.daily || []).map((d) => {
    cumPlans += plansByDay.get(d.date) || 0;
    return { date: d.date, balance: d.balance - cumPlans };
  });

  const useCapital = Boolean(goal.useCapitalInDownPayment);
  const protectedFloorCents =
    policy.minimumCashFloorCents + (useCapital ? 0 : (reconciled.walletReserveCents ?? 0));

  const downCents = Math.min(Math.max(0, cents(goal.targetCents)), Math.max(0, cents(goal.downPaymentCents)));
  const financedCents = Math.max(0, cents(goal.targetCents) - downCents);
  const explicitInstCents = cents(goal.installmentCents);
  const perInstallmentCents =
    explicitInstCents > 0
      ? explicitInstCents
      : financedCents > 0
        ? computePriceInstallmentCents({
            financedCents,
            installmentCount,
            monthlyInterestBps: goal.interestBps || 0,
          })
        : 0;
  const totalInterestCents = Math.max(0, perInstallmentCents * installmentCount - financedCents);
  const totalCostCents = downCents + perInstallmentCents * installmentCount;

  // Step 1 & Step 2 independent verdict (Entrada vs Parcela no orçamento mensal)
  const currentMonth = String(today).slice(0, 7);
  const currentBudgets = computeBudgetSummary({
    month: currentMonth,
    categories: rawData?.categories || [],
    budgetRules: rawData?.budgetRules || [],
    budgetPeriods: rawData?.budgetPeriods || [],
    economicEvents: rawData?.economicEvents || [],
    titles: rawData?.titles || [],
    recurringRules: rawData?.recurringRules || [],
    cancelledRecurring: rawData?.cancelledRecurring || [],
    spendingPlans: rawData?.spendingPlans || [],
    spendingPlanApplications: rawData?.spendingPlanApplications || [],
    today,
  });
  const unspentControlledBudgetsCents = currentBudgets.reduce(
    (sum, b) => sum + (b.limitCents !== null ? Math.max(0, cents(b.limitCents) - cents(b.usedCents)) : 0),
    0
  );
  const sampleMonths = [currentMonth, moveMonth(today, 1), moveMonth(today, 2)];
  const monthlySurpluses = sampleMonths.map((ym) => {
    const inc = (expanded.titles || [])
      .filter((t) => !t.cancelled_at && t.direction === "income" && !t.liability_id && monthOf(t.due_on) === ym)
      .reduce((s, t) => s + cents(t.amount_cents), 0);
    const exp = (expanded.titles || [])
      .filter((t) => !t.cancelled_at && t.direction === "expense" && monthOf(t.due_on) === ym)
      .reduce((s, t) => s + cents(t.amount_cents), 0);
    return inc - exp - unspentControlledBudgetsCents;
  });
  const avgMonthlyFreeSurplusCents = Math.round(
    monthlySurpluses.reduce((s, v) => s + v, 0) / monthlySurpluses.length
  );

  const availableForDownCents = Math.max(
    0,
    (useCapital ? (reconciled.totalWalletCashCents ?? 0) : (reconciled.operatingCashCents ?? 0)) - policy.minimumCashFloorCents
  );
  const hasDownPaymentNow = downCents === 0 || availableForDownCents >= downCents;
  let downPaymentReadyDate = hasDownPaymentNow ? today : null;
  if (!downPaymentReadyDate) {
    const foundDay = daily.find((d) => d.balance - protectedFloorCents >= downCents);
    downPaymentReadyDate = foundDay ? foundDay.date : null;
  }
  const installmentFitsMonthly = perInstallmentCents === 0 || avgMonthlyFreeSurplusCents >= perInstallmentCents;
  const monthlyGapCents = Math.max(0, perInstallmentCents - Math.max(0, avgMonthlyFreeSurplusCents));

  const desiredDate = goal.desiredOn && goal.desiredOn >= today ? goal.desiredOn : today;
  const desiredSchedule = buildSchedule(goal, desiredDate);
  const desiredEval = evaluateCandidate(daily, protectedFloorCents, desiredSchedule, simulationEnd);

  // Search for first feasible date up to baseHorizonEnd
  let firstFeasibleDate = desiredEval.feasible ? desiredDate : null;
  if (!firstFeasibleDate) {
    for (let d = today; d <= baseHorizonEnd; d = dayAdd(d, 1)) {
      const sched = buildSchedule(goal, d);
      const ev = evaluateCandidate(daily, protectedFloorCents, sched, simulationEnd);
      if (ev.feasible) {
        firstFeasibleDate = d;
        break;
      }
    }
  }

  const rejectionReasons = [];
  if (!desiredEval.feasible && desiredEval.reason) {
    rejectionReasons.push(desiredEval.reason);
  }
  if (!firstFeasibleDate) {
    rejectionReasons.push("NO_VIABLE_DATE_IN_HORIZON");
  }

  const assumptions = [];
  if (simulationEnd > baseHorizonEnd) {
    assumptions.push(
      `Horizonte estendido ate ${simulationEnd} usando premissas atuais para validar todas as ${installmentCount} parcela(s).`
    );
  }
  if (activePlansCount > 0) {
    assumptions.push(
      `Simulacao prudente incluiu ${activePlansCount} plano(s) de gasto ativo(s) sem trata-los como divida.`
    );
  }
  if (hasUndatedPlans) {
    assumptions.push(
      "Planos sem dia exato foram protegidos de forma conservadora no inicio do mes previsto."
    );
  }

  // Comparable scenarios (à vista, entrada maior, adiado)
  const cashSchedule = buildSchedule(
    { ...goal, downPaymentCents: goal.targetCents, installmentCount: 1, installmentCents: 0 },
    desiredDate
  );
  const cashEval = evaluateCandidate(daily, protectedFloorCents, cashSchedule, simulationEnd);

  const halfDown = Math.round(cents(goal.targetCents) / 2);
  const higherDownSchedule = buildSchedule(
    {
      ...goal,
      downPaymentCents: halfDown,
      installmentCents: Math.ceil((cents(goal.targetCents) - halfDown) / installmentCount),
    },
    desiredDate
  );
  const higherDownEval = evaluateCandidate(
    daily,
    protectedFloorCents,
    higherDownSchedule,
    simulationEnd
  );

  const scenarios = [
    {
      id: "planned",
      label: "Plano informado",
      startDate: desiredDate,
      feasible: desiredEval.feasible,
      reason: desiredEval.reason,
    },
    {
      id: "cash",
      label: "À vista na data desejada",
      startDate: desiredDate,
      feasible: cashEval.feasible,
      reason: cashEval.reason,
    },
    {
      id: "higher_down_payment",
      label: "Entrada de 50% + parcelas menores",
      startDate: desiredDate,
      feasible: higherDownEval.feasible,
      reason: higherDownEval.reason,
    },
  ];
  if (firstFeasibleDate && firstFeasibleDate !== desiredDate) {
    scenarios.push({
      id: "postponed",
      label: `Adiar para ${firstFeasibleDate}`,
      startDate: firstFeasibleDate,
      feasible: true,
      reason: null,
    });
  }

  return {
    title: goal.title || "Objetivo",
    isFeasible: desiredEval.feasible,
    firstFeasibleDate,
    desiredDateFeasible: desiredEval.feasible,
    rejectionReasons: [...new Set(rejectionReasons)],
    assumptions,
    bottleneckDate: desiredEval.bottleneckDate,
    bottleneckShortfallCents: desiredEval.shortfallCents,
    installmentCountVerified: installmentCount,
    perInstallmentCents,
    totalInterestCents,
    totalCostCents,
    twoStepVerdict: {
      downPaymentCents: downCents,
      availableForDownCents,
      hasDownPaymentNow,
      downPaymentReadyDate,
      perInstallmentCents,
      monthlyFreeSurplusCents: avgMonthlyFreeSurplusCents,
      installmentFitsMonthly,
      monthlyGapCents,
    },
    scenarios,
  };
}
