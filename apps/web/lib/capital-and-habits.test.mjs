import test from "node:test";
import assert from "node:assert/strict";
import { computeCapitalPace } from "./capital-pace.js";
import { analyzeConsumptionHabits } from "./habit-analyzer.js";

test("computeCapitalPace detects on-pace vs behind-pace capital goals", () => {
  const onPace = computeCapitalPace({
    targetCents: 600000, // R$ 6.000
    targetDate: "2027-05-19", // 6 months
    currentCapitalCents: 120000, // R$ 1.200 -> faltam R$ 4.800 (R$ 800/mês)
    monthlyContributionCents: 80000,
    today: "2026-11-19",
  });
  assert.equal(onPace.onPace, true);
  assert.equal(onPace.requiredMonthlyCents, 80000);
  assert.equal(onPace.progressPct, 20);
  assert.equal(onPace.monthlyGapCents, 0);

  const behind = computeCapitalPace({
    targetCents: 600000,
    targetDate: "2027-05-19",
    currentCapitalCents: 120000,
    monthlyContributionCents: 50000, // R$ 500/mês < R$ 800/mês
    today: "2026-11-19",
  });
  assert.equal(behind.onPace, false);
  assert.equal(behind.monthlyGapCents, 30000);
  assert.equal(behind.estimatedMonthsAtCurrentPace, 10);
});

test("analyzeConsumptionHabits detects small leaks (formiguinha), weekend share, top leaks, and tesouraco savings", () => {
  const habits = analyzeConsumptionHabits({
    rows: [
      { id: "1", direction: "expense", description: "Café", category: "Alimentação", amount_cents: 1500, due_on: "2026-11-14" }, // sat
      { id: "2", direction: "expense", description: "Uber curto", category: "Transporte", amount_cents: 2200, due_on: "2026-11-15" }, // sun
      { id: "3", direction: "expense", description: "Lanche", category: "Alimentação", amount_cents: 3000, due_on: "2026-11-18" }, // wed
      { id: "4", direction: "expense", description: "Mercado", category: "Alimentação", amount_cents: 40000, due_on: "2026-11-10" },
      { id: "5", direction: "expense", description: "Aporte", category: "Reserva e Capital", amount_cents: 50000, due_on: "2026-11-05", entry_kind: "reserve_transfer" },
    ],
    recurringRules: [
      { id: "r1", direction: "expense", description: "Streaming", category: "Assinaturas", amount_cents: 5500 },
    ],
  });

  assert.equal(habits.smallLeaks.detected, true);
  assert.equal(habits.smallLeaks.count, 3);
  assert.equal(habits.smallLeaks.monthlyTotalCents, 6700);
  assert.equal(habits.topLeaks[0].category, "Alimentação");
  assert.equal(habits.weekend.count, 2);
  assert.equal(habits.recurringItems.length, 1);
  assert.equal(habits.tesouraco.potentialMonthlySavingsCents > 0, true);
});
