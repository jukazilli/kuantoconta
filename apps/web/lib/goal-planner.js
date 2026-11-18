import { brDay, cents, compute, dayAdd } from "./finance.js";
import { lastDayOfMonth, moveMonth } from "./period.js";
import { expandRecurring } from "./recurring.js";
import { reconcilePortfolio } from "./reconciliation.js";
import { resolvePolicy } from "./health-policy.js";

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
        ? Math.ceil(remaining / count)
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
  const daily = computed.daily || [];

  const protectedFloorCents =
    policy.minimumCashFloorCents + (reconciled.walletReserveCents ?? 0);

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
    scenarios,
  };
}
