import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeRange } from "./period.js";
import { computeTotalDebtCents } from "./budgets.js";
import { addMonthsToIsoDate, summarizePeopleLoans } from "./lending.js";
import {
  DEFAULT_DESKTOP_COLUMNS,
  addWorkspaceColumn,
  moveWorkspaceColumn,
  removeWorkspaceColumn,
  reorderWorkspaceColumns,
  sanitizeWorkspaceColumns,
} from "./workspace-columns.js";
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

test("UI/UX Redesign invariants: separated Orçamentos & Planejamento, unified 1-line topbar, Novo menu, Caixinhas, clickable wallets, no duplicate month nav", () => {
  const dashboardSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "Dashboard.jsx"), "utf8");
  const drawerSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "EntryDrawer.jsx"), "utf8");
  const cssSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "globals.css"), "utf8");

  // 1. Navigation separates budgets and planning, removes profile from bottom dock
  assert.match(dashboardSrc, /\["budgets",\s*"Orçamentos"\]/);
  assert.match(dashboardSrc, /\["planning",\s*"Planejamento"\]/);
  assert.doesNotMatch(dashboardSrc, /\["profile",\s*"Perfil"\]/);

  // 2. Unified topbar and Novo menu (no legacy toolbar or Criar button or duplicate movements-period-nav)
  assert.match(dashboardSrc, /className="topbar-left"/);
  assert.match(dashboardSrc, /className="topbar-center"/);
  assert.match(dashboardSrc, /Novo\s*<\/button>/);
  assert.doesNotMatch(dashboardSrc, /className="movements-period-nav"/);
  assert.doesNotMatch(dashboardSrc, /window\.confirm\(/);

  // 3. Caixinhas in planning, clickable accounts, and unified transfer (no separate transfer_capital drawer)
  assert.match(dashboardSrc, /Caixinha \(Guardar dinheiro\)/);
  assert.match(dashboardSrc, /setSelectedWallet\(w\)/);
  assert.match(dashboardSrc, /setSelectedCaixinha\(/);
  assert.doesNotMatch(drawerSrc, /drawer==="transfer_capital"/);

  // 4. Caixinhas separated balances, reserve_caixinha flow, and no Sugerir limites in UI
  assert.doesNotMatch(dashboardSrc, /Sugerir limites/);
  assert.match(dashboardSrc, /openReserveCaixinha/);
  assert.match(drawerSrc, /drawer==="reserve_caixinha"/);
  assert.match(drawerSrc, /form\.parentWalletId/);
  assert.match(drawerSrc, /form\.downPaymentSource/);

  // 5. All :hover rules in globals.css are protected by @media (hover: hover)
  const hoverLines = cssSrc.split(/\r?\n/).filter((line) => line.includes(":hover"));
  assert.ok(hoverLines.length > 0);
});

test("Money Lifecycle Integrity: transfers and reserve transfers do not inflate A pagar, A receber, or category charts", () => {
  const data = {
    wallets: [
      { id: "w1", name: "Nubank", opening_balance_cents: 100000, opening_at: "2026-11-01T00:00:00Z" },
      { id: "w2", name: "Caixinha", opening_balance_cents: 0, opening_at: "2026-11-20T12:00:00Z", parent_wallet_id: "w1", caixinha_purpose: "goal" },
    ],
    titles: [
      { id: "t-sal", wallet_id: "w1", direction: "income", category: "Salário", amount_cents: 300000, settled_cents: 0, due_on: "2026-11-25", entry_kind: "standard" },
      { id: "t-exp", wallet_id: "w1", direction: "expense", category: "Moradia", amount_cents: 100000, settled_cents: 0, due_on: "2026-11-25", entry_kind: "standard" },
      { id: "t-res-out", wallet_id: "w1", direction: "expense", category: "Caixinhas", amount_cents: 50000, settled_cents: 50000, due_on: "2026-11-20", entry_kind: "reserve_transfer", transfer_id: "x1" },
      { id: "t-res-in", wallet_id: "w2", direction: "income", category: "Caixinhas", amount_cents: 50000, settled_cents: 50000, due_on: "2026-11-20", entry_kind: "reserve_transfer", transfer_id: "x1" },
      { id: "t-tr-out", wallet_id: "w1", direction: "expense", category: "Transferência", amount_cents: 20000, settled_cents: 20000, due_on: "2026-11-20", entry_kind: "transfer", transfer_id: "x2" },
    ],
    settlements: [
      // Same exact timestamp as opening_at on w2 (Falha 2 regression test!)
      { id: "s1", title_id: "t-res-out", wallet_id: "w1", direction: "expense", amount_cents: 50000, settled_on: "2026-11-20", created_at: "2026-11-20T12:00:00Z", reversed_at: null },
      { id: "s2", title_id: "t-res-in", wallet_id: "w2", direction: "income", amount_cents: 50000, settled_on: "2026-11-20", created_at: "2026-11-20T12:00:00Z", reversed_at: null },
    ],
  };

  const r = computeRange(data, "2026-11-01", "2026-11-30", "2026-11-20");
  assert.equal(r.receivable.total, 300000);
  assert.equal(r.payable.total, 100000);
  assert.equal(r.categoryTotals["Caixinhas"], undefined);
  assert.equal(r.categoryTotals["Transferência"], undefined);
  assert.equal(r.categoryTotals["Moradia"], 100000);
  assert.equal(r.liveCash, 100000); // s1 (-50k on w1) + s2 (+50k on w2 at exact opening_at!) = 100k preserved!
});

