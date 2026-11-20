import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeInvoiceCycleForPurchase,
  computeCardUsage,
  buildCardInvoices,
  consolidateCreditCardTitles,
} from "./credit-cards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("computeInvoiceCycleForPurchase handles before/after closing day and dueDay vs closingDay", () => {
  // Card closes day 5, due day 10 (same month)
  const beforeClose = computeInvoiceCycleForPurchase({
    purchaseDate: "2026-11-02",
    closingDay: 5,
    dueDay: 10,
  });
  assert.equal(beforeClose.invoiceMonth, "2026-11");
  assert.equal(beforeClose.closingDate, "2026-11-05");
  assert.equal(beforeClose.dueDate, "2026-11-10");

  // Purchased day 6 (after day 5 close) -> rolls to December invoice
  const afterClose = computeInvoiceCycleForPurchase({
    purchaseDate: "2026-11-06",
    closingDay: 5,
    dueDay: 10,
  });
  assert.equal(afterClose.invoiceMonth, "2026-12");
  assert.equal(afterClose.closingDate, "2026-12-05");
  assert.equal(afterClose.dueDate, "2026-12-10");

  // Card closes day 25, due day 5 (next month)
  const crossMonth = computeInvoiceCycleForPurchase({
    purchaseDate: "2026-11-20",
    closingDay: 25,
    dueDay: 5,
  });
  assert.equal(crossMonth.invoiceMonth, "2026-12");
  assert.equal(crossMonth.closingDate, "2026-11-25");
  assert.equal(crossMonth.dueDate, "2026-12-05");
});

test("computeCardUsage, buildCardInvoices, and consolidateCreditCardTitles track limit, partial payment, and statuses", () => {
  const card = { id: "card-1", name: "Nubank", limit_cents: "100000", closing_day: 5, due_day: 10 };
  const titles = [
    { id: "t1", direction: "expense", description: "Mercado", category: "Alimentação", credit_card_id: "card-1", invoice_month: "2026-12", due_on: "2026-12-10", amount_cents: "30000", settled_cents: "10000" },
    { id: "t2", direction: "expense", description: "Farmácia", category: "Saúde", credit_card_id: "card-1", invoice_month: "2026-12", due_on: "2026-12-10", amount_cents: "20000", settled_cents: "0" },
    { id: "t3", direction: "expense", description: "Parcela 2/2", category: "Lazer", credit_card_id: "card-1", invoice_month: "2027-01", due_on: "2027-01-10", amount_cents: "15000", settled_cents: "0" },
    { id: "t4", direction: "expense", description: "Aluguel", category: "Moradia", credit_card_id: null, due_on: "2026-12-05", amount_cents: "80000", settled_cents: "0" },
  ];

  // Open balance across all invoices: (300 - 100) + 200 + 150 = 550 => available = 450
  const usage = computeCardUsage(card, titles);
  assert.equal(usage.usedLimitCents, 55000);
  assert.equal(usage.availableLimitCents, 45000);
  assert.equal(usage.utilizationPct, 55);

  // On 2026-12-06 (after closing day 5, before due day 10), Dec invoice is "closed"
  const invoices = buildCardInvoices(card, titles, "2026-12-06");
  const dec = invoices.find((i) => i.month === "2026-12");
  assert.equal(dec.status, "closed");
  assert.equal(dec.totalCents, 50000);
  assert.equal(dec.paidCents, 10000);
  assert.equal(dec.remainingCents, 40000);

  // Consolidation collapses t1+t2 into 1 "Fatura – Nubank" row for Dec, t3 into Jan, keeping Aluguel untouched
  const consolidated = consolidateCreditCardTitles(titles, [card], "2026-12-06");
  assert.equal(consolidated.length, 3);
  const decRow = consolidated.find((r) => r.id === "invoice:card-1:2026-12");
  assert.equal(decRow.description, "Fatura – Nubank");
  assert.equal(decRow.amount_cents, "50000");
  assert.equal(decRow.settled_cents, "10000");
  assert.equal(decRow.isCreditCardInvoice, true);
});

test("Migration 014 creates kc_credit_cards with REVOKE ALL and adds credit_card_id/invoice_month to kc_titles", () => {
  const sqlSrc = readFileSync(path.join(__dirname, "../db/014_credit_cards.sql"), "utf8");
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_credit_cards/);
  assert.match(sqlSrc, /closing_day INTEGER NOT NULL CHECK \(closing_day BETWEEN 1 AND 31\)/);
  assert.match(sqlSrc, /due_day INTEGER NOT NULL CHECK \(due_day BETWEEN 1 AND 31\)/);
  assert.match(sqlSrc, /ADD COLUMN IF NOT EXISTS credit_card_id UUID/);
  assert.match(sqlSrc, /ADD COLUMN IF NOT EXISTS invoice_month CHAR\(7\)/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_credit_cards FROM PUBLIC/);
});
