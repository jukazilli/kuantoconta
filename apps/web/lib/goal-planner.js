import { brDay, cents, compute, dayAdd, isoDate, monthOf } from "./finance.js";
import { lastDayOfMonth, moveMonth } from "./period.js";
import { expandRecurring } from "./recurring.js";
import { reconcilePortfolio } from "./reconciliation.js";
import { resolvePolicy } from "./health-policy.js";
import { enrichSpendingPlans } from "./spending-plans.js";
import { computeBudgetSummary } from "./budgets.js";
import { computeCapitalPace } from "./capital-pace.js";
import { normalizeCategoryName } from "./taxonomy.js";
import {
  addMonthsYm,
  computeCardUsageAtDate,
  computeInvoiceCycleForPurchase,
  getInvoiceCycleDates,
} from "./credit-cards.js";

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

function buildSchedule(goal, startDate, coveredByCaixinhaCents = 0, selectedCard = null, allCards = []) {
  const items = Array.isArray(goal.items) ? goal.items.filter((it) => cents(it?.amountCents) > 0) : [];
  if (items.length > 0 && cents(goal.downPaymentCents) === 0 && !selectedCard) {
    const outflows = [];
    let caixinhaPool = Math.max(0, cents(coveredByCaixinhaCents));
    for (const it of items) {
      const amt = cents(it.amountCents);
      const cnt = Math.max(1, Number(it.installmentCount || 1));
      const itCard =
        it.paymentMethod === "credit_card" && it.creditCardId
          ? (allCards || []).find((c) => String(c.id) === String(it.creditCardId) && !c.archived_at) || null
          : null;
      if (itCard) {
        const floor = Math.floor(amt / cnt);
        const rem = amt % cnt;
        const firstCycle = computeInvoiceCycleForPurchase({
          purchaseDate: startDate,
          closingDay: itCard.closing_day,
          dueDay: itCard.due_day,
        });
        for (let i = 0; i < cnt; i++) {
          const chunk = floor + (i < rem ? 1 : 0);
          const ym = addMonthsYm(firstCycle.invoiceMonth, i);
          const { dueDate } = getInvoiceCycleDates(itCard, ym);
          if (chunk > 0) outflows.push({ date: dueDate, amountCents: chunk, kind: "card_installment", invoiceMonth: ym, index: i + 1 });
        }
      } else {
        const coveredNow = cnt === 1 ? Math.min(caixinhaPool, amt) : 0;
        caixinhaPool -= coveredNow;
        const netAmt = amt - coveredNow;
        if (cnt === 1 && netAmt > 0) {
          outflows.push({ date: startDate, amountCents: netAmt, kind: "single" });
        } else if (cnt > 1 && netAmt > 0) {
          const floor = Math.floor(netAmt / cnt);
          const rem = netAmt % cnt;
          for (let i = 0; i < cnt; i++) {
            const chunk = floor + (i < rem ? 1 : 0);
            if (chunk > 0) outflows.push({ date: addMonthsIso(startDate, i), amountCents: chunk, kind: "installment", index: i + 1 });
          }
        }
      }
    }
    outflows.sort((a, b) => a.date.localeCompare(b.date));
    return outflows;
  }

  const target = Math.max(0, cents(goal.targetCents));
  const down = Math.min(target, Math.max(0, cents(goal.downPaymentCents)));
  const covered = Math.min(down > 0 ? down : target, Math.max(0, cents(coveredByCaixinhaCents)));
  const netDown = Math.max(0, down - covered);
  const count = Math.max(1, Number(goal.installmentCount || 1));
  const remaining = Math.max(0, target - down);
  const explicitInst = cents(goal.installmentCents);
  const cardFinancedBase =
    selectedCard && down === 0 ? Math.max(0, target - covered) : remaining;
  const perInst =
    explicitInst > 0
      ? explicitInst
      : cardFinancedBase > 0
        ? computePriceInstallmentCents({
            financedCents: cardFinancedBase,
            installmentCount: count,
            monthlyInterestBps: goal.interestBps || 0,
          })
        : 0;

  const outflows = [];
  if (netDown > 0) {
    outflows.push({ date: startDate, amountCents: netDown, kind: "down_payment" });
  }

  if (selectedCard) {
    if (cardFinancedBase > 0 && perInst > 0) {
      const firstCycle = computeInvoiceCycleForPurchase({
        purchaseDate: startDate,
        closingDay: selectedCard.closing_day,
        dueDay: selectedCard.due_day,
      });
      for (let i = 0; i < count; i++) {
        const ym = addMonthsYm(firstCycle.invoiceMonth, i);
        const { dueDate } = getInvoiceCycleDates(selectedCard, ym);
        outflows.push({
          date: dueDate,
          amountCents: perInst,
          kind: "card_installment",
          invoiceMonth: ym,
          index: i + 1,
        });
      }
    }
  } else if (remaining > 0 || (down === 0 && perInst > 0)) {
    for (let i = 0; i < count; i++) {
      const date = down === 0 && i === 0 ? startDate : addMonthsIso(startDate, down > 0 ? i + 1 : i);
      const amt = i === 0 && down === 0 ? Math.max(0, perInst - covered) : perInst;
      if (amt > 0) outflows.push({ date, amountCents: amt, kind: "installment", index: i + 1 });
    }
  } else if (down === 0 && target > 0) {
    const netSingle = Math.max(0, target - covered);
    if (netSingle > 0) outflows.push({ date: startDate, amountCents: netSingle, kind: "single" });
  }

  outflows.sort((a, b) => a.date.localeCompare(b.date));
  return outflows;
}

/**
 * Validates that payment splits sum to totalCents without negative values.
 */
export function validatePaymentSplits({ totalCents = 0, splits = [] }) {
  const total = Math.max(0, cents(totalCents));
  const list = Array.isArray(splits) ? splits : [];
  if (list.length === 0) {
    return { ok: true, allocatedCents: total, remainingCents: 0, error: "" };
  }
  const allocatedCents = list.reduce((s, sp) => s + Math.max(0, cents(sp?.amountCents)), 0);
  const remainingCents = total - allocatedCents;
  if (total > 0 && remainingCents > 0) {
    return { ok: false, allocatedCents, remainingCents, error: "A soma das formas de pagamento ainda está abaixo do valor total." };
  }
  if (total > 0 && remainingCents < 0) {
    return { ok: false, allocatedCents, remainingCents, error: "A soma das formas de pagamento ultrapassa o valor total." };
  }
  return { ok: true, allocatedCents, remainingCents: 0, error: "" };
}

