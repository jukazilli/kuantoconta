import { cents, isoDate, money, monthOf } from "./finance.js";

/**
 * Generates deterministic, actionable notifications from real user financial data.
 */
export function buildNotifications({
  summary = null,
  healthPlan = null,
  titles = [],
  budgetSummary = [],
  today,
}) {
  const alerts = [];
  const currentMonth = String(today || "").slice(0, 7);

  // 1. Planned purchases in the current month
  const goals = healthPlan?.goals?.items || [];
  for (const g of goals) {
    const desiredYm = g.desiredOn ? String(g.desiredOn).slice(0, 7) : "";
    const feasibleYm = g.firstFeasibleDate ? String(g.firstFeasibleDate).slice(0, 7) : "";
    if (desiredYm === currentMonth || feasibleYm === currentMonth) {
      alerts.push({
        id: `goal-${g.title}`,
        tone: "info",
        title: `Compra planejada neste mês: ${g.title}`,
        detail: `Valor ${money(g.targetCents)}. Confira o impacto na aba Planejamento.`,
        targetTab: "planning",
      });
    }
  }

  // 2. Overdue or due soon bills (next 3 days)
  const soonLimit = (() => {
    const dt = new Date(`${today}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 3);
    return dt.toISOString().slice(0, 10);
  })();
  const openExpenses = titles.filter(
    (t) =>
      !t.cancelled_at &&
      t.direction === "expense" &&
      (t.entry_kind || "standard") !== "reserve_transfer" &&
      cents(t.amount_cents) > cents(t.settled_cents)
  );
  const overdue = openExpenses.filter((t) => isoDate(t.due_on) < today);
  const dueSoon = openExpenses.filter((t) => isoDate(t.due_on) >= today && isoDate(t.due_on) <= soonLimit);

  if (overdue.length > 0) {
    alerts.push({
      id: "bills-overdue",
      tone: "danger",
      title: `${overdue.length} conta(s) vencida(s) em aberto`,
      detail: `Ex.: ${overdue[0].description} (${money(cents(overdue[0].amount_cents) - cents(overdue[0].settled_cents))}).`,
      targetTab: "movements",
    });
  }
  if (dueSoon.length > 0) {
    alerts.push({
      id: "bills-soon",
      tone: "warn",
      title: `${dueSoon.length} conta(s) vencendo nos próximos dias`,
      detail: `Próxima: ${dueSoon[0].description} em ${isoDate(dueSoon[0].due_on).split("-").reverse().join("/")}.`,
      targetTab: "movements",
    });
  }

  // 3. Budget overruns or >= 80% utilization
  for (const b of budgetSummary) {
    if (b.limitCents === null || b.limitCents <= 0) continue;
    const rem = b.remainingLimitCents ?? b.remainingCents ?? 0;
    if (rem < 0) {
      alerts.push({
        id: `budget-over-${b.categoryId}`,
        tone: "danger",
        title: `Orçamento "${b.categoryName}" estourado`,
        detail: `Excedido em ${money(Math.abs(rem))} neste mês.`,
        targetTab: "planning",
      });
    } else if (b.utilizationPct >= 80) {
      alerts.push({
        id: `budget-warn-${b.categoryId}`,
        tone: "warn",
        title: `Orçamento "${b.categoryName}" em ${b.utilizationPct}%`,
        detail: `Restam ${money(rem)} para o restante do mês.`,
        targetTab: "planning",
      });
    }
  }

  // 4. Capital contribution reminder when income arrived in current month
  const receivedThisMonth = titles.some(
    (t) =>
      !t.cancelled_at &&
      t.direction === "income" &&
      (t.entry_kind || "standard") === "standard" &&
      monthOf(t.due_on) === currentMonth &&
      cents(t.settled_cents) > 0
  );
  const capitalTransferredThisMonth = titles.some(
    (t) =>
      !t.cancelled_at &&
      t.direction === "income" &&
      t.entry_kind === "reserve_transfer" &&
      monthOf(t.due_on) === currentMonth
  );
  const capitalBudget = budgetSummary.find((b) => /capital|reserva/i.test(b.categoryName) && b.limitCents > 0);
  if (receivedThisMonth && capitalBudget && !capitalTransferredThisMonth) {
    alerts.push({
      id: "capital-pending",
      tone: "info",
      title: "Efetivar aporte para Carteira de Capital",
      detail: `Você recebeu neste mês; separe ${money(capitalBudget.limitCents)} para formar patrimônio.`,
      action: "transfer_capital",
    });
  }

  // 5. Future negative cash risk
  if (summary?.firstNegative) {
    alerts.push({
      id: "negative-cash",
      tone: "danger",
      title: "Risco de saldo negativo projetado",
      detail: `Caixa previsto fica negativo em ${isoDate(summary.firstNegative).split("-").reverse().join("/")}.`,
      targetTab: "patrimony",
    });
  }

  return alerts;
}