test("Migration 017 & backend guards: event/settlement/liability sync, withdraw balance check, and credit card goal columns", () => {
  const sql017 = fs.readFileSync(path.join(repoRoot, "apps", "web", "db", "017_money_lifecycle_integrity.sql"), "utf8");
  assert.match(sql017, /ADD COLUMN IF NOT EXISTS payment_method/i);
  assert.match(sql017, /ADD COLUMN IF NOT EXISTS credit_card_id/i);
  assert.match(sql017, /kc_edit_title_and_event/i);
  assert.match(sql017, /kc_cancel_title_scope/i);
  assert.match(sql017, /UPDATE public\.kc_liabilities/i);
  assert.match(sql017, /REVOKE ALL ON FUNCTION public\.kc_edit_title_and_event/i);
  assert.match(sql017, /REVOKE ALL ON FUNCTION public\.kc_cancel_title_scope/i);

  const serviceSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "lib", "portfolio-service.js"), "utf8");
  assert.match(serviceSrc, /Saldo insuficiente nesta caixinha para realizar o resgate/);
  assert.match(serviceSrc, /now\(\) - interval '1 second'/);
  assert.match(serviceSrc, /\["transfer", "reserve_transfer"\]\.includes/);
});

test("Section 8: Migration 018, Unified Command Bar header with total balance pill, Planejamentos grid & multi-step PlanningWizard", () => {
  const sql018 = fs.readFileSync(path.join(repoRoot, "apps", "web", "db", "018_planning_modes_and_quotes.sql"), "utf8");
  assert.match(sql018, /ADD COLUMN IF NOT EXISTS plan_type/i);
  assert.match(sql018, /ADD COLUMN IF NOT EXISTS payment_structure/i);
  assert.match(sql018, /ADD COLUMN IF NOT EXISTS quotes_json/i);
  assert.match(sql018, /ADD COLUMN IF NOT EXISTS budget_category_id/i);
  assert.match(sql018, /ADD COLUMN IF NOT EXISTS selected_wallet_id/i);

  const dashSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "Dashboard.jsx"), "utf8");
  const wizardSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "PlanningWizard.jsx"), "utf8");
  const cssSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "globals.css"), "utf8");

  assert.match(dashSrc, /topbar-balance-pill/);
  assert.match(dashSrc, /checkingBalanceCents \+ capitalBalanceCents/);
  assert.match(dashSrc, />Planejamentos</);
  assert.match(dashSrc, />Novo planejamento</);
  assert.match(dashSrc, /compareSavedPlans/);
  assert.match(dashSrc, /buildExecutionTitlesFromGoal/);
  assert.match(wizardSrc, /Compra \/ Objetivo/);
  assert.match(wizardSrc, /Viagem \/ Projeto/);
  assert.match(wizardSrc, /Lista de compras/);
  assert.match(wizardSrc, /Salvar planejamento/);
  assert.match(cssSrc, /\.drawer\.drawer-wide/);
});