function collectPlanSplits(goal = {}) {
  const topSplits = Array.isArray(goal.paymentSplits)
    ? goal.paymentSplits.filter((sp) => cents(sp?.amountCents) > 0)
    : [];
  if (topSplits.length > 0) return topSplits;

  const items = Array.isArray(goal.items) ? goal.items.filter((it) => cents(it?.amountCents) > 0) : [];
  const itemSplits = [];
  let hasItemLevelSplits = false;
  for (const it of items) {
    if (Array.isArray(it.paymentSplits) && it.paymentSplits.length > 0) {
      hasItemLevelSplits = true;
      for (const sp of it.paymentSplits) {
        if (cents(sp?.amountCents) > 0) itemSplits.push(sp);
      }
    } else {
      itemSplits.push({
        paymentMethod: it.paymentMethod || "standard",
        creditCardId: it.creditCardId || null,
        walletId: it.walletId || goal.selectedWalletId || null,
        sourceGoalId: it.sourceGoalId || null,
        amountCents: cents(it.amountCents),
        installmentCount: Math.max(1, Number(it.installmentCount || 1)),
        interestBps: Number(it.interestBps || 0),
      });
    }
  }
  if (hasItemLevelSplits) return itemSplits;
  return null;
}

function buildScheduleFromSplits(splits, startDate, allCards = [], caixinhaBalancesByGoalId = new Map()) {
  const outflows = [];
  const remainingCaixinhaById = new Map(caixinhaBalancesByGoalId);

  for (const sp of splits) {
    const amt = Math.max(0, cents(sp?.amountCents));
    if (amt <= 0) continue;
    const count = Math.max(1, Math.min(120, Number(sp?.installmentCount || 1)));
    const bps = Math.min(10000, Math.max(0, Number(sp?.interestBps || 0)));

    if (sp.paymentMethod === "caixinha" && sp.sourceGoalId) {
      const avail = remainingCaixinhaById.get(String(sp.sourceGoalId)) || 0;
      const used = Math.min(amt, avail);
      remainingCaixinhaById.set(String(sp.sourceGoalId), Math.max(0, avail - used));
      const uncovered = Math.max(0, amt - used);
      if (uncovered > 0) {
        outflows.push({ date: startDate, amountCents: uncovered, kind: "down_payment" });
      }
      continue;
    }

    if (sp.paymentMethod === "credit_card" && sp.creditCardId) {
      const card = allCards.find((c) => String(c.id) === String(sp.creditCardId) && !c.archived_at);
      const perInst =
        count > 1
          ? computePriceInstallmentCents({ financedCents: amt, installmentCount: count, monthlyInterestBps: bps })
          : amt;
      if (card) {
        const firstCycle = computeInvoiceCycleForPurchase({
          purchaseDate: startDate,
          closingDay: card.closing_day,
          dueDay: card.due_day,
        });
        for (let i = 0; i < count; i++) {
          const ym = addMonthsYm(firstCycle.invoiceMonth, i);
          const { dueDate } = getInvoiceCycleDates(card, ym);
          outflows.push({
            date: dueDate,
            amountCents: perInst,
            kind: "card_installment",
            invoiceMonth: ym,
            index: i + 1,
          });
        }
      } else {
        for (let i = 0; i < count; i++) {
          outflows.push({ date: addMonthsIso(startDate, i), amountCents: perInst, kind: "installment", index: i + 1 });
        }
      }
      continue;
    }

    // Standard checking account payment
    if (count === 1) {
      outflows.push({ date: startDate, amountCents: amt, kind: "single" });
    } else {
      const perInst = computePriceInstallmentCents({ financedCents: amt, installmentCount: count, monthlyInterestBps: bps });
      for (let i = 0; i < count; i++) {
        outflows.push({ date: addMonthsIso(startDate, i), amountCents: perInst, kind: "installment", index: i + 1 });
      }
    }
  }

  outflows.sort((a, b) => a.date.localeCompare(b.date));
  return outflows;
}

