import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePlanRemainingCents,
  enrichSpendingPlans,
  findMatchingSpendingPlans,
} from "./spending-plans.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("LC-03, LC-04, LC-05, LC-06: spending plan remaining reconciles partial, over-spend, closed, and cancelled plans", () => {
  const plan = {
    id: "p1",
    category_id: "c-food",
    description: "Mercado",
    estimated_amount_cents: 30000,
    planned_for: "2026-12-01",
    planned_month: "2026-12",
    status: "partially_fulfilled",
  };

  // LC-04: R$ 100 purchased, user keeps remaining => R$ 200 remaining
  assert.equal(
    computePlanRemainingCents(plan, [{ plan_id: "p1", economic_event_id: "e1", allocated_cents: 10000 }]),
    20000
  );

  // LC-03: R$ 280 purchased and user closes plan (status = fulfilled) => 0 remaining
  assert.equal(
    computePlanRemainingCents(
      { ...plan, status: "fulfilled" },
      [{ plan_id: "p1", economic_event_id: "e1", allocated_cents: 28000 }]
    ),
    0
  );

  // LC-05: R$ 350 purchased (> R$ 300 estimate) => remaining clamps at 0 (no negative or extra expense)
  assert.equal(
    computePlanRemainingCents(plan, [{ plan_id: "p1", economic_event_id: "e1", allocated_cents: 35000 }]),
    0
  );

  // LC-06: Cancelled plan => 0 remaining
  assert.equal(
    computePlanRemainingCents({ ...plan, status: "cancelled", cancelled_at: "2026-11-20T00:00:00Z" }, []),
    0
  );
});

test("LC-07: past planned_for date sets needsReview=true without marking plan as debt/overdue", () => {
  const enriched = enrichSpendingPlans(
    [
      {
        id: "p-past",
        category_id: "c-food",
        description: "Mercado atrasado",
        estimated_amount_cents: 30000,
        planned_for: "2026-11-01",
        planned_month: "2026-11",
        status: "planned",
      },
      {
        id: "p-future",
        category_id: "c-food",
        description: "Mercado futuro",
        estimated_amount_cents: 30000,
        planned_for: "2026-12-01",
        planned_month: "2026-12",
        status: "planned",
      },
    ],
    [],
    "2026-11-17"
  );

  assert.equal(enriched[0].needsReview, true);
  assert.equal(enriched[0].status, "planned");
  assert.equal(enriched[1].needsReview, false);
});

test("LC-21: findMatchingSpendingPlans suggests active same-category/month plans without mutating them", () => {
  const plans = [
    { id: "p1", category_id: "c-food", description: "Mercado", estimated_amount_cents: 30000, planned_for: "2026-12-01", planned_month: "2026-12", status: "planned" },
    { id: "p2", category_id: "c-other", description: "Cinema", estimated_amount_cents: 10000, planned_for: "2026-12-01", planned_month: "2026-12", status: "planned" },
  ];
  const matches = findMatchingSpendingPlans({
    plans,
    applications: [],
    categoryId: "c-food",
    occurredOn: "2026-12-02",
    today: "2026-12-02",
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "p1");
});

test("Migration 009 enforces user_id isolation, idempotency_key, and REVOKE ALL on functions", () => {
  const sqlText = readFileSync(
    path.join(__dirname, "../db/009_spending_plans_and_reconciliation.sql"),
    "utf8"
  );
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS public\.kc_spending_plans/i);
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS public\.kc_spending_plan_applications/i);
  assert.match(sqlText, /UNIQUE \(user_id, idempotency_key\)/i);
  assert.match(sqlText, /FOREIGN KEY \(plan_id, user_id\) REFERENCES public\.kc_spending_plans\(id, user_id\)/i);
  assert.match(sqlText, /REVOKE ALL ON FUNCTION public\.kc_create_spending_plan/i);
  assert.match(sqlText, /REVOKE ALL ON FUNCTION public\.kc_apply_event_to_spending_plan/i);
});
