import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolloverOverdueLoanRepayments, summarizePeopleLoans } from "./lending.js";
import { computeMonthlyIncomeCeilingCents, computeBudgetSummary } from "./budgets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("rolloverOverdueLoanRepayments rolls unpaid previous-month loan_repayment into current month", () => {
  const titles = [
    {
      id: "t1",
      entry_kind: "loan_repayment",
      direction: "income",
      amount_cents: "50000",
      settled_cents: "20000", // partial payment of R$ 200; R$ 300 still open
      due_on: "2026-10-15",
      person_id: "p1",
    },
    {
      id: "t2",
      entry_kind: "loan_repayment",
      direction: "income",
      amount_cents: "10000",
      settled_cents: "10000", // fully paid -> should NOT roll over
      due_on: "2026-10-10",
      person_id: "p1",
    },
  ];

  const rolled = rolloverOverdueLoanRepayments(titles, "2026-11-19");
  assert.equal(rolled[0].due_on, "2026-11-01");
  assert.equal(rolled[0].original_due_on, "2026-10-15");
  assert.equal(rolled[0].rolled_over, true);
  assert.equal(rolled[1].due_on, "2026-10-10");
  assert.equal(rolled[1].rolled_over, undefined);

  const summary = summarizePeopleLoans({
    people: [{ id: "p1", name: "João", relationship: "Primo" }],
    titles: [
      { id: "out1", entry_kind: "loan_out", direction: "expense", amount_cents: "50000", settled_cents: "50000", person_id: "p1" },
      ...rolled,
    ],
  });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].totalLentCents, 50000);
  assert.equal(summary[0].totalRepaidCents, 30000);
  assert.equal(summary[0].openBalanceCents, 30000);
  assert.equal(summary[0].openRepaymentTitles.length, 1);
});

test("loan_out does not consume expense budget and loan_repayment does not inflate income ceiling", () => {
  const incomeCents = computeMonthlyIncomeCeilingCents({
    month: "2026-11",
    titles: [
      { direction: "income", entry_kind: "standard", amount_cents: "300000", due_on: "2026-11-05" },
      { direction: "income", entry_kind: "loan_repayment", amount_cents: "50000", due_on: "2026-11-20" },
    ],
  });
  assert.equal(incomeCents, 300000);

  const budgets = computeBudgetSummary({
    month: "2026-11",
    categories: [{ id: "c1", name: "Empréstimos", direction: "expense", parent_id: null, active: true }],
    budgetRules: [{ id: "r1", category_id: "c1", limit_cents: "100000", starts_month: "2026-11", active: true }],
    budgetPeriods: [],
    economicEvents: [],
    titles: [
      { id: "l1", direction: "expense", entry_kind: "loan_out", category: "Empréstimos", category_id: "c1", amount_cents: "50000", settled_cents: "50000", due_on: "2026-11-19" },
    ],
  });
  assert.equal(budgets[0].usedCents, 0);
});

test("Migration 012 creates kc_people with REVOKE ALL and expands kc_titles entry_kind", () => {
  const sqlSrc = readFileSync(path.join(__dirname, "../db/012_people_and_lending.sql"), "utf8");
  assert.match(sqlSrc, /CREATE TABLE IF NOT EXISTS public\.kc_people/);
  assert.match(sqlSrc, /'loan_out'/);
  assert.match(sqlSrc, /'loan_repayment'/);
  assert.match(sqlSrc, /REVOKE ALL ON TABLE public\.kc_people FROM PUBLIC/);
});