function evaluateCandidate(daily, floorCents, outflows, horizonEnd, cardCheck = null, candidateStartDate = null) {
  if (cardCheck && candidateStartDate) {
    const cardEval = cardCheck(candidateStartDate);
    if (!cardEval.ok) {
      return {
        feasible: false,
        reason: "INSUFFICIENT_CARD_LIMIT",
        bottleneckDate: candidateStartDate,
        shortfallCents: cardEval.shortfallCents,
      };
    }
  }
  if (!daily.length) {
    return { feasible: false, reason: "INCOMPLETE_DATA", bottleneckDate: null, shortfallCents: 0 };
  }
  if (!outflows.length) {
    return { feasible: true, reason: null, bottleneckDate: null, shortfallCents: 0 };
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

  const paymentMethod = goal.paymentMethod || goal.payment_method || "standard";
  const creditCardId = goal.creditCardId || goal.credit_card_id || null;
  const allCards = rawData?.creditCards || [];
  const selectedCard =
    paymentMethod === "credit_card" && creditCardId
      ? allCards.find((c) => String(c.id) === String(creditCardId) && !c.archived_at) || null
      : null;

  const paymentStructure = goal.paymentStructure || goal.payment_structure || null;
  const rawInstallments = Math.max(1, Number(goal.installmentCount || 1));
  const installmentCount = paymentStructure === "upfront" ? 1 : rawInstallments;
  const maxMonthsNeeded = policy.horizonMonths + installmentCount + (selectedCard ? 2 : 1);
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

  const sourceGoalId = goal.sourceGoalId || goal.source_goal_id || null;
  const allowLinkedCaixinha = goal.downPaymentSource !== "checking" && Boolean(sourceGoalId);
  const linkedGoal = allowLinkedCaixinha
    ? (rawData?.goals || []).find((g) => String(g.id) === String(sourceGoalId) && g.status !== "cancelled")
    : null;
  const linkedWalletEntry = linkedGoal?.wallet_id
    ? (reconciled.walletBreakdown || []).find((w) => String(w.id) === String(linkedGoal.wallet_id))
    : null;
  const linkedCaixinhaBalanceCents = Math.max(0, linkedWalletEntry?.balanceCents ?? 0);

  const useCapital = Boolean(goal.useCapitalInDownPayment) && !linkedGoal;
  const allProtectedCaixinhasCents =
    (reconciled.walletReserveCents ?? 0) + (reconciled.walletInvestmentCents ?? 0);
  const protectedFloorCents =
    policy.minimumCashFloorCents + (useCapital ? 0 : allProtectedCaixinhasCents);

  const rawItems = Array.isArray(goal.items) ? goal.items.filter((it) => cents(it?.amountCents) > 0) : [];
  const itemsTotalCents = rawItems.reduce((s, it) => s + cents(it.amountCents), 0);
  const targetCents = itemsTotalCents > 0 ? itemsTotalCents : Math.max(0, cents(goal.targetCents));
  const rawDownInput = Math.min(targetCents, Math.max(0, cents(goal.downPaymentCents)));
  const downCents =
    paymentStructure === "installments"
      ? 0
      : paymentStructure === "upfront" && !selectedCard
        ? targetCents
        : rawDownInput;
  const isCreditCard = Boolean(selectedCard);
  const effectiveDownTarget =
    downCents > 0 ? downCents : !isCreditCard && installmentCount === 1 ? targetCents : 0;
  const coveredByCaixinhaCents = linkedGoal
    ? Math.min(downCents > 0 ? downCents : targetCents, linkedCaixinhaBalanceCents)
    : 0;
  const remainingDownPaymentCents = Math.max(0, effectiveDownTarget - coveredByCaixinhaCents);
  const financedCents =
    isCreditCard && downCents === 0
      ? Math.max(0, targetCents - coveredByCaixinhaCents)
      : Math.max(0, targetCents - downCents);
  const explicitInstCents = paymentStructure === "upfront" ? 0 : cents(goal.installmentCents);
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

  const explicitSplits = collectPlanSplits(goal);
  const caixinhaBalancesByGoalId = new Map();
  for (const gRow of rawData?.goals || []) {
    if (gRow?.category === "capital_goal" && gRow.wallet_id) {
      const wb = (reconciled.walletBreakdown || []).find((w) => String(w.id) === String(gRow.wallet_id));
      caixinhaBalancesByGoalId.set(String(gRow.id), Math.max(0, wb?.balanceCents ?? 0));
    }
  }

  // Per-card requirements support single-card, multi-card splits, and multi-item trips
  const itemCardRequirements = new Map();
  if (explicitSplits) {
    for (const sp of explicitSplits) {
      if (sp.paymentMethod === "credit_card" && sp.creditCardId) {
        itemCardRequirements.set(
          String(sp.creditCardId),
          (itemCardRequirements.get(String(sp.creditCardId)) || 0) + Math.max(0, cents(sp.amountCents))
        );
      }
    }
  } else if (rawItems.length > 0 && downCents === 0 && !selectedCard) {
    for (const it of rawItems) {
      if (it.paymentMethod === "credit_card" && it.creditCardId) {
        itemCardRequirements.set(
          String(it.creditCardId),
          (itemCardRequirements.get(String(it.creditCardId)) || 0) + cents(it.amountCents)
        );
      }
    }
  }
  const primaryCardFromItems =
    !selectedCard && itemCardRequirements.size > 0
      ? allCards.find((c) => itemCardRequirements.has(String(c.id)) && !c.archived_at) || null
      : null;
  const effectiveCardForVerdict = selectedCard || primaryCardFromItems;
  const cardRequiredLimitCents = selectedCard && !explicitSplits
    ? Math.max(0, financedCents)
    : effectiveCardForVerdict
      ? itemCardRequirements.get(String(effectiveCardForVerdict.id)) || 0
      : 0;
  const splitsTotalCostCents = explicitSplits
    ? explicitSplits.reduce((sum, sp) => {
        const amt = Math.max(0, cents(sp?.amountCents));
        const cnt = Math.max(1, Number(sp?.installmentCount || 1));
        const bps = Math.min(10000, Math.max(0, Number(sp?.interestBps || 0)));
        if (sp.paymentMethod === "caixinha" || cnt === 1) return sum + amt;
        const pInst = computePriceInstallmentCents({ financedCents: amt, installmentCount: cnt, monthlyInterestBps: bps });
        return sum + pInst * cnt;
      }, 0)
    : 0;
  const splitsPrincipalCents = explicitSplits
    ? explicitSplits.reduce((sum, sp) => sum + Math.max(0, cents(sp?.amountCents)), 0)
    : 0;
  const totalInterestCents = explicitSplits
    ? Math.max(0, splitsTotalCostCents - splitsPrincipalCents)
    : rawItems.length > 0 && downCents === 0 && !selectedCard
      ? 0
      : Math.max(0, perInstallmentCents * installmentCount - financedCents);
  const totalCostCents = explicitSplits
    ? splitsTotalCostCents
    : rawItems.length > 0 && downCents === 0 && !selectedCard
      ? targetCents
      : downCents + perInstallmentCents * installmentCount;

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
  const unspentControlledBudgetsCents = currentBudgets.reduce((sum, b) => {
    if (b.limitCents === null) return sum;
    const norm = normalizeCategoryName(b.categoryName || "");
    if (norm.includes("reserva") || norm.includes("capital")) return sum;
    return sum + Math.max(0, cents(b.limitCents) - cents(b.usedCents));
  }, 0);
  const sampleMonths = [currentMonth, moveMonth(today, 1), moveMonth(today, 2)];
  const monthlySurpluses = sampleMonths.map((ym) => {
    const inc = (expanded.titles || [])
      .filter((t) => !t.cancelled_at && t.direction === "income" && !t.liability_id && (t.entry_kind || "standard") !== "loan_repayment" && monthOf(t.due_on) === ym)
      .reduce((s, t) => s + cents(t.amount_cents), 0);
    const exp = (expanded.titles || [])
      .filter((t) => !t.cancelled_at && t.direction === "expense" && monthOf(t.due_on) === ym)
      .reduce((s, t) => s + cents(t.amount_cents), 0);
    return inc - exp - unspentControlledBudgetsCents;
  });
  const avgMonthlyFreeSurplusCents = Math.round(
    monthlySurpluses.reduce((s, v) => s + v, 0) / monthlySurpluses.length
  );

  const operatingForDownCents = Math.max(
    0,
    (useCapital ? (reconciled.totalWalletCashCents ?? 0) : (reconciled.operatingCashCents ?? 0)) - policy.minimumCashFloorCents
  );
  const availableForDownCents = coveredByCaixinhaCents + operatingForDownCents;
  const hasDownPaymentNow = effectiveDownTarget === 0 || availableForDownCents >= effectiveDownTarget;
  let downPaymentReadyDate = hasDownPaymentNow ? today : null;
  if (!downPaymentReadyDate) {
    const foundDay = daily.find((d) => d.balance - protectedFloorCents >= remainingDownPaymentCents);
    downPaymentReadyDate = foundDay ? foundDay.date : null;
  }
  const installmentFitsMonthly = perInstallmentCents === 0 || avgMonthlyFreeSurplusCents >= perInstallmentCents;
  const monthlyGapCents = Math.max(0, perInstallmentCents - Math.max(0, avgMonthlyFreeSurplusCents));

  const effectiveNormalizedGoal = {
    ...goal,
    targetCents,
    downPaymentCents: downCents,
    installmentCount,
    installmentCents: explicitInstCents,
  };
  const desiredDate = goal.desiredOn && goal.desiredOn >= today ? goal.desiredOn : today;
  const allTitlesForCards = expanded.titles || rawData?.titles || [];
  const cardLimitCheck = effectiveCardForVerdict
    ? (candidateDay) => {
        if (selectedCard && !explicitSplits) {
          const usage = computeCardUsageAtDate(selectedCard, allTitlesForCards, candidateDay, today);
          return {
            ok: usage.availableLimitCents >= cardRequiredLimitCents,
            shortfallCents: Math.max(0, cardRequiredLimitCents - usage.availableLimitCents),
            usage,
          };
        }
        for (const [cid, reqCents] of itemCardRequirements.entries()) {
          const cardObj = allCards.find((c) => String(c.id) === cid && !c.archived_at);
          if (!cardObj) continue;
          const usage = computeCardUsageAtDate(cardObj, allTitlesForCards, candidateDay, today);
          if (usage.availableLimitCents < reqCents) {
            return { ok: false, shortfallCents: reqCents - usage.availableLimitCents, usage };
          }
        }
        return { ok: true, shortfallCents: 0 };
      }
    : null;

  const buildActiveSchedule = (startDay) =>
    explicitSplits
      ? buildScheduleFromSplits(explicitSplits, startDay, allCards, caixinhaBalancesByGoalId)
      : buildSchedule(effectiveNormalizedGoal, startDay, coveredByCaixinhaCents, selectedCard, allCards);

  const desiredSchedule = buildActiveSchedule(desiredDate);
  const desiredEval = evaluateCandidate(daily, protectedFloorCents, desiredSchedule, simulationEnd, cardLimitCheck, desiredDate);

  // Search for first feasible date up to baseHorizonEnd
  let firstFeasibleDate = desiredEval.feasible ? desiredDate : null;
  if (!firstFeasibleDate) {
    for (let d = today; d <= baseHorizonEnd; d = dayAdd(d, 1)) {
      const sched = buildActiveSchedule(d);
      const ev = evaluateCandidate(daily, protectedFloorCents, sched, simulationEnd, cardLimitCheck, d);
      if (ev.feasible) {
        firstFeasibleDate = d;
        break;
      }
    }
  }

  let creditCardVerdict = null;
  if (effectiveCardForVerdict) {
    const desiredCardUsage = computeCardUsageAtDate(effectiveCardForVerdict, allTitlesForCards, desiredDate, today);
    const desiredCycle = computeInvoiceCycleForPurchase({
      purchaseDate: desiredDate,
      closingDay: effectiveCardForVerdict.closing_day,
      dueDay: effectiveCardForVerdict.due_day,
    });
    const hasLimitOnDesiredDate = desiredCardUsage.availableLimitCents >= cardRequiredLimitCents;
    let limitReadyDate = hasLimitOnDesiredDate ? desiredDate : null;
    if (!limitReadyDate) {
      for (let d = today; d <= simulationEnd; d = dayAdd(d, 1)) {
        const u = computeCardUsageAtDate(effectiveCardForVerdict, allTitlesForCards, d, today);
        if (u.availableLimitCents >= cardRequiredLimitCents) {
          limitReadyDate = d;
          break;
        }
      }
    }
    const cardBudget = currentBudgets.find((b) => normalizeCategoryName(b.categoryName || "").includes("cartao"));
    const cardBudgetLimitCents = cardBudget?.limitCents ?? null;
    const cardBudgetRemainingCents = cardBudget?.remainingCents ?? null;
    const fitsCardBudget =
      cardBudgetLimitCents === null ? true : (cardBudgetRemainingCents ?? 0) >= perInstallmentCents;

    creditCardVerdict = {
      cardId: effectiveCardForVerdict.id,
      cardName: effectiveCardForVerdict.name,
      limitCents: desiredCardUsage.limitCents,
      requiredLimitCents: cardRequiredLimitCents,
      availableOnDesiredDateCents: desiredCardUsage.availableLimitCents,
      hasLimitOnDesiredDate,
      limitShortfallCents: Math.max(0, cardRequiredLimitCents - desiredCardUsage.availableLimitCents),
      limitReadyDate,
      firstInvoiceMonth: desiredCycle.invoiceMonth,
      firstInvoiceDueDate: desiredCycle.dueDate,
      cardBudgetLimitCents,
      cardBudgetRemainingCents,
      fitsCardBudget,
    };
  }

  // Projected Positions (Antes -> Depois) para Conta, Caixinha, Cartão e Orçamento
  const selectedWalletId = goal.selectedWalletId || goal.selected_wallet_id || null;
  const selectedWalletBreakdown = selectedWalletId
    ? (reconciled.walletBreakdown || []).find((w) => String(w.id) === String(selectedWalletId)) || null
    : null;
  const dayBeforeOutflows = daily.find((d) => d.date >= desiredDate) || daily[daily.length - 1];
  const balanceOnDateBeforeCents =
    (dayBeforeOutflows?.balance ?? reconciled.totalWalletCashCents ?? 0) - allProtectedCaixinhasCents;
  const immediateOutflowOnDateCents = desiredSchedule
    .filter((o) => o.date === desiredDate)
    .reduce((s, o) => s + o.amountCents, 0);
  const extraByDesiredDay = new Map();
  for (const o of desiredSchedule) {
    extraByDesiredDay.set(o.date, (extraByDesiredDay.get(o.date) || 0) + o.amountCents);
  }
  let minFutureBalanceBeforeCents = null;
  let minFutureBalanceAfterCents = null;
  let simCum = 0;
  for (const d of daily) {
    if (d.date < today) continue;
    const opBefore = d.balance - allProtectedCaixinhasCents;
    minFutureBalanceBeforeCents =
      minFutureBalanceBeforeCents === null ? opBefore : Math.min(minFutureBalanceBeforeCents, opBefore);
    if (d.date >= desiredDate) simCum += extraByDesiredDay.get(d.date) || 0;
    const opAfter = opBefore - simCum;
    minFutureBalanceAfterCents =
      minFutureBalanceAfterCents === null ? opAfter : Math.min(minFutureBalanceAfterCents, opAfter);
  }
  const walletPosition = {
    walletId: selectedWalletBreakdown?.id || null,
    walletName: selectedWalletBreakdown?.name || "Contas de uso diário",
    selectedWalletLiveBeforeCents: selectedWalletBreakdown?.balanceCents ?? null,
    balanceOnDateBeforeCents,
    immediateOutflowOnDateCents,
    balanceOnDateAfterCents: balanceOnDateBeforeCents - immediateOutflowOnDateCents,
    minFutureBalanceBeforeCents: minFutureBalanceBeforeCents ?? balanceOnDateBeforeCents,
    minFutureBalanceAfterCents: minFutureBalanceAfterCents ?? balanceOnDateBeforeCents - immediateOutflowOnDateCents,
    monthlyInstallmentOutflowCents: perInstallmentCents,
  };

  let caixinhaPosition = null;
  if (linkedGoal || goal.createLinkedCaixinha || goal.downPaymentSource === "create_caixinha") {
    const caixinhaTargetForPlan = downCents > 0 ? downCents : targetCents;
    const pace = computeCapitalPace({
      targetCents: caixinhaTargetForPlan,
      targetDate: desiredDate,
      currentCapitalCents: linkedCaixinhaBalanceCents,
      monthlyContributionCents: Math.max(0, avgMonthlyFreeSurplusCents),
      today,
    });
    const monthsAvailable = Math.max(1, pace.monthsLeft);
    const projectedBalanceAtDateCents =
      linkedCaixinhaBalanceCents + Math.max(0, avgMonthlyFreeSurplusCents) * monthsAvailable;
    caixinhaPosition = {
      caixinhaId: linkedGoal?.id || null,
      caixinhaTitle:
        linkedGoal?.title ||
        (downCents > 0 ? `Entrada: ${goal.title || "Objetivo"}` : `Caixinha: ${goal.title || "Objetivo"}`),
      isNewCaixinha: !linkedGoal,
      targetForPlanCents: caixinhaTargetForPlan,
      currentBalanceCents: linkedCaixinhaBalanceCents,
      usedOnPurchaseDateCents: coveredByCaixinhaCents,
      balanceAfterPurchaseCents: Math.max(0, linkedCaixinhaBalanceCents - coveredByCaixinhaCents),
      stillNeededCents: pace.remainingCents,
      requiredMonthlySavingCents: pace.requiredMonthlyCents,
      projectedBalanceAtDateCents,
      progressPct: pace.progressPct,
      onPace: pace.onPace,
    };
  }

  const cardPositions = [];
  const cardReqEntries =
    itemCardRequirements.size > 0
      ? Array.from(itemCardRequirements.entries())
      : effectiveCardForVerdict
        ? [[String(effectiveCardForVerdict.id), cardRequiredLimitCents]]
        : [];
  for (const [cid, reqCents] of cardReqEntries) {
    const cardObj = allCards.find((c) => String(c.id) === cid && !c.archived_at);
    if (!cardObj) continue;
    const uDesired = computeCardUsageAtDate(cardObj, allTitlesForCards, desiredDate, today);
    const cyc = computeInvoiceCycleForPurchase({
      purchaseDate: desiredDate,
      closingDay: cardObj.closing_day,
      dueDay: cardObj.due_day,
    });
    const hasEnough = uDesired.availableLimitCents >= reqCents;
    let readyDay = hasEnough ? desiredDate : null;
    if (!readyDay) {
      for (let d = today; d <= simulationEnd; d = dayAdd(d, 1)) {
        const u = computeCardUsageAtDate(cardObj, allTitlesForCards, d, today);
        if (u.availableLimitCents >= reqCents) {
          readyDay = d;
          break;
        }
      }
    }
    cardPositions.push({
      cardId: cardObj.id,
      cardName: cardObj.name,
      limitCents: uDesired.limitCents,
      availableLimitBeforeCents: uDesired.availableLimitCents,
      chargeAmountCents: reqCents,
      availableLimitAfterCents: Math.max(0, uDesired.availableLimitCents - reqCents),
      hasEnoughLimit: hasEnough,
      limitReadyDate: readyDay,
      firstInvoiceMonth: cyc.invoiceMonth,
      firstInvoiceDueDate: cyc.dueDate,
      invoiceInstallmentCents: perInstallmentCents,
    });
  }
  const cardPosition = cardPositions[0] || (creditCardVerdict
    ? {
        cardId: creditCardVerdict.cardId,
        cardName: creditCardVerdict.cardName,
        limitCents: creditCardVerdict.limitCents,
        availableLimitBeforeCents: creditCardVerdict.availableOnDesiredDateCents,
        chargeAmountCents: creditCardVerdict.requiredLimitCents,
        availableLimitAfterCents: Math.max(
          0,
          creditCardVerdict.availableOnDesiredDateCents - creditCardVerdict.requiredLimitCents
        ),
        hasEnoughLimit: creditCardVerdict.hasLimitOnDesiredDate,
        limitReadyDate: creditCardVerdict.limitReadyDate,
        firstInvoiceMonth: creditCardVerdict.firstInvoiceMonth,
        firstInvoiceDueDate: creditCardVerdict.firstInvoiceDueDate,
        invoiceInstallmentCents: perInstallmentCents,
      }
    : null);

  const budgetCatId = goal.budgetCategoryId || goal.budget_category_id || null;
  const matchedBudget = budgetCatId
    ? currentBudgets.find((b) => String(b.categoryId) === String(budgetCatId)) || null
    : null;
  const budgetPosition = matchedBudget
    ? {
        categoryId: matchedBudget.categoryId,
        categoryName: matchedBudget.categoryName,
        limitCents: matchedBudget.limitCents,
        usedBeforeCents: matchedBudget.usedCents,
        remainingBeforeCents: matchedBudget.remainingCents,
        planAmountCents: targetCents,
        remainingAfterCents:
          matchedBudget.remainingCents !== null ? matchedBudget.remainingCents - targetCents : null,
        fitsBudget:
          matchedBudget.limitCents === null ? true : (matchedBudget.remainingCents ?? 0) >= targetCents,
      }
    : null;

  const rejectionReasons = [];
  if (!desiredEval.feasible && desiredEval.reason) {
    rejectionReasons.push(desiredEval.reason);
  }
  if (!firstFeasibleDate) {
    rejectionReasons.push("NO_VIABLE_DATE_IN_HORIZON");
  }

  const assumptions = [];
  if (selectedCard) {
    assumptions.push(
      `Parcelamento no cartão ${selectedCard.name}: exige limite livre de ${cardRequiredLimitCents} centavos na data da compra e vence a partir da fatura de ${creditCardVerdict?.firstInvoiceMonth}.`
    );
  }
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
    desiredDate,
    linkedGoal ? Math.min(targetCents, linkedCaixinhaBalanceCents) : 0
  );
  const cashEval = evaluateCandidate(daily, protectedFloorCents, cashSchedule, simulationEnd);

  const halfDown = Math.round(cents(goal.targetCents) / 2);
  const higherDownEval = evaluateCandidate(
    daily,
    protectedFloorCents,
    buildSchedule(
      {
        ...goal,
        downPaymentCents: halfDown,
        installmentCents: Math.ceil((cents(goal.targetCents) - halfDown) / installmentCount),
      },
      desiredDate,
      linkedGoal ? Math.min(halfDown, linkedCaixinhaBalanceCents) : 0,
      selectedCard
    ),
    simulationEnd,
    selectedCard
      ? (candidateDay) => {
          const halfReq = Math.max(0, cents(goal.targetCents) - halfDown);
          const usage = computeCardUsageAtDate(selectedCard, allTitlesForCards, candidateDay, today);
          return {
            ok: usage.availableLimitCents >= halfReq,
            shortfallCents: Math.max(0, halfReq - usage.availableLimitCents),
          };
        }
      : null,
    desiredDate
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
      coveredByCaixinhaCents,
      remainingDownPaymentCents,
      linkedCaixinhaTitle: linkedGoal?.title || null,
      linkedCaixinhaBalanceCents,
      availableForDownCents,
      hasDownPaymentNow,
      downPaymentReadyDate,
      perInstallmentCents,
      monthlyFreeSurplusCents: avgMonthlyFreeSurplusCents,
      installmentFitsMonthly,
      monthlyGapCents,
      paymentMethod: isCreditCard ? "credit_card" : "standard",
      paymentStructure: paymentStructure || (downCents > 0 && installmentCount > 1 ? "hybrid" : installmentCount > 1 ? "installments" : "upfront"),
      creditCardVerdict,
    },
    projectedPositions: {
      walletPosition,
      caixinhaPosition,
      cardPosition,
      cardPositions,
      budgetPosition,
    },
    scenarios,
  };
}

