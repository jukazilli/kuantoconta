import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTransfer,
  formatTransferDescriptions,
  findCounterpartTransferTitle,
  isTransferTitle,
} from "./transfers.js";
import {
  computeMonthlyIncomeCeilingCents,
  computeBudgetSummary,
  computeTotalDebtCents,
} from "./budgets.js";
import { compute } from "./finance.js";

test("validateTransfer validates wallets, distinct accounts, amount, and dates", () => {
  assert.equal(validateTransfer({ fromWalletId: "", toWalletId: "w2", amountCents: 1000, transferredOn: "2026-11-20" }).ok, false);
  assert.equal(validateTransfer({ fromWalletId: "w1", toWalletId: "w1", amountCents: 1000, transferredOn: "2026-11-20" }).ok, false);
  assert.equal(validateTransfer({ fromWalletId: "w1", toWalletId: "w2", amountCents: 0, transferredOn: "2026-11-20" }).ok, false);
  assert.equal(validateTransfer({ fromWalletId: "w1", toWalletId: "w2", amountCents: -500, transferredOn: "2026-11-20" }).ok, false);
  assert.equal(validateTransfer({ fromWalletId: "w1", toWalletId: "w2", amountCents: 5000, transferredOn: "invalid" }).ok, false);

  const valid = validateTransfer({ fromWalletId: "w1", toWalletId: "w2", amountCents: 5000, transferredOn: "2026-11-20" });
  assert.equal(valid.ok, true);
  assert.equal(valid.amountCents, 5000);
});

test("formatTransferDescriptions generates symmetric labels and supports custom description", () => {
  const auto = formatTransferDescriptions({ fromWalletName: "Nubank", toWalletName: "PagBank" });
  assert.equal(auto.outDescription, "Transferência para PagBank");
  assert.equal(auto.inDescription, "Transferência de Nubank");

  const custom = formatTransferDescriptions({
    fromWalletName: "Nubank",
    toWalletName: "PagBank",
    customDescription: "Pix reserva emergência"
  });
  assert.equal(custom.outDescription, "Pix reserva emergência");
  assert.equal(custom.inDescription, "Pix reserva emergência");
});

test("findCounterpartTransferTitle and isTransferTitle detect transfer link and counterpart", () => {
  const t1 = { id: "t1", transfer_id: "xfer-1", wallet_id: "w1", direction: "expense", entry_kind: "transfer" };
  const t2 = { id: "t2", transfer_id: "xfer-1", wallet_id: "w2", direction: "income", entry_kind: "transfer" };
  const t3 = { id: "t3", direction: "expense", entry_kind: "standard" };

  assert.equal(isTransferTitle(t1), true);
  assert.equal(isTransferTitle(t3), false);

  const found = findCounterpartTransferTitle(t1, [t1, t2, t3]);
  assert.equal(found?.id, "t2");

  const none = findCounterpartTransferTitle(t3, [t1, t2, t3]);
  assert.equal(none, null);
});

test("transfers preserve accounting invariants: zero income inflation, zero budget consumption, zero debt addition", () => {
  const transferTitles = [
    {
      id: "out-1",
      wallet_id: "w1",
      direction: "expense",
      category: "Transferência",
      amount_cents: 50000,
      settled_cents: 50000,
      due_on: "2026-11-20",
      entry_kind: "transfer",
      transfer_id: "xfer-abc",
    },
    {
      id: "in-1",
      wallet_id: "w2",
      direction: "income",
      category: "Transferência",
      amount_cents: 50000,
      settled_cents: 50000,
      due_on: "2026-11-20",
      entry_kind: "transfer",
      transfer_id: "xfer-abc",
    },
  ];

  // 1. Does not inflate monthly income ceiling
  const incomeCeiling = computeMonthlyIncomeCeilingCents({
    month: "2026-11",
    titles: transferTitles,
  });
  assert.equal(incomeCeiling, 0);

  // 2. Does not consume expense budget
  const categories = [
    { id: "c-other", name: "Outros", direction: "expense", parent_id: null, active: true },
  ];
  const budgetRules = [
    { id: "r1", category_id: "c-other", limit_cents: 100000, starts_month: "2026-11", active: true },
  ];
  const summary = computeBudgetSummary({
    month: "2026-11",
    categories,
    budgetRules,
    titles: transferTitles,
  });
  assert.equal(summary[0].usedCents, 0);

  // 3. Does not count as financial debt
  const totalDebt = computeTotalDebtCents({
    titles: transferTitles,
    liabilities: [],
    knownCash: true,
  });
  assert.equal(totalDebt, 0);

  // 4. Live cash moves between wallets without changing overall cash
  const wallets = [
    { id: "w1", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" },
    { id: "w2", opening_balance_cents: 20000, opening_at: "2026-11-01T00:00:00Z" },
  ];
  const settlements = [
    { id: "s1", title_id: "out-1", wallet_id: "w1", direction: "expense", amount_cents: 50000, settled_on: "2026-11-20", created_at: "2026-11-20T10:00:00Z" },
    { id: "s2", title_id: "in-1", wallet_id: "w2", direction: "income", amount_cents: 50000, settled_on: "2026-11-20", created_at: "2026-11-20T10:00:00Z" },
  ];
  const res = compute({ wallets, titles: transferTitles, settlements }, "2026-11-30", "2026-11-20");
  assert.equal(res.liveCash, 120000); // 100k + 20k - 50k + 50k = 120k
});
