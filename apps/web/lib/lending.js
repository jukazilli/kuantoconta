import { cents, isoDate } from "./finance.js";

/**
 * Keeps unpaid loan_repayment receivables visible in the current month's collection
 * cadence when the previous month closes without full repayment.
 * Preserves `original_due_on` for overdue visibility while rolling effective `due_on`
 * to the 1st day of the current month if unpaid and from a prior month.
 */
export function rolloverOverdueLoanRepayments(titles = [], today) {
  if (!today || !Array.isArray(titles)) return titles || [];
  const currentMonth = String(today).slice(0, 7);
  const currentMonthStart = `${currentMonth}-01`;
  return titles.map((t) => {
    if ((t.entry_kind || "standard") !== "loan_repayment") return t;
    const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
    const due = isoDate(t.due_on);
    if (rem > 0 && due && due.slice(0, 7) < currentMonth) {
      return {
        ...t,
        original_due_on: due,
        due_on: currentMonthStart,
        rolled_over: true,
      };
    }
    return t;
  });
}

/**
 * Computes each person's lending wallet summary: total lent, total repaid,
 * open receivable balance, and open repayment titles (for 1-click partial/full settlement).
 */
export function summarizePeopleLoans({ people = [], titles = [] }) {
  const byPerson = new Map();
  for (const p of people) {
    byPerson.set(p.id, {
      person: p,
      totalLentCents: 0,
      totalRepaidCents: 0,
      openBalanceCents: 0,
      openRepaymentTitles: [],
      historyCount: 0,
    });
  }

  for (const t of titles) {
    if (!t.person_id || !byPerson.has(t.person_id)) continue;
    const entry = byPerson.get(t.person_id);
    const kind = t.entry_kind || "standard";
    const amt = cents(t.amount_cents);
    const settled = cents(t.settled_cents);
    if (kind === "loan_out") {
      entry.totalLentCents += amt;
      entry.historyCount += 1;
    } else if (kind === "loan_repayment") {
      entry.totalRepaidCents += settled;
      const rem = Math.max(0, amt - settled);
      entry.openBalanceCents += rem;
      if (rem > 0) {
        entry.openRepaymentTitles.push({
          id: t.id,
          description: t.description,
          dueOn: isoDate(t.original_due_on || t.due_on),
          amountCents: amt,
          settledCents: settled,
          remainingCents: rem,
          rolledOver: Boolean(t.rolled_over),
        });
      }
    }
  }

  return [...byPerson.values()].sort((a, b) => b.openBalanceCents - a.openBalanceCents || a.person.name.localeCompare(b.person.name));
}