/**
 * Evaluates and ranks 1..N quotes inside a Planning record (e.g. Gol 2020 vs. Cruze)
 * so the user immediately sees which option fits their cashflow, Caixinha, and card limit best.
 */
export function comparePlanningQuotes(rawData, goalRecord = {}, options = {}) {
  const rawList = Array.isArray(goalRecord.quotes)
    ? goalRecord.quotes
    : Array.isArray(goalRecord.quotes_json)
      ? goalRecord.quotes_json
      : [];

  const desiredOn = goalRecord.desiredOn || isoDate(goalRecord.desired_on) || options.today || brDay();
  const baseCategory = goalRecord.budgetCategoryId || goalRecord.budget_category_id || null;
  const normalizedQuotes = rawList.length
    ? rawList
    : [
        {
          id: "default",
          label: goalRecord.title || "Opção principal",
          url: "",
          targetCents: cents(goalRecord.targetCents ?? goalRecord.target_cents),
          downPaymentCents: cents(goalRecord.downPaymentCents ?? goalRecord.down_payment_cents),
          installmentCount: Number(goalRecord.installmentCount ?? goalRecord.installment_count ?? 1),
          installmentCents: cents(goalRecord.installmentCents ?? goalRecord.installment_cents),
          interestBps: Number(goalRecord.interestBps ?? goalRecord.interest_bps ?? 0),
          paymentStructure: goalRecord.paymentStructure || goalRecord.payment_structure || undefined,
          paymentMethod: goalRecord.paymentMethod || goalRecord.payment_method || "standard",
          creditCardId: goalRecord.creditCardId || goalRecord.credit_card_id || null,
          selectedWalletId: goalRecord.selectedWalletId || goalRecord.selected_wallet_id || null,
          sourceGoalId: goalRecord.sourceGoalId || goalRecord.source_goal_id || null,
          createLinkedCaixinha: Boolean(goalRecord.createLinkedCaixinha),
          items: Array.isArray(goalRecord.items) ? goalRecord.items : [],
          isChosen: true,
        },
      ];

  const evaluated = normalizedQuotes.map((q, idx) => {
    const sim = simulateGoalPurchase(
      rawData,
      {
        title: q.label || goalRecord.title || `Cotação ${idx + 1}`,
        targetCents: q.targetCents,
        downPaymentCents: q.downPaymentCents || 0,
        installmentCount: q.installmentCount || 1,
        installmentCents: q.installmentCents || 0,
        interestBps: q.interestBps || 0,
        paymentStructure: q.paymentStructure,
        paymentMethod: q.paymentMethod || "standard",
        creditCardId: q.creditCardId || null,
        selectedWalletId: q.selectedWalletId || null,
        downPaymentSource: q.downPaymentSource || null,
        sourceGoalId: q.sourceGoalId ?? goalRecord.sourceGoalId ?? goalRecord.source_goal_id ?? null,
        createLinkedCaixinha: Boolean(q.createLinkedCaixinha || q.downPaymentSource === "create_caixinha"),
        budgetCategoryId: q.budgetCategoryId || baseCategory,
        desiredOn,
        items: q.items || [],
        paymentSplits: Array.isArray(q.paymentSplits) ? q.paymentSplits : [],
      },
      options
    );
    return {
      ...q,
      index: idx,
      sim,
      isWinner: false,
    };
  });

  const ranked = [...evaluated].sort((a, b) => {
    if (a.sim.isFeasible !== b.sim.isFeasible) return a.sim.isFeasible ? -1 : 1;
    const ad = a.sim.firstFeasibleDate || "9999-12-31";
    const bd = b.sim.firstFeasibleDate || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    if (a.sim.totalCostCents !== b.sim.totalCostCents) return a.sim.totalCostCents - b.sim.totalCostCents;
    const aMin = a.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? -Infinity;
    const bMin = b.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? -Infinity;
    return bMin - aMin;
  });

  const winnerId = ranked[0]?.id ?? null;
  const maxCost = Math.max(...ranked.map((r) => r.sim.totalCostCents || 0), 0);
  const totalSavedVsWorstCents = ranked.length > 1 ? Math.max(0, maxCost - (ranked[0]?.sim.totalCostCents || 0)) : 0;
  const withWinnerFlag = ranked.map((r, rankIdx) => ({
    ...r,
    rank: rankIdx + 1,
    isWinner: r.id === winnerId,
  }));
  const winner = withWinnerFlag[0] || null;
  const second = withWinnerFlag[1] || null;
  let winnerReasonText = "";
  if (winner && second) {
    if (winner.sim.isFeasible && !second.sim.isFeasible) {
      winnerReasonText = `${winner.label} já cabe no seu orçamento e caixa na data desejada.`;
    } else if (totalSavedVsWorstCents > 0) {
      winnerReasonText = `${winner.label} custa menos no total e preserva mais fôlego no seu caixa.`;
    } else {
      winnerReasonText = `${winner.label} deixa o melhor saldo futuro após os compromissos.`;
    }
  } else if (winner) {
    winnerReasonText = winner.sim.isFeasible
      ? "Cabe no orçamento na data planejada."
      : winner.sim.firstFeasibleDate
        ? `Fica viável a partir de ${winner.sim.firstFeasibleDate}.`
        : "Precisa de mais margem ou prazo antes de fechar.";
  }

  return {
    quotes: withWinnerFlag,
    winner,
    hasComparison: withWinnerFlag.length > 1,
    totalSavedVsWorstCents,
    winnerReasonText,
  };
}

