import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeRange } from "./period.js";
import { computeBudgetSummary } from "./budgets.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");

test("Case D: settlement reversal restores wallet cash without undoing budget consumption", () => {
  const categories = [
    { id: "c-food", name: "Alimentação", direction: "expense", parent_id: null, active: true }
  ];
  const budgetRules = [
    { id: "r1", category_id: "c-food", limit_cents: "40000", starts_month: "2026-11", active: true }
  ];
  const economicEvents = [
    {
      id: "e1",
      direction: "expense",
      description: "Mercado",
      amount_cents: "2980",
      occurred_on: "2026-11-17",
      category_id: "c-food",
      event_kind: "one_off",
      status: "committed"
    }
  ];
  const baseData = {
    wallets: [{ id: "w1", opening_balance_cents: "100000", opening_at: "2026-11-01T00:00:00Z" }],
    categories,
    budgetRules,
    economicEvents,
    titles: [
      {
        id: "t1",
        economic_event_id: "e1",
        wallet_id: "w1",
        direction: "expense",
        category: "Alimentação",
        amount_cents: "2980",
        settled_cents: "2980",
        due_on: "2026-11-17"
      }
    ],
    settlements: [
      {
        id: "s1",
        title_id: "t1",
        wallet_id: "w1",
        direction: "expense",
        amount_cents: "2980",
        settled_on: "2026-11-17",
        created_at: "2026-11-17T12:00:00Z",
        reversed_at: null
      }
    ]
  };

  const paid = computeRange(baseData, "2026-11-01", "2026-11-30", "2026-11-17");
  assert.equal(paid.liveCash, 97020);
  assert.equal(paid.budgetSummary[0].usedCents, 2980);
  assert.equal(paid.budgetSummary[0].remainingCents, 37020);

  // Reverse the settlement
  const reversedData = {
    ...baseData,
    titles: [{ ...baseData.titles[0], settled_cents: "0" }],
    settlements: [{ ...baseData.settlements[0], reversed_at: "2026-11-17T13:00:00Z" }]
  };
  const reversed = computeRange(reversedData, "2026-11-01", "2026-11-30", "2026-11-17");
  assert.equal(reversed.liveCash, 100000);
  assert.equal(reversed.payable.open, 2980);
  assert.equal(reversed.budgetSummary[0].usedCents, 2980);
  assert.equal(reversed.budgetSummary[0].remainingCents, 37020);

  const directBudget = computeBudgetSummary({
    month: "2026-11",
    categories,
    budgetRules,
    economicEvents,
    titles: reversedData.titles
  });
  assert.equal(directBudget[0].usedCents, 2980);
});

test("SQL migrations 005-007 enforce user_id isolation, REVOKE ALL, and integer cents checks", () => {
  const dbDir = path.join(repoRoot, "apps", "web", "db");
  for (const file of ["005_categories_and_budgets.sql", "006_economic_events.sql", "007_economic_event_sync.sql"]) {
    const sql = fs.readFileSync(path.join(dbDir, file), "utf8");
    assert.match(sql, /user_id\s+TEXT|p_user_id\s+TEXT/i, `${file} must scope by user_id`);
    assert.match(sql, /REVOKE ALL ON FUNCTION/i, `${file} must revoke public execution on functions`);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM public\.kc_titles/i, `${file} must be additive`);
  }
});

test("UI invariants: no implicit Moradia default and no 'disponível para gastar' from budgets", () => {
  const dashboardSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "Dashboard.jsx"), "utf8");
  const budgetListSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "BudgetList.jsx"), "utf8");
  assert.doesNotMatch(dashboardSrc, /category:\s*CATS\[kind\]\[0\]/);
  assert.match(budgetListSrc, /Restante do limite/);
  assert.doesNotMatch(budgetListSrc, /disponível para gastar/i);
});
