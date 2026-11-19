import { cents, isoDate } from "./finance.js";

const SMALL_LEAK_MAX_CENTS = 5000; // R$ 50,00

/**
 * Behavioral consumption analyzer ("Dedo Duro & Tesouraço"):
 * Surfaces small frequent leaks ("efeito cafezinho"), top spending categories,
 * weekend concentration, recurring subscriptions, and concrete cut opportunities.
 */
export function analyzeConsumptionHabits({ rows = [], recurringRules = [], budgetSummary = [] }) {
  const expenses = rows.filter(
    (t) =>
      !t.cancelled_at &&
      t.direction === "expense" &&
      (t.entry_kind || "standard") === "standard"
  );

  const totalExpenseCents = expenses.reduce((sum, t) => sum + Math.max(0, cents(t.amount_cents)), 0);

  // 1. Efeito Formiguinha (gastos <= R$ 50 que se repetem >= 3x)
  const smallItems = expenses.filter((t) => cents(t.amount_cents) > 0 && cents(t.amount_cents) <= SMALL_LEAK_MAX_CENTS);
  const smallMonthlyCents = smallItems.reduce((sum, t) => sum + cents(t.amount_cents), 0);
  const smallLeaks = {
    detected: smallItems.length >= 3,
    count: smallItems.length,
    monthlyTotalCents: smallMonthlyCents,
    annualizedCents: smallMonthlyCents * 12,
    examples: smallItems.slice(0, 3).map((t) => ({
      description: t.description,
      amountCents: cents(t.amount_cents),
      date: isoDate(t.due_on),
    })),
  };

  // 2. Top Vazamentos por Categoria
  const byCategory = new Map();
  for (const t of expenses) {
    const cat = t.category || "Outros";
    byCategory.set(cat, (byCategory.get(cat) || 0) + Math.max(0, cents(t.amount_cents)));
  }
  const topLeaks = Array.from(byCategory.entries())
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      sharePct: totalExpenseCents > 0 ? Math.round((amountCents / totalExpenseCents) * 100) : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 3);

  // 3. Concentração em fins de semana (sábado/domingo)
  let weekendCents = 0;
  let weekendCount = 0;
  for (const t of expenses) {
    const d = isoDate(t.due_on);
    if (!d) continue;
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) {
      weekendCents += Math.max(0, cents(t.amount_cents));
      weekendCount++;
    }
  }
  const weekendSharePct = totalExpenseCents > 0 ? Math.round((weekendCents / totalExpenseCents) * 100) : 0;

  // 4. Assinaturas / Recorrências revisáveis ("Tesouraço")
  const recurringItems = (recurringRules || [])
    .filter((r) => !r.paused_at && r.direction === "expense" && (r.entry_kind || "standard") === "standard")
    .map((r) => ({
      id: r.id,
      description: r.description,
      category: r.category || "Outros",
      monthlyCents: Math.max(0, cents(r.amount_cents)),
      annualCents: Math.max(0, cents(r.amount_cents)) * 12,
    }))
    .sort((a, b) => b.monthlyCents - a.monthlyCents);

  // Orçamentos estourados
  const overBudgets = (budgetSummary || [])
    .filter((b) => b.limitCents !== null && (b.remainingLimitCents ?? 0) < 0)
    .map((b) => ({
      categoryName: b.categoryName,
      overrunCents: Math.abs(b.remainingLimitCents),
    }));

  // Potencial de economia sugerido (25% do maior vazamento variável >= R$ 50 + 50% dos gastos formiguinha)
  const topVariable = topLeaks.find((c) => !/moradia|aluguel|empr[eé]stimo/i.test(c.category)) || topLeaks[0];
  const variableTrimCents = topVariable && topVariable.amountCents >= 5000 ? Math.round(topVariable.amountCents * 0.25) : 0;
  const smallTrimCents = smallLeaks.detected ? Math.round(smallMonthlyCents * 0.5) : 0;
  const potentialMonthlySavingsCents = variableTrimCents + smallTrimCents;
  const afterTrimMonthlyCents = Math.max(0, totalExpenseCents - potentialMonthlySavingsCents);

  return {
    totalExpenseCents,
    expenseCount: expenses.length,
    smallLeaks,
    topLeaks,
    weekend: {
      count: weekendCount,
      amountCents: weekendCents,
      sharePct: weekendSharePct,
    },
    recurringItems,
    overBudgets,
    tesouraco: {
      topTargetCategory: topVariable?.category || null,
      variableTrimCents,
      smallTrimCents,
      potentialMonthlySavingsCents,
      potentialAnnualSavingsCents: potentialMonthlySavingsCents * 12,
      afterTrimMonthlyCents,
    },
  };
}