test("Lending upgrade: credit card loans, installment repayments, debt inclusion, and date clamping", () => {
  assert.equal(addMonthsToIsoDate("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsToIsoDate("2026-11-22", 2), "2027-01-22");

  const summary = summarizePeopleLoans({
    people: [{ id: "p1", name: "João", relationship: "Amigo" }],
    titles: [
      { id: "o1", person_id: "p1", entry_kind: "loan_out", amount_cents: 60000, settled_cents: 0, due_on: "2026-12-10", credit_card_id: "cc1" },
      { id: "r2", person_id: "p1", entry_kind: "loan_repayment", amount_cents: 30000, settled_cents: 0, due_on: "2027-01-10", installment_index: 2, installment_total: 2 },
      { id: "r1", person_id: "p1", entry_kind: "loan_repayment", amount_cents: 30000, settled_cents: 0, due_on: "2026-12-10", installment_index: 1, installment_total: 2 },
    ],
  });
  assert.equal(summary[0].openBalanceCents, 60000);
  assert.equal(summary[0].openRepaymentTitles[0].id, "r1");
  assert.equal(summary[0].openRepaymentTitles[0].installmentTotal, 2);

  // Unpaid credit card loan_out counts in Endividamento; cash loan_out does not
  const debt = computeTotalDebtCents({
    knownCash: true,
    titles: [
      { id: "o1", direction: "expense", entry_kind: "loan_out", credit_card_id: "cc1", amount_cents: 60000, settled_cents: 0, due_on: "2026-12-10" },
      { id: "o2", direction: "expense", entry_kind: "loan_out", credit_card_id: null, amount_cents: 50000, settled_cents: 50000, due_on: "2026-11-22" },
    ],
    liabilities: [],
  });
  assert.equal(debt, 60000);

  const serviceSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "lib", "portfolio-service.js"), "utf8");
  const drawerSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "EntryDrawer.jsx"), "utf8");
  assert.match(serviceSrc, /cardInstallments/);
  assert.match(serviceSrc, /repaymentCount/);
  assert.match(drawerSrc, /lendCreditCardId/);
  assert.match(drawerSrc, /Acompanhar parcelas do cartão/);
});

test("Desktop Column Workspace: column helpers, persistence migration 019, and responsive invariants", () => {
  assert.deepEqual(sanitizeWorkspaceColumns(null), DEFAULT_DESKTOP_COLUMNS);
  assert.deepEqual(sanitizeWorkspaceColumns(["overview", "invalid", "budgets", "overview"]), ["overview", "budgets"]);
  assert.deepEqual(addWorkspaceColumn(["overview", "movements"], "planning"), ["overview", "movements", "planning"]);
  assert.deepEqual(addWorkspaceColumn(["overview", "movements"], "overview"), ["overview", "movements"]);
  assert.deepEqual(removeWorkspaceColumn(["overview", "movements", "health"], "movements"), ["overview", "health"]);
  assert.deepEqual(moveWorkspaceColumn(["overview", "movements", "health"], "health", -1), ["overview", "health", "movements"]);
  assert.deepEqual(reorderWorkspaceColumns(["overview", "movements", "health"], "health", "overview"), ["health", "overview", "movements"]);

  const sql019 = fs.readFileSync(path.join(repoRoot, "apps", "web", "db", "019_workspace_preferences.sql"), "utf8");
  assert.match(sql019, /CREATE TABLE IF NOT EXISTS public\.kc_user_preferences/i);
  assert.match(sql019, /desktop_columns JSONB/i);

  const serviceSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "lib", "portfolio-service.js"), "utf8");
  const dashSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "Dashboard.jsx"), "utf8");
  const desktopSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "DesktopWorkspace.jsx"), "utf8");
  const cssSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "globals.css"), "utf8");

  assert.match(serviceSrc, /save_workspace_prefs/);
  assert.match(dashSrc, /isDesktopWorkspace/);
  assert.match(dashSrc, /<DesktopWorkspace/);
  assert.match(dashSrc, /topbar-cols-pill/);
  assert.match(desktopSrc, /workspace-deck-viewport/);
  assert.match(desktopSrc, /workspace-add-rail/);
  assert.match(desktopSrc, /col-flat-section/);
  assert.match(cssSrc, /min-width:\s*390px/);
  assert.match(cssSrc, /flex:\s*0 0 clamp\(395px,\s*29vw,\s*440px\)/);
  assert.match(cssSrc, /scrollbar-width:\s*none/);

  const budgetListSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "BudgetList.jsx"), "utf8");
  const bankIconSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "BankIcon.jsx"), "utf8");
  assert.match(budgetListSrc, /budget-uncapped-group/);
  assert.doesNotMatch(budgetListSrc, /Toque para ver detalhes/);
  assert.match(bankIconSrc, /alt=""/);
});