/**
 * Extracts individual launchable title payloads from a saved Planning record.
 * When the plan contains itemized entries (e.g. a Trip with Passagens 12x card + Hospedagem 1x card),
 * each priced item produces its own independent title payload instead of summing everything into one title.
 */
export function buildExecutionTitlesFromGoal(
  goalRecord = {},
  { defaultWalletId = "", defaultCategory = "Outros", today = brDay() } = {}
) {
  const quotes = Array.isArray(goalRecord.quotes)
    ? goalRecord.quotes
    : Array.isArray(goalRecord.quotes_json)
      ? goalRecord.quotes_json
      : [];
  const chosenQuote = quotes.find((q) => q?.isChosen) || quotes[0] || null;
  const rawItems = Array.isArray(chosenQuote?.items) ? chosenQuote.items : [];
  const pricedItems = rawItems.filter((it) => cents(it?.amountCents) > 0);
  const baseDate = isoDate(goalRecord.desired_on || goalRecord.desiredOn) || today;
  const effectiveDueOn = baseDate >= today ? baseDate : today;
  const fallbackWallet = goalRecord.selected_wallet_id || chosenQuote?.selectedWalletId || defaultWalletId;

  if (pricedItems.length > 0) {
    const out = [];
    for (let idx = 0; idx < pricedItems.length; idx++) {
      const it = pricedItems[idx];
      const baseTitle = String(it.title || `Item ${idx + 1}`).slice(0, 110);
      const splits = Array.isArray(it.paymentSplits)
        ? it.paymentSplits.filter((sp) => cents(sp?.amountCents) > 0 && sp?.paymentMethod !== "caixinha")
        : [];
      if (splits.length > 0) {
        splits.forEach((sp, sIdx) => {
          const inst = Math.max(1, Math.min(60, Number(sp.installmentCount || 1)));
          const useCard = sp.paymentMethod === "credit_card" && Boolean(sp.creditCardId);
          out.push({
            itemId: `${it.id || `item-${idx + 1}`}-sp-${sIdx + 1}`,
            description: (splits.length > 1 ? `${baseTitle} (${sIdx + 1}/${splits.length})` : baseTitle).slice(0, 120),
            amountCents: cents(sp.amountCents),
            paymentMethod: useCard ? "credit_card" : "standard",
            creditCardId: useCard ? String(sp.creditCardId) : null,
            walletId: sp.walletId || it.walletId || fallbackWallet,
            installmentCount: inst,
            mode: inst > 1 ? "installments" : "single",
            valueMode: "total",
            category: defaultCategory,
            occurredOn: today,
            dueOn: effectiveDueOn,
          });
        });
        continue;
      }
      const inst = Math.max(1, Math.min(60, Number(it.installmentCount || 1)));
      const useCard = it.paymentMethod === "credit_card" && Boolean(it.creditCardId);
      out.push({
        itemId: String(it.id || `item-${idx + 1}`),
        description: baseTitle.slice(0, 120),
        amountCents: cents(it.amountCents),
        paymentMethod: useCard ? "credit_card" : "standard",
        creditCardId: useCard ? String(it.creditCardId) : null,
        walletId: it.walletId || fallbackWallet,
        installmentCount: inst,
        mode: inst > 1 ? "installments" : "single",
        valueMode: "total",
        category: defaultCategory,
        occurredOn: today,
        dueOn: effectiveDueOn,
      });
    }
    return out;
  }

  const topSplits = Array.isArray(chosenQuote?.paymentSplits)
    ? chosenQuote.paymentSplits.filter((sp) => cents(sp?.amountCents) > 0 && sp?.paymentMethod !== "caixinha")
    : [];
  if (topSplits.length > 0) {
    const baseTitle = String(goalRecord.title || "Planejamento").slice(0, 110);
    return topSplits.map((sp, sIdx) => {
      const inst = Math.max(1, Math.min(60, Number(sp.installmentCount || 1)));
      const useCard = sp.paymentMethod === "credit_card" && Boolean(sp.creditCardId);
      return {
        itemId: `${goalRecord.id || "plan"}-sp-${sIdx + 1}`,
        description: (topSplits.length > 1 ? `${baseTitle} (${sIdx + 1}/${topSplits.length})` : baseTitle).slice(0, 120),
        amountCents: cents(sp.amountCents),
        paymentMethod: useCard ? "credit_card" : "standard",
        creditCardId: useCard ? String(sp.creditCardId) : null,
        walletId: sp.walletId || fallbackWallet,
        installmentCount: inst,
        mode: inst > 1 ? "installments" : "single",
        valueMode: "total",
        category: defaultCategory,
        occurredOn: today,
        dueOn: effectiveDueOn,
      };
    });
  }

  const inst = Math.max(1, Math.min(60, Number(chosenQuote?.installmentCount || goalRecord.installment_count || 1)));
  const useCard =
    (chosenQuote?.paymentMethod || goalRecord.payment_method) === "credit_card" &&
    Boolean(chosenQuote?.creditCardId || goalRecord.credit_card_id);
  const ccId = useCard ? String(chosenQuote?.creditCardId || goalRecord.credit_card_id) : null;
  return [
    {
      itemId: String(goalRecord.id || "plan-single"),
      description: String(goalRecord.title || "Planejamento").slice(0, 120),
      amountCents: Math.max(0, cents(chosenQuote?.targetCents || goalRecord.target_cents)),
      paymentMethod: useCard ? "credit_card" : "standard",
      creditCardId: ccId,
      walletId: fallbackWallet,
      installmentCount: inst,
      mode: inst > 1 ? "installments" : "single",
      valueMode: "total",
      category: defaultCategory,
      occurredOn: today,
      dueOn: effectiveDueOn,
    },
  ];
}

