import { cents, isoDate } from "./finance.js";

function daysInMonth(year, month1to12) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function makeDate(year, month1to12, day) {
  const maxDay = daysInMonth(year, month1to12);
  const clamped = Math.max(1, Math.min(maxDay, Number(day) || 1));
  return `${String(year).padStart(4, "0")}-${String(month1to12).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export function addMonthsYm(ym, delta) {
  const [y, m] = String(ym).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Given a purchase date (YYYY-MM-DD) and a card's closingDay & dueDay (1..31),
 * returns the invoice cycle metadata { invoiceMonth, closingDate, dueDate }.
 *
 * Rules:
 * - If purchaseDay <= closingDay -> closes in the same calendar month.
 * - If purchaseDay > closingDay  -> rolls to next month's closing cycle.
 * - If dueDay > closingDay       -> due in the same month as closingDate.
 * - If dueDay <= closingDay      -> due in the month following closingDate.
 * - invoiceMonth is the YYYY-MM of dueDate (standard Brazilian bank convention).
 */
export function computeInvoiceCycleForPurchase({ purchaseDate, closingDay, dueDay }) {
  const d = isoDate(purchaseDate);
  const [y, m, day] = d.split("-").map(Number);
  const effClose = Math.min(daysInMonth(y, m), Number(closingDay) || 1);
  const closingYm = day <= effClose ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}` : addMonthsYm(`${y}-${String(m).padStart(2, "0")}`, 1);
  const [cy, cm] = closingYm.split("-").map(Number);
  const closingDate = makeDate(cy, cm, closingDay);

  const dueYm = Number(dueDay) > Number(closingDay) ? closingYm : addMonthsYm(closingYm, 1);
  const [dy, dm] = dueYm.split("-").map(Number);
  const dueDate = makeDate(dy, dm, dueDay);

  return {
    invoiceMonth: dueYm,
    closingDate,
    dueDate,
  };
}

export function getInvoiceCycleDates(card, invoiceMonth) {
  const [dy, dm] = String(invoiceMonth).split("-").map(Number);
  const dueDate = makeDate(dy, dm, card.due_day);
  const closingYm = Number(card.due_day) > Number(card.closing_day) ? invoiceMonth : addMonthsYm(invoiceMonth, -1);
  const [cy, cm] = closingYm.split("-").map(Number);
  const closingDate = makeDate(cy, cm, card.closing_day);
  return { invoiceMonth, closingDate, dueDate };
}

export function computeCardUsage(card, titles = []) {
  const limitCents = Math.max(0, cents(card?.limit_cents));
  const usedLimitCents = (titles || [])
    .filter((t) => !t.cancelled_at && t.direction === "expense" && t.credit_card_id === card?.id)
    .reduce((sum, t) => sum + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)), 0);
  const availableLimitCents = Math.max(0, limitCents - usedLimitCents);
  const utilizationPct = limitCents > 0 ? Math.min(100, Math.round((usedLimitCents / limitCents) * 100)) : 0;
  return { limitCents, usedLimitCents, availableLimitCents, utilizationPct };
}

export function computeInvoiceStatus({ totalCents, remainingCents, closingDate, dueDate, today }) {
  if (totalCents > 0 && remainingCents === 0) return "paid";
  if (remainingCents > 0 && today > dueDate) return "overdue";
  if (today > closingDate) return "closed";
  return "open";
}

export function buildCardInvoices(card, titles = [], today) {
  const byMonth = new Map();
  for (const t of titles || []) {
    if (t.cancelled_at || t.direction !== "expense" || t.credit_card_id !== card.id) continue;
    const ym = t.invoice_month || isoDate(t.due_on).slice(0, 7);
    if (!ym) continue;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(t);
  }

  const currentCycle = computeInvoiceCycleForPurchase({
    purchaseDate: today,
    closingDay: card.closing_day,
    dueDay: card.due_day,
  });
  if (!byMonth.has(currentCycle.invoiceMonth)) {
    byMonth.set(currentCycle.invoiceMonth, []);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, items]) => {
      const { closingDate, dueDate } = getInvoiceCycleDates(card, ym);
      const totalCents = items.reduce((s, t) => s + cents(t.amount_cents), 0);
      const paidCents = items.reduce((s, t) => s + cents(t.settled_cents), 0);
      const remainingCents = Math.max(0, totalCents - paidCents);
      const status = computeInvoiceStatus({ totalCents, remainingCents, closingDate, dueDate, today });
      return {
        cardId: card.id,
        cardName: card.name,
        month: ym,
        closingDate,
        dueDate,
        totalCents,
        paidCents,
        remainingCents,
        status,
        items: items.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))),
      };
    });
}

export function consolidateCreditCardTitles(titles = [], creditCards = [], today) {
  if (!creditCards?.length) return titles;
  const cardMap = new Map(creditCards.map((c) => [c.id, c]));
  const nonCard = [];
  const invoiceGroups = new Map();

  for (const t of titles) {
    if (t.direction === "expense" && t.credit_card_id && cardMap.has(t.credit_card_id)) {
      const ym = t.invoice_month || isoDate(t.due_on).slice(0, 7);
      const key = `${t.credit_card_id}:${ym}`;
      if (!invoiceGroups.has(key)) invoiceGroups.set(key, { card: cardMap.get(t.credit_card_id), ym, items: [] });
      invoiceGroups.get(key).items.push(t);
    } else {
      nonCard.push(t);
    }
  }

  const invoiceRows = [...invoiceGroups.values()].map(({ card, ym, items }) => {
    const { closingDate, dueDate } = getInvoiceCycleDates(card, ym);
    const totalCents = items.reduce((s, t) => s + cents(t.amount_cents), 0);
    const paidCents = items.reduce((s, t) => s + cents(t.settled_cents), 0);
    const remainingCents = Math.max(0, totalCents - paidCents);
    const status = computeInvoiceStatus({ totalCents, remainingCents, closingDate, dueDate, today });
    return {
      id: `invoice:${card.id}:${ym}`,
      isCreditCardInvoice: true,
      credit_card_id: card.id,
      invoice_month: ym,
      invoiceStatus: status,
      closingDate,
      itemCount: items.length,
      direction: "expense",
      description: `Fatura – ${card.name}`,
      category: "Cartão de crédito",
      amount_cents: String(totalCents),
      settled_cents: String(paidCents),
      due_on: dueDate,
      recurrence: "single",
      wallet_id: card.default_wallet_id || items[0]?.wallet_id || null,
    };
  });

  return [...nonCard, ...invoiceRows].sort((a, b) => isoDate(a.due_on).localeCompare(isoDate(b.due_on)));
}