test("Mobile Exclusive UI/UX (Minhas Finanças + Kuantoconta Thesis): MobileWorkspace, Lateral Drawer, Endividamento, 31/12 Cuts, Speed Dial, and Full-Screen List-Row Form", () => {
  const dashSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "Dashboard.jsx"), "utf8");
  const mobileSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "MobileWorkspace.jsx"), "utf8");
  const drawerSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "dashboard", "EntryDrawer.jsx"), "utf8");
  const cssSrc = fs.readFileSync(path.join(repoRoot, "apps", "web", "app", "globals.css"), "utf8");

  // 1. Exclusive mobile detection (<= 767px) separate from tablet & desktop (>= 1024px)
  assert.match(dashSrc, /matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(dashSrc, /<MobileWorkspace/);
  assert.match(dashSrc, /isMobilePhone=\{isMobilePhone\}/);

  // 2. Minhas Finanças inspired mobile shell with Kuantoconta Orange theme, lateral drawer, 3-point hero, A pagar|A receber pending tabs, 2x2 Visão Geral with Endividamento, 31/12 cuts gauge, FAB Speed Dial (A pagar, A receber, Emprestar, etc.), Complete Cards, Transactions & Charts
  assert.match(mobileSrc, /kc-mob-topbar/);
  assert.match(mobileSrc, /kc-mob-drawer/);
  assert.match(mobileSrc, /kc-mob-hero-card/);
  assert.match(mobileSrc, /31\/12 c\/ cortes/);
  assert.match(mobileSrc, /Ver despesas pendentes/);
  assert.match(mobileSrc, />Endividamento</);
  assert.match(mobileSrc, /Cortes & Fim do Ano/);
  assert.match(mobileSrc, />A pagar</);
  assert.match(mobileSrc, />A receber</);
  assert.match(mobileSrc, />Emprestar</);
  assert.match(mobileSrc, /Despesa cartão/);
  assert.match(mobileSrc, /Guardar em caixinha/);
  assert.match(mobileSrc, /kc-mob-speed-dial/);
  assert.match(mobileSrc, /Fatura parcial/);
  assert.match(mobileSrc, /Registrar pagamento/);
  assert.match(mobileSrc, /Ranking categorias/);
  assert.match(mobileSrc, /Despesas por recorrência/);
  assert.match(mobileSrc, /Despesas Conta x Cartão/);
  assert.match(mobileSrc, /kc-mob-tx-item/);

  // 3. Full-screen List-Row Mobile Form (Nova Receita / Nova Despesa / Emprestar / Empréstimo / Toggle Switch Efetivada / CategoryCircleIcon)
  assert.match(drawerSrc, /kc-mob-fullscreen-drawer/);
  assert.match(drawerSrc, /newTitle&&!isMobilePhone&&<div className="direction-cards four"/);
  assert.match(drawerSrc, /Alternar tipo de lançamento/);
  assert.match(drawerSrc, /Nova Receita/);
  assert.match(drawerSrc, /Nova Despesa/);
  assert.match(drawerSrc, /Despesa Cartão/);
  assert.match(drawerSrc, /Efetivada/);
  assert.match(drawerSrc, /kc-mob-switch/);
  assert.match(drawerSrc, /CategoryCircleIcon/);
  assert.match(drawerSrc, /Depositar valor na conta/);
  assert.match(drawerSrc, /Devolução pela pessoa/);

  // 4. Zero :hover rules inside the mobile exclusive CSS section
  const mobileCssSection = cssSrc.split("KUANTOCONTA MOBILE EXCLUSIVE UI & UX")[1] || "";
  assert.ok(mobileCssSection.length > 500);
  const mobileHoverRules = mobileCssSection
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("/*") && !line.trim().startsWith("*") && line.includes(":hover"));
  assert.equal(mobileHoverRules.length, 0, "Mobile exclusive CSS must not contain any :hover rules");
});