/**
 * Compares 2+ saved Planning records side by side after creation.
 */
export function compareSavedPlans(rawData, goalRecords = [], options = {}) {
  const today = options.today || brDay();
  const list = (goalRecords || []).filter(Boolean);
  const evaluated = list.map((g) => {
    const quotes = Array.isArray(g.quotes_json) ? g.quotes_json : Array.isArray(g.quotes) ? g.quotes : [];
    const primary = quotes.find((q) => q?.isChosen) || quotes[0] || {};
    const desiredOn = isoDate(g.desired_on) || today;
    const sim = simulateGoalPurchase(
      rawData,
      {
        title: g.title,
        targetCents: cents(g.target_cents),
        downPaymentCents: cents(g.down_payment_cents),
        installmentCount: Number(g.installment_count || 1),
        installmentCents: cents(g.installment_cents),
        interestBps: Number(g.interest_bps || 0),
        desiredOn,
        paymentMethod: g.payment_method || primary.paymentMethod || "standard",
        creditCardId: g.credit_card_id || primary.creditCardId || null,
        selectedWalletId: g.selected_wallet_id || primary.selectedWalletId || null,
        budgetCategoryId: g.budget_category_id || null,
        downPaymentSource: g.source_goal_id ? "caixinha" : "checking",
        sourceGoalId: g.source_goal_id || null,
      },
      { today }
    );
    return {
      id: String(g.id),
      title: g.title,
      planType: g.plan_type || "purchase",
      desiredOn,
      targetCents: cents(g.target_cents),
      installmentCount: Number(g.installment_count || 1),
      interestBps: Number(g.interest_bps || 0),
      paymentMethod: g.payment_method || "standard",
      raw: g,
      sim,
    };
  });

  const ranked = [...evaluated].sort((a, b) => {
    if (a.sim.isFeasible !== b.sim.isFeasible) return a.sim.isFeasible ? -1 : 1;
    const aFirst = a.sim.firstFeasibleDate || "9999-12-31";
    const bFirst = b.sim.firstFeasibleDate || "9999-12-31";
    if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
    const aCost = a.sim.totalCostCents || a.targetCents;
    const bCost = b.sim.totalCostCents || b.targetCents;
    if (aCost !== bCost) return aCost - bCost;
    const aMin = a.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0;
    const bMin = b.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0;
    return bMin - aMin;
  });

  const winnerId = ranked[0]?.id ?? null;
  const maxCost = Math.max(...ranked.map((r) => r.sim.totalCostCents || r.targetCents), 0);
  const minCost = ranked[0] ? ranked[0].sim.totalCostCents || ranked[0].targetCents : 0;
  const totalSavedVsWorstCents = ranked.length > 1 ? Math.max(0, maxCost - minCost) : 0;
  const plans = ranked.map((r, i) => ({
    ...r,
    rank: i + 1,
    isWinner: r.id === winnerId,
  }));

  const winner = plans[0] || null;
  const second = plans[1] || null;
  let winnerReasonText = "";
  if (winner && second) {
    if (winner.sim.isFeasible && !second.sim.isFeasible) {
      winnerReasonText = `${winner.title} já cabe no seu orçamento e caixa na data desejada.`;
    } else if (totalSavedVsWorstCents > 0) {
      winnerReasonText = `${winner.title} gera o menor custo total e preserva mais fôlego no caixa.`;
    } else {
      winnerReasonText = `${winner.title} mantém o melhor saldo futuro após o compromisso.`;
    }
  }

  return {
    plans,
    winner,
    hasComparison: plans.length > 1,
    totalSavedVsWorstCents,
    winnerReasonText,
  };
}
