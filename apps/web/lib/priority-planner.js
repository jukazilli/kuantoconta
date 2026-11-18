import { cents } from "./finance.js";

/**
 * Computes today's allocable cash (never counting unreceived future income)
 * and builds priority-ordered proposals without fixed universal percentages (ADR-009 Section 7).
 */
export function planAllocationPriorities(diagnosisResult) {
  const { diagnosis, _internal } = diagnosisResult;
  const { indicators } = diagnosis;
  const { reconciled, policy } = _internal;

  if (!indicators.knownCash) {
    return {
      eligibleTodayCents: null,
      projectedMonthlyCents: null,
      proposals: [],
      blockedReason: "OPENING_BALANCE_REQUIRED",
    };
  }

  const operatingCash = Math.max(0, indicators.operatingCashCents ?? 0);
  const reserveWalletCash = Math.max(0, reconciled.walletReserveCents ?? 0);
  const minWindowContractual = indicators.minWindowCashCents ?? 0;
  const minWindowPrudent =
    indicators.minWindowCashWithPlansCents !== null &&
    indicators.minWindowCashWithPlansCents !== undefined
      ? Math.min(minWindowContractual, indicators.minWindowCashWithPlansCents)
      : minWindowContractual;

  // Amount above floor + protected reserve wallets across the entire protection window,
  // prudently respecting dated/undated spending plans (LC-14, LC-25) and capped by confirmed operating cash today (FH-02 & FH-03).
  const safeWindowSurplus = Math.max(
    0,
    minWindowPrudent - policy.minimumCashFloorCents - reserveWalletCash
  );
  const eligibleTodayCents = Math.max(0, Math.min(operatingCash, safeWindowSurplus));

  const projectedMonthlyCents =
    indicators.planMarginCents !== null ? Math.max(0, indicators.planMarginCents) : null;

  const proposals = [];

  // Layer 1 & 2: Essential overdue or due-date cash gap => 100% priority to essentials (FH-04)
  if (indicators.overdueEssentialCount > 0 || !indicators.coverageByDueDate.covered) {
    const neededCents = Math.max(
      indicators.overdueEssentialCents || 0,
      Math.max(0, policy.minimumCashFloorCents - (indicators.minProjectedCashCents ?? 0))
    );
    proposals.push({
      priority: 1,
      kind: "regularize_essentials",
      title: "Regularizar obrigações essenciais e cobertura por vencimento",
      recommendedCents: eligibleTodayCents,
      targetNeedCents: neededCents,
      rationale:
        "Há obrigação essencial em atraso ou falta prevista antes dos próximos vencimentos; nenhuma alocação para investimento deve ocorrer antes da regularização.",
      autoExecute: false,
    });

    return {
      eligibleTodayCents,
      projectedMonthlyCents,
      proposals,
      blockedReason: "ESSENTIAL_OBLIGATIONS_AT_RISK",
    };
  }

  if (eligibleTodayCents === 0) {
    proposals.push({
      priority: 1,
      kind: "preserve_cash",
      title: "Preservar caixa atual para os próximos vencimentos",
      recommendedCents: 0,
      rationale:
        "O saldo confirmado hoje é necessário para cobrir compromissos na janela de proteção sem depender de receitas ainda não recebidas.",
      autoExecute: false,
    });
    return {
      eligibleTodayCents: 0,
      projectedMonthlyCents,
      proposals,
      blockedReason: null,
    };
  }

  // Layer 3: Expensive debt vs initial emergency cushion (no fixed 70/30 or 80/20 rule — FH-05)
  const expensiveDebts = reconciled.activeLiabilities
    .filter(
      (l) =>
        l.interest_rate_bps !== null &&
        l.interest_rate_bps !== undefined &&
        Number(l.interest_rate_bps) >= policy.expensiveDebtMonthlyBps
    )
    .sort((a, b) => Number(b.interest_rate_bps) - Number(a.interest_rate_bps));

  const initialReserveTargetCents =
    indicators.monthlyEssentialCostCents > 0
      ? Math.round(indicators.monthlyEssentialCostCents * policy.initialReserveMonths)
      : 0;
  const currentReserveCents = indicators.liquidReserveCents ?? 0;
  const initialReserveGapCents = Math.max(0, initialReserveTargetCents - currentReserveCents);

  if (expensiveDebts.length > 0 && initialReserveGapCents > 0) {
    const topDebt = expensiveDebts[0];
    const debtAmortizationCap = Math.min(eligibleTodayCents, cents(topDebt.principal_cents));
    const cushionCap = Math.min(eligibleTodayCents, initialReserveGapCents);

    proposals.push({
      priority: 3,
      kind: "compare_debt_vs_cushion",
      title: `Comparar amortização de "${topDebt.label}" vs. colchão inicial`,
      recommendedCents: eligibleTodayCents,
      options: [
        {
          id: "amortize_expensive_debt",
          label: "Priorizar amortização da dívida mais cara",
          amountCents: debtAmortizationCap,
          rationale: `Reduz saldo devedor com taxa de ${(Number(topDebt.interest_rate_bps) / 100).toFixed(2)}% a.m., diminuindo custo futuro de juros.`,
        },
        {
          id: "build_initial_cushion",
          label: "Proteger liquidez inicial antes de amortizar",
          amountCents: cushionCap,
          rationale: "Cria colchão imediato para evitar novo atraso ou uso de crédito emergencial caso ocorra imprevisto.",
        },
      ],
      rationale:
        "Há dívida de custo elevado e reserva inicial ainda incompleta. Avalie o trade-off entre redução de juros e liquidez sem regra fixa automática.",
      autoExecute: false,
    });
    return {
      eligibleTodayCents,
      projectedMonthlyCents,
      proposals,
      blockedReason: null,
    };
  }

  if (expensiveDebts.length > 0) {
    const topDebt = expensiveDebts[0];
    proposals.push({
      priority: 3,
      kind: "amortize_debt",
      title: `Amortizar dívida "${topDebt.label}"`,
      recommendedCents: Math.min(eligibleTodayCents, cents(topDebt.principal_cents)),
      rationale: "Colchão inicial atendido; reduzir principal da dívida de maior custo diminui encargos futuros.",
      autoExecute: false,
    });
    return {
      eligibleTodayCents,
      projectedMonthlyCents,
      proposals,
      blockedReason: null,
    };
  }

  // Layer 4: Full reserve & capital formation
  const fullReserveTargetCents =
    indicators.monthlyEssentialCostCents > 0
      ? Math.round(indicators.monthlyEssentialCostCents * policy.fullReserveMonths)
      : 0;
  const fullReserveGapCents = Math.max(0, fullReserveTargetCents - currentReserveCents);

  if (fullReserveGapCents > 0) {
    const toReserve = Math.min(eligibleTodayCents, fullReserveGapCents);
    proposals.push({
      priority: 4,
      kind: "build_reserve",
      title: "Reforçar reserva de proteção",
      recommendedCents: toReserve,
      rationale: "Obrigações cobertas e sem dívida cara; direcionar capacidade livre para completar a reserva líquida.",
      autoExecute: false,
    });
    const remainder = eligibleTodayCents - toReserve;
    if (remainder > 0) {
      proposals.push({
        priority: 5,
        kind: "capital_or_goals",
        title: "Formação de capital / objetivos aprovados",
        recommendedCents: remainder,
        rationale: "Excedente após completar a meta de reserva pode ser direcionado a capital ou objetivos planejados.",
        autoExecute: false,
      });
    }
  } else {
    proposals.push({
      priority: 5,
      kind: "capital_or_goals",
      title: "Formação de capital e objetivos futuros",
      recommendedCents: eligibleTodayCents,
      rationale: "Obrigações cobertas e reserva adequada; capacidade disponível elegível para capital ou objetivos.",
      autoExecute: false,
    });
  }

  return {
    eligibleTodayCents,
    projectedMonthlyCents,
    proposals,
    blockedReason: null,
  };
}
