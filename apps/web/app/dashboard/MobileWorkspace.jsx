"use client";
import { useMemo, useState } from "react";
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Bell,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowLeftRight,
  Landmark,
  CreditCard,
  ReceiptText,
  Scissors,
  Percent,
  Target,
  HeartPulse,
  PieChart,
  CalendarRange,
  CheckCircle2,
  Clock3,
  ExternalLink,
  SlidersHorizontal,
  Search,
  PiggyBank,
  Compass,
  Wallet,
  HandCoins,
  AlertTriangle,
  Award,
  Plane,
  ListChecks,
  User,
  Sparkles,
  Check,
} from "lucide-react";
import BankIcon from "./BankIcon";
import BudgetList from "./BudgetList";
import FinanceChart from "./FinanceChart";

const CATEGORY_COLORS = {
  Moradia: { bg: "#EEF2FF", fg: "#4F46E5" },
  Alimentação: { bg: "#FEF3C7", fg: "#D97706" },
  Transporte: { bg: "#E0F2FE", fg: "#0284C7" },
  Saúde: { bg: "#FCE7F3", fg: "#DB2777" },
  Lazer: { bg: "#F3E8FF", fg: "#9333EA" },
  Educação: { bg: "#DCFCE7", fg: "#15803D" },
  Assinaturas: { bg: "#FFE4E6", fg: "#E11D48" },
  Empréstimos: { bg: "#FFEDD5", fg: "#EA580C" },
  Salário: { bg: "#DCFCE7", fg: "#16A34A" },
  Benefícios: { bg: "#F3E8E2", fg: "#78350F" },
  "Renda extra": { bg: "#D1FAE5", fg: "#059669" },
  Rendimentos: { bg: "#E0E7FF", fg: "#4338CA" },
};

export function getCategoryVisual(categoryName, direction = "expense") {
  if (CATEGORY_COLORS[categoryName]) return CATEGORY_COLORS[categoryName];
  if (direction === "income") return { bg: "#DCFCE7", fg: "#16A34A" };
  return { bg: "#DBEAFE", fg: "#1D4ED8" };
}

function SemicircleSavingsGauge({ pct = 0 }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  // 5 discrete segments along a 180-degree arc (like Minhas Finanças reference)
  const segments = [0, 1, 2, 3, 4];
  const activeCount = clamped === 0 ? 0 : Math.min(5, Math.ceil(clamped / 20));
  const r = 54;
  const cx = 68;
  const cy = 66;

  function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 180) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }

  function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y].join(" ");
  }

  return (
    <div className="kc-mob-gauge-wrap">
      <svg viewBox="0 0 136 82" className="kc-mob-gauge-svg" aria-hidden="true">
        {segments.map((idx) => {
          const startAngle = idx * 36 + 3;
          const endAngle = (idx + 1) * 36 - 3;
          const isFilled = idx < activeCount;
          return (
            <path
              key={idx}
              d={describeArc(cx, cy, r, startAngle, endAngle)}
              fill="none"
              stroke={isFilled ? "#16A34A" : "#E2E5EC"}
              strokeWidth="10"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="kc-mob-gauge-Center">
        <strong>{clamped}%</strong>
        <span>de economia</span>
      </div>
    </div>
  );
}

export default function MobileWorkspace({
  user,
  active,
  setTab,
  monthNavLabel,
  monthLong,
  monthOnly,
  selectMonth,
  isCustomRange,
  rangeStart,
  date,
  today,
  fmtDate,
  isoDate,
  money,
  cents,
  display,
  summary,
  projectedBalanceCents,
  checkingBalanceCents,
  capitalBalanceCents,
  totalDebtCents,
  debtDisplay,
  checkingWallets,
  wallets,
  walletBalance,
  bankCaixinhasTotal,
  creditCards,
  expandedTitles,
  rows,
  overviewRows,
  filter,
  setFilter,
  query,
  setQuery,
  screenFilters,
  setScreenFilter,
  budgetItems,
  monthlyIncomeCents,
  allocatedBudgetCents,
  remainingAllocableCents,
  months,
  expenses,
  charts,
  capitalGoals,
  purchaseGoals,
  reserveCaixinhasCents,
  goalCaixinhasCents,
  reservedThisMonthCents,
  safeContribution,
  capitalBudget,
  caixinhaBalance,
  capitalProjectedAtDateCents,
  netWorthAtDateCents,
  peopleLoans,
  healthPlan,
  habits,
  notifications,
  setNotificationsOpen,
  setFilterOpen,
  open,
  openBudget,
  openReserveCaixinha,
  fulfillPlan,
  editPlan,
  cancelPlan,
  handleAction,
  setActionMenu,
  setSelectedWallet,
  setManageWalletsOpen,
  setInvoiceModal,
  setSelectedCaixinha,
  setSelectedGoal,
  setHealthModal,
  computeCardUsage,
  computeInvoiceCycleForPurchase,
  comparePlanningQuotes,
  computeCapitalPace,
  data,
  Empty,
  profileContent,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState("expense"); // "expense" | "income"
  const [mobileSection, setMobileSection] = useState(null); // "wallets" | "cards" | "cuts" | "charts" | "evolution" | null
  const [selectedCutIds, setSelectedCutIds] = useState({});

  // Sync active tab from parent with sub-views
  const effectiveView = mobileSection || active;

  function navigateTo(tabKey, subView = null) {
    setMobileSection(subView);
    setTab(tabKey);
    setDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Pending expenses and incomes in the current selected range
  const pendingExpenseRows = useMemo(
    () =>
      (rows || []).filter(
        (t) =>
          t.direction === "expense" &&
          !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard") &&
          Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)) > 0
      ),
    [rows, cents]
  );

  const pendingIncomeRows = useMemo(
    () =>
      (rows || []).filter(
        (t) =>
          t.direction === "income" &&
          !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard") &&
          Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)) > 0
      ),
    [rows, cents]
  );

  const pendingExpenseTotalCents = useMemo(
    () => pendingExpenseRows.reduce((acc, t) => acc + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)), 0),
    [pendingExpenseRows, cents]
  );

  const pendingIncomeTotalCents = useMemo(
    () => pendingIncomeRows.reduce((acc, t) => acc + Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)), 0),
    [pendingIncomeRows, cents]
  );

  // Dominant bank/wallet for the Pending Card badge
  const primaryBankName = useMemo(() => {
    const targetList = pendingTab === "expense" ? pendingExpenseRows : pendingIncomeRows;
    if (targetList.length > 0) {
      const wId = targetList[0].wallet_id;
      const w = wallets.find((x) => x.id === wId);
      if (w) return w.name;
    }
    return checkingWallets[0]?.name || wallets[0]?.name || "Nubank";
  }, [pendingTab, pendingExpenseRows, pendingIncomeRows, wallets, checkingWallets]);

  // Year-end projection (31/12) with and without cuts (core Kuantoconta thesis)
  const monthsRemainingInYear = useMemo(() => {
    const curMonthNum = Number((today || "2026-11-22").slice(5, 7)) || 11;
    return Math.max(1, 12 - curMonthNum + 1);
  }, [today]);

  const potentialMonthlyCutCents = habits?.tesouraco?.potentialMonthlySavingsCents || 0;
  const potentialYearEndGainFromCutsCents = potentialMonthlyCutCents * monthsRemainingInYear;

  // Interactive cuts simulator on the Cortes & Fim do Ano view
  const recurringCutCandidates = habits?.recurringItems || [];
  const leakCutCandidates = habits?.topLeaks || [];

  const interactiveMonthlyCutCents = useMemo(() => {
    const activeKeys = Object.keys(selectedCutIds).filter((k) => selectedCutIds[k]);
    if (activeKeys.length === 0) return potentialMonthlyCutCents;
    let sum = 0;
    for (const r of recurringCutCandidates) {
      if (selectedCutIds[`rec:${r.id}`]) sum += cents(r.monthlyCents);
    }
    for (const l of leakCutCandidates) {
      if (selectedCutIds[`leak:${l.category}`]) sum += Math.round(cents(l.amountCents) * 0.25);
    }
    return sum;
  }, [selectedCutIds, potentialMonthlyCutCents, recurringCutCandidates, leakCutCandidates, cents]);

  const yearEndBaseCents = useMemo(() => {
    const decMonth = (months || []).find((m) => m.month.endsWith("-12")) || (months || [])[months.length - 1];
    if (decMonth && decMonth.balance !== null && decMonth.balance !== undefined) {
      return cents(decMonth.balance);
    }
    return cents(projectedBalanceCents) + cents(capitalBalanceCents);
  }, [months, projectedBalanceCents, capitalBalanceCents, cents]);

  const yearEndWithCutsCents = yearEndBaseCents + interactiveMonthlyCutCents * monthsRemainingInYear;

  // Savings / Cut Percentage for the Semicircle Gauge
  const totalIncomeConsideredCents = cents(summary?.receivable?.total);
  const totalExpenseConsideredCents = cents(summary?.payable?.total);
  const netMonthSavingsCents = Math.max(0, totalIncomeConsideredCents - totalExpenseConsideredCents);
  const monthSavingsPct =
    totalIncomeConsideredCents > 0
      ? Math.max(0, Math.round((netMonthSavingsCents / totalIncomeConsideredCents) * 100))
      : habits?.totalExpenseCents > 0 && potentialMonthlyCutCents > 0
        ? Math.round((potentialMonthlyCutCents / habits.totalExpenseCents) * 100)
        : 0;

  // Cashflow bar chart proportions (Entradas, Saídas, Balanço/Sobra)
  const cashflowMaxCents = Math.max(
    10000,
    totalIncomeConsideredCents,
    totalExpenseConsideredCents,
    Math.abs(totalIncomeConsideredCents - totalExpenseConsideredCents)
  );

  // Health state badge for the Lateral Drawer
  const healthBadgeInfo = useMemo(() => {
    const st = healthPlan?.diagnosis?.state || "unknown";
    const map = {
      red: { label: "Contas em risco", cls: "late" },
      orange: { label: "Reorganizando até 31/12", cls: "review" },
      blue: { label: "Em equilíbrio", cls: "pending" },
      green: { label: "Caixa protegido", cls: "done" },
      unknown: { label: "Meta 31/12 ativa", cls: "pending" },
    };
    return map[st] || map.unknown;
  }, [healthPlan]);

  // Recent / upcoming timeline items for the Overview card
  const timelineOverviewItems = useMemo(() => {
    const list = [...(rows || [])]
      .filter((t) => !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard"))
      .sort((a, b) => isoDate(b.due_on).localeCompare(isoDate(a.due_on)));
    return list.slice(0, 6);
  }, [rows, isoDate]);

  const walletNameOf = (id) => wallets.find((w) => w.id === id)?.name || "Conta";

  const VIEW_TITLES = {
    overview: null, // uses month navigator
    movements: "Transações",
    budgets: "Orçamentos",
    planning: "Objetivos e Caixinhas",
    patrimony: "Meu Capital",
    health: "Saúde e Dívidas",
    profile: "Meu Perfil",
    wallets: "Contas",
    cards: "Cartões de crédito",
    cuts: "Cortes & Fim do Ano",
    charts: "Gráficos",
    evolution: "Projeção até 31/12",
  };

  return (
    <div className="kc-mob-shell">
      {/* TOP APP BAR (1 Linha Limpa, estilo Minhas Finanças) */}
      <header className={`kc-mob-topbar${effectiveView === "overview" ? " kc-mob-topbar--hero" : ""}`}>
        <div className="kc-mob-topbar-row">
          <button
            type="button"
            className="kc-mob-icon-btn"
            aria-label="Abrir menu lateral"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={23} />
          </button>

          <div className="kc-mob-month-switcher" aria-label="Navegador de período">
            <button
              type="button"
              className="kc-mob-month-arrow"
              aria-label="Mês anterior"
              onClick={() => selectMonth(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="kc-mob-month-label"
              onClick={() => setFilterOpen(true)}
              aria-label="Alterar período ou filtros de data"
            >
              <span>{isCustomRange ? `${fmtDate(rangeStart).slice(0, 5)}–${fmtDate(date).slice(0, 5)}` : monthNavLabel}</span>
            </button>
            <button
              type="button"
              className="kc-mob-month-arrow"
              aria-label="Próximo mês"
              onClick={() => selectMonth(1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="kc-mob-topbar-right">
            <button
              type="button"
              className="kc-mob-icon-btn"
              aria-label={`Notificações (${notifications.length})`}
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell size={20} />
              {notifications.length > 0 && <span className="kc-mob-notif-dot">{notifications.length}</span>}
            </button>
            <button
              type="button"
              className="kc-mob-icon-btn"
              aria-label="Opções e filtros da tela"
              onClick={() => setFilterOpen(true)}
            >
              <MoreHorizontal size={22} />
            </button>
          </div>
        </div>

        {VIEW_TITLES[effectiveView] && (
          <div className="kc-mob-subbar">
            <h1>{VIEW_TITLES[effectiveView]}</h1>
          </div>
        )}
      </header>

      {/* HERO CARD ENCAIXADO NO HEADER (Apenas na Visão Geral / Resumo) */}
      {effectiveView === "overview" && (
        <div className="kc-mob-hero-bleed">
          <section className="kc-mob-hero-card" aria-label="Posição financeira e projeção até o fim do ano">
            <div className="kc-mob-hero-track" aria-hidden="true">
              <span className="kc-mob-track-node is-done">
                <CheckCircle2 size={16} />
              </span>
              <span className="kc-mob-track-line is-solid" />
              <span className="kc-mob-track-node is-current">
                <Clock3 size={16} />
              </span>
              <span className="kc-mob-track-line is-dotted" />
              <span className="kc-mob-track-node is-future">
                <Scissors size={14} />
              </span>
            </div>
            <div className="kc-mob-hero-cols">
              <button
                type="button"
                className="kc-mob-hero-col"
                onClick={() => navigateTo("overview", "wallets")}
              >
                <strong>{summary.knownCash ? money(checkingBalanceCents) : "R$ 0,00"}</strong>
                <span>Saldo hoje</span>
              </button>
              <button
                type="button"
                className="kc-mob-hero-col is-main"
                onClick={() => navigateTo("movements", null)}
              >
                <strong className={projectedBalanceCents < 0 ? "is-neg" : ""}>
                  {display(projectedBalanceCents)}
                </strong>
                <span>Previsto mês</span>
              </button>
              <button
                type="button"
                className="kc-mob-hero-col"
                onClick={() => navigateTo("health", "cuts")}
              >
                <strong className={yearEndWithCutsCents > yearEndBaseCents ? "is-pos" : ""}>
                  {money(yearEndWithCutsCents)}
                </strong>
                <span>31/12 c/ cortes</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL MOBILE */}
      <main className="kc-mob-main">
        {/* ================= VISTA 1: RESUMO (OVERVIEW) ================= */}
        {effectiveView === "overview" && (
          <div className="kc-mob-stack">
            {/* Card 1: Despesas | Receitas Pendentes (Igual à Imagem 5) */}
            <section className="kc-mob-card kc-mob-pending-card" aria-label="Compromissos pendentes do período">
              <div className="kc-mob-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pendingTab === "expense"}
                  className={`kc-mob-tab is-expense${pendingTab === "expense" ? " active" : ""}`}
                  onClick={() => setPendingTab("expense")}
                >
                  Despesas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pendingTab === "income"}
                  className={`kc-mob-tab is-income${pendingTab === "income" ? " active" : ""}`}
                  onClick={() => setPendingTab("income")}
                >
                  Receitas
                </button>
              </div>

              <div className="kc-mob-pending-body">
                <div className="kc-mob-pending-logo">
                  <BankIcon name={primaryBankName} size={44} />
                </div>

                {pendingTab === "expense" ? (
                  <>
                    <p className="kc-mob-pending-text">
                      Você tem{" "}
                      <strong className="is-expense-text">
                        {pendingExpenseRows.length}{" "}
                        {pendingExpenseRows.length === 1 ? "despesa pendente" : "despesas pendentes"}
                      </strong>
                      <br />
                      no total de
                    </p>
                    <strong className="kc-mob-pending-amount">{money(pendingExpenseTotalCents)}</strong>
                    <button
                      type="button"
                      className="kc-mob-pending-cta is-expense"
                      onClick={() => {
                        setFilter("expense");
                        setScreenFilter("movements", { direction: "expense", status: "pending" });
                        navigateTo("movements", null);
                      }}
                    >
                      <ReceiptText size={16} />
                      <span>Ver despesas pendentes</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="kc-mob-pending-text">
                      Você tem{" "}
                      <strong className="is-income-text">
                        {pendingIncomeRows.length}{" "}
                        {pendingIncomeRows.length === 1 ? "receita pendente" : "receitas pendentes"}
                      </strong>
                      <br />
                      no total de
                    </p>
                    <strong className="kc-mob-pending-amount">{money(pendingIncomeTotalCents)}</strong>
                    <button
                      type="button"
                      className="kc-mob-pending-cta is-income"
                      onClick={() => {
                        setFilter("income");
                        setScreenFilter("movements", { direction: "income", status: "pending" });
                        navigateTo("movements", null);
                      }}
                    >
                      <ReceiptText size={16} />
                      <span>Ver receitas pendentes</span>
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* Seção 2: Visão Geral 2x2 (Contas, Endividamento, Receitas, Despesas) */}
            <section className="kc-mob-section" aria-label="Visão geral">
              <div className="kc-mob-section-head">
                <h2>Visão geral</h2>
                <button
                  type="button"
                  className="kc-mob-dots-btn"
                  aria-label="Configurar visão geral e composição do endividamento"
                  onClick={() => setFilterOpen(true)}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>

              <div className="kc-mob-overview-grid">
                {/* 1. Contas */}
                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => navigateTo("overview", "wallets")}
                >
                  <span className="kc-mob-ov-icon is-blue">
                    <Landmark size={19} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">
                      {summary.knownCash ? money(checkingBalanceCents) : "R$ 0,00"}
                    </strong>
                    <span className="kc-mob-ov-label">Contas</span>
                    <div className="kc-mob-ov-sub">
                      <span>Previsto</span>
                      <strong>{display(projectedBalanceCents)}</strong>
                    </div>
                  </div>
                </button>

                {/* 2. Endividamento (No lugar de Balanço, conforme diretriz do produto) */}
                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => navigateTo("health", null)}
                >
                  <span className="kc-mob-ov-icon is-amber">
                    <ArrowUpDown size={19} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">{debtDisplay}</strong>
                    <span className="kc-mob-ov-label">Endividamento</span>
                    <div className="kc-mob-ov-sub">
                      <span>A vencer mês</span>
                      <strong>{money(pendingExpenseTotalCents)}</strong>
                    </div>
                  </div>
                </button>

                {/* 3. Receitas */}
                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => {
                    setFilter("income");
                    navigateTo("movements", null);
                  }}
                >
                  <span className="kc-mob-ov-icon is-green">
                    <Plus size={20} strokeWidth={2.5} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">{money(summary.receivable.settled)}</strong>
                    <span className="kc-mob-ov-label">Receitas</span>
                    <div className="kc-mob-ov-sub">
                      <span>Previsto</span>
                      <strong>{money(summary.receivable.total)}</strong>
                    </div>
                  </div>
                </button>

                {/* 4. Despesas */}
                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => {
                    setFilter("expense");
                    navigateTo("movements", null);
                  }}
                >
                  <span className="kc-mob-ov-icon is-red">
                    <Minus size={20} strokeWidth={2.5} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">{money(summary.payable.settled)}</strong>
                    <span className="kc-mob-ov-label">Despesas</span>
                    <div className="kc-mob-ov-sub">
                      <span>Previsto</span>
                      <strong>{money(summary.payable.total)}</strong>
                    </div>
                  </div>
                </button>
              </div>
            </section>

            {/* Card 3: Economia Mensal & Potencial até 31/12 com Cortes (Imagem 3 adaptada à Tese) */}
            <section className="kc-mob-card" aria-label="Economia mensal e potencial de cortes até o fim do ano">
              <div className="kc-mob-card-head">
                <h2>Economia e cortes até 31/12</h2>
                <button
                  type="button"
                  className="kc-mob-dots-btn"
                  aria-label="Simular cortes no Tesouraço"
                  onClick={() => navigateTo("health", "cuts")}
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>

              <div className="kc-mob-economy-grid">
                <div className="kc-mob-economy-left">
                  <SemicircleSavingsGauge pct={monthSavingsPct} />
                  <div className="kc-mob-economy-saved">
                    <strong>{money(potentialYearEndGainFromCutsCents > 0 ? potentialYearEndGainFromCutsCents : netMonthSavingsCents)}</strong>
                    <span>{potentialYearEndGainFromCutsCents > 0 ? "Potencial c/ cortes (31/12)" : "Valor economizado"}</span>
                  </div>
                </div>

                <div className="kc-mob-economy-right">
                  <button
                    type="button"
                    className="kc-mob-economy-metric"
                    onClick={() => {
                      setFilter("income");
                      navigateTo("movements", null);
                    }}
                  >
                    <span className="kc-mob-econ-circle is-green">
                      <ArrowDown size={16} />
                    </span>
                    <div>
                      <span>Receitas consideradas</span>
                      <strong className="is-green">{money(totalIncomeConsideredCents)} ›</strong>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="kc-mob-economy-metric"
                    onClick={() => {
                      setFilter("expense");
                      navigateTo("movements", null);
                    }}
                  >
                    <span className="kc-mob-econ-circle is-red">
                      <ArrowUp size={16} />
                    </span>
                    <div>
                      <span>Despesas consideradas</span>
                      <strong className="is-red">{money(totalExpenseConsideredCents)} ›</strong>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="kc-mob-economy-metric"
                    onClick={() => navigateTo("health", "cuts")}
                  >
                    <span className="kc-mob-econ-circle is-amber">
                      <Scissors size={15} />
                    </span>
                    <div>
                      <span>Se cortar excessos</span>
                      <strong className="is-amber">+{money(potentialMonthlyCutCents)}/mês ›</strong>
                    </div>
                  </button>
                </div>
              </div>
            </section>

            {/* Card 4: Contas (Igual à Imagem 4) */}
            <section className="kc-mob-card" aria-label="Suas contas bancárias">
              <div className="kc-mob-card-head">
                <h2>Contas</h2>
                <div className="kc-mob-card-actions">
                  <button
                    type="button"
                    className="kc-mob-dots-btn"
                    aria-label="Ver todas as contas"
                    onClick={() => navigateTo("overview", "wallets")}
                  >
                    <ExternalLink size={18} />
                  </button>
                  <button
                    type="button"
                    className="kc-mob-dots-btn"
                    aria-label="Gerenciar contas"
                    onClick={() => setManageWalletsOpen(true)}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </div>

              {checkingWallets.length > 0 ? (
                <>
                  <div className="kc-mob-accounts-list">
                    {checkingWallets.map((w) => {
                      const bal = walletBalance(w) ?? 0;
                      const caixSum = bankCaixinhasTotal(w.id);
                      return (
                        <div key={w.id} className="kc-mob-account-row">
                          <button
                            type="button"
                            className="kc-mob-account-main"
                            onClick={() => setSelectedWallet(w)}
                          >
                            <BankIcon name={w.name} size={40} />
                            <div className="kc-mob-account-meta">
                              <strong>{w.name}</strong>
                              <span>
                                {caixSum > 0 ? `+ ${money(caixSum)} em caixinhas` : "Saldo disponível"}
                              </span>
                            </div>
                            <div className="kc-mob-account-vals">
                              <strong className={bal < 0 ? "is-neg" : ""}>{money(bal)}</strong>
                              <span>{money(bal + caixSum)}</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="kc-mob-dots-btn"
                            aria-label={`Opções da conta ${w.name}`}
                            onClick={() => setSelectedWallet(w)}
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="kc-mob-accounts-total">
                    <div>
                      <strong>Total</strong>
                      <span>Saldo + caixinhas</span>
                    </div>
                    <div className="kc-mob-accounts-total-val">
                      <strong>{money(checkingBalanceCents + capitalBalanceCents)}</strong>
                      <span>Livre: {money(checkingBalanceCents)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <Empty>Nenhuma conta cadastrada. Toque no + para adicionar sua conta.</Empty>
              )}
            </section>

            {/* Card 5: Fluxo de Caixa (Igual à Imagem 4 — 3 colunas verticais: Entradas, Saídas, Balanço/Sobra) */}
            <section className="kc-mob-card" aria-label="Fluxo de caixa do período">
              <div className="kc-mob-card-head">
                <h2>Fluxo de caixa</h2>
                <button
                  type="button"
                  className="kc-mob-dots-btn"
                  aria-label="Ver evolução mês a mês"
                  onClick={() => navigateTo("budgets", "evolution")}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>

              <div className="kc-mob-cashflow-chart">
                <div className="kc-mob-cashflow-yaxis" aria-hidden="true">
                  <span>{money(cashflowMaxCents)}</span>
                  <span>{money(Math.round(cashflowMaxCents * 0.5))}</span>
                  <span>R$ 0</span>
                </div>

                <div className="kc-mob-cashflow-bars">
                  {/* Coluna 1: Entradas */}
                  <div className="kc-mob-cf-col">
                    <div className="kc-mob-cf-track">
                      <div
                        className="kc-mob-cf-bar is-income"
                        style={{
                          height: `${Math.max(10, Math.min(100, Math.round((totalIncomeConsideredCents / cashflowMaxCents) * 100)))}%`,
                        }}
                      >
                        <span className="kc-mob-cf-diamond is-income" aria-hidden="true" />
                        <span className="kc-mob-cf-inside">
                          {pendingIncomeTotalCents > 0 ? "Pendentes" : "Realizado"}
                        </span>
                      </div>
                    </div>
                    <strong className="kc-mob-cf-label">Entradas</strong>
                    <small className="kc-mob-cf-sub">{money(totalIncomeConsideredCents)}</small>
                  </div>

                  {/* Coluna 2: Saídas */}
                  <div className="kc-mob-cf-col">
                    <div className="kc-mob-cf-track">
                      <div
                        className="kc-mob-cf-bar is-expense"
                        style={{
                          height: `${Math.max(10, Math.min(100, Math.round((totalExpenseConsideredCents / cashflowMaxCents) * 100)))}%`,
                        }}
                      >
                        <span className="kc-mob-cf-diamond is-expense" aria-hidden="true" />
                        <span className="kc-mob-cf-inside">
                          {pendingExpenseTotalCents > 0 ? "Pendentes" : "Realizado"}
                        </span>
                      </div>
                    </div>
                    <strong className="kc-mob-cf-label">Saídas</strong>
                    <small className="kc-mob-cf-sub">{money(totalExpenseConsideredCents)}</small>
                  </div>

                  {/* Coluna 3: Sobra / Variação */}
                  <div className="kc-mob-cf-col">
                    <div className="kc-mob-cf-track">
                      <div
                        className="kc-mob-cf-bar is-balance"
                        style={{
                          height: `${Math.max(10, Math.min(100, Math.round((Math.abs(totalIncomeConsideredCents - totalExpenseConsideredCents) / cashflowMaxCents) * 100)))}%`,
                        }}
                      >
                        <span className="kc-mob-cf-diamond is-balance" aria-hidden="true" />
                        <span className="kc-mob-cf-inside">Variação</span>
                      </div>
                    </div>
                    <strong className="kc-mob-cf-label">Sobra</strong>
                    <small className="kc-mob-cf-sub">
                      {money(totalIncomeConsideredCents - totalExpenseConsideredCents)}
                    </small>
                  </div>
                </div>
              </div>

              <div className="kc-mob-cashflow-legend">
                <span><i className="kc-mob-leg-line" /> Consolidado</span>
                <span><i className="kc-mob-leg-diamond" /> Previsto</span>
              </div>
            </section>

            {/* Card 6: Últimas Despesas / Lançamentos em Timeline Vertical (Igual à Imagem 3) */}
            <section className="kc-mob-card" aria-label="Últimos lançamentos">
              <div className="kc-mob-card-head">
                <h2>Últimos lançamentos</h2>
                <div className="kc-mob-card-actions">
                  <button
                    type="button"
                    className="kc-mob-dots-btn"
                    aria-label="Ver todos os lançamentos"
                    onClick={() => navigateTo("movements", null)}
                  >
                    <ExternalLink size={18} />
                  </button>
                  <button
                    type="button"
                    className="kc-mob-dots-btn"
                    aria-label="Filtrar lançamentos"
                    onClick={() => navigateTo("movements", null)}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </div>

              {timelineOverviewItems.length > 0 ? (
                <div className="kc-mob-timeline">
                  {timelineOverviewItems.map((t) => {
                    const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
                    const isLate = rem > 0 && isoDate(t.due_on) < today;
                    const isDone = rem === 0;
                    const dotStatus = isDone ? "is-done" : isLate ? "is-late" : "is-pending";
                    const vis = getCategoryVisual(t.category, t.direction);
                    const perInstallment =
                      t.installment_total > 1 ? `${t.installment_total} x ${money(cents(t.amount_cents))}` : t.category;

                    return (
                      <button
                        type="button"
                        key={t.id}
                        className="kc-mob-tl-row"
                        onClick={() => open("detail", t.id)}
                      >
                        <span className={`kc-mob-tl-dot ${dotStatus}`} aria-hidden="true" />
                        <span
                          className="kc-mob-tl-avatar"
                          style={{ background: vis.bg, color: vis.fg }}
                          aria-hidden="true"
                        >
                          {t.direction === "income" ? <Plus size={18} /> : <ReceiptText size={17} />}
                        </span>
                        <div className="kc-mob-tl-main">
                          <strong>{t.description}</strong>
                          <span>
                            {walletNameOf(t.wallet_id)} • {perInstallment}
                          </span>
                        </div>
                        <div className="kc-mob-tl-right">
                          <strong className={t.direction === "income" ? "is-income" : ""}>
                            {money(cents(t.amount_cents))}
                          </strong>
                          <span>{fmtDate(t.due_on).slice(0, 5)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhum lançamento registrado neste período.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 2: CORTES & FIM DO ANO (TESE CENTRAL KUANTOCONTA) ================= */}
        {effectiveView === "cuts" && (
          <div className="kc-mob-stack">
            <section className="kc-mob-card kc-mob-cuts-hero">
              <span className="eyebrow">SIMULADOR DE FIM DE ANO (31/12)</span>
              <div className="kc-mob-cuts-compare">
                <div className="kc-mob-cuts-box">
                  <span>Quanto você deve</span>
                  <strong className="is-red">{debtDisplay}</strong>
                  <small>Compromissos + dívidas</small>
                </div>
                <div className="kc-mob-cuts-box is-highlight">
                  <span>Em 31/12 com cortes</span>
                  <strong className="is-green">{money(yearEndWithCutsCents)}</strong>
                  <small>+{money(interactiveMonthlyCutCents * monthsRemainingInYear)} acumulados</small>
                </div>
              </div>
              <p className="kc-mob-cuts-summary">
                Mantendo os gastos atuais, sua projeção para 31/12 é de <strong>{money(yearEndBaseCents)}</strong>.
                Se aplicar os cortes abaixo nos próximos <strong>{monthsRemainingInYear} meses</strong>, você libera{" "}
                <strong>+{money(interactiveMonthlyCutCents)}/mês</strong>.
              </p>
            </section>

            {/* Cortes de Assinaturas e Recorrências (Tesouraço) */}
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <div>
                  <h2>1. Tesouraço em recorrências</h2>
                  <p className="hint" style={{ margin: "2px 0 0" }}>
                    Toque nos itens para simular o impacto de cortá-los até 31/12
                  </p>
                </div>
              </div>
              {recurringCutCandidates.length > 0 ? (
                <div className="kc-mob-cuts-list">
                  {recurringCutCandidates.map((r) => {
                    const key = `rec:${r.id}`;
                    const checked = Boolean(selectedCutIds[key]);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        className={`kc-mob-cut-item${checked ? " is-selected" : ""}`}
                        onClick={() => setSelectedCutIds((old) => ({ ...old, [key]: !old[key] }))}
                      >
                        <span className={`kc-mob-cut-check${checked ? " checked" : ""}`}>
                          {checked && <Check size={14} strokeWidth={3} />}
                        </span>
                        <div className="kc-mob-cut-info">
                          <strong>{r.description}</strong>
                          <span>{r.category} • Fixa mensal</span>
                        </div>
                        <div className="kc-mob-cut-vals">
                          <strong>+{money(r.monthlyCents)}/mês</strong>
                          <span>+{money(r.monthlyCents * monthsRemainingInYear)} até 31/12</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhuma assinatura ou despesa fixa supérflua detectada.</Empty>
              )}
            </section>

            {/* Onde o Dinheiro Escoa (Dedo Duro - Redução de 25%) */}
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <div>
                  <h2>2. Reduzir 25% onde mais escoa</h2>
                  <p className="hint" style={{ margin: "2px 0 0" }}>
                    Categorias que mais consomem seu orçamento neste mês
                  </p>
                </div>
              </div>
              {leakCutCandidates.length > 0 ? (
                <div className="kc-mob-cuts-list">
                  {leakCutCandidates.map((l) => {
                    const key = `leak:${l.category}`;
                    const checked = Boolean(selectedCutIds[key]);
                    const trimMonth = Math.round(cents(l.amountCents) * 0.25);
                    return (
                      <button
                        type="button"
                        key={l.category}
                        className={`kc-mob-cut-item${checked ? " is-selected" : ""}`}
                        onClick={() => setSelectedCutIds((old) => ({ ...old, [key]: !old[key] }))}
                      >
                        <span className={`kc-mob-cut-check${checked ? " checked" : ""}`}>
                          {checked && <Check size={14} strokeWidth={3} />}
                        </span>
                        <div className="kc-mob-cut-info">
                          <strong>{l.category} ({l.sharePct}%)</strong>
                          <span>Gasto atual: {money(l.amountCents)}/mês</span>
                        </div>
                        <div className="kc-mob-cut-vals">
                          <strong>+{money(trimMonth)}/mês</strong>
                          <span>+{money(trimMonth * monthsRemainingInYear)} até 31/12</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Lance suas despesas para descobrir onde o dinheiro escoa.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 3: CONTAS BANCÁRIAS (WALLETS) ================= */}
        {effectiveView === "wallets" && (
          <div className="kc-mob-stack">
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Suas contas</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => open("wallet")}
                >
                  Nova conta
                </button>
              </div>
              {checkingWallets.length > 0 ? (
                <div className="kc-mob-accounts-list">
                  {checkingWallets.map((w) => {
                    const bal = walletBalance(w) ?? 0;
                    const caixSum = bankCaixinhasTotal(w.id);
                    return (
                      <div key={w.id} className="kc-mob-account-row">
                        <button
                          type="button"
                          className="kc-mob-account-main"
                          onClick={() => setSelectedWallet(w)}
                        >
                          <BankIcon name={w.name} size={42} />
                          <div className="kc-mob-account-meta">
                            <strong>{w.name}</strong>
                            <span>
                              {caixSum > 0 ? `Caixinhas: ${money(caixSum)}` : "Conta de uso diário"}
                            </span>
                          </div>
                          <div className="kc-mob-account-vals">
                            <strong className={bal < 0 ? "is-neg" : ""}>{money(bal)}</strong>
                            <span>Total: {money(bal + caixSum)}</span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhuma conta cadastrada.</Empty>
              )}

              <div className="kc-mob-accounts-total" style={{ marginTop: 14 }}>
                <div>
                  <strong>Saldo consolidado</strong>
                  <span>Uso diário + caixinhas</span>
                </div>
                <div className="kc-mob-accounts-total-val">
                  <strong>{money(checkingBalanceCents + capitalBalanceCents)}</strong>
                  <span>Caixinhas: {money(capitalBalanceCents)}</span>
                </div>
              </div>

              <button
                type="button"
                className="light-button"
                style={{ width: "100%", marginTop: 12 }}
                onClick={() => setManageWalletsOpen(true)}
              >
                Arquivar ou gerenciar contas
              </button>
            </section>
          </div>
        )}

        {/* ================= VISTA 4: CARTÕES DE CRÉDITO (CARDS) ================= */}
        {effectiveView === "cards" && (
          <div className="kc-mob-stack">
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Cartões de crédito</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => open("credit_card")}
                >
                  Novo cartão
                </button>
              </div>
              {creditCards.length > 0 ? (
                <div className="kc-mob-stack" style={{ gap: 12 }}>
                  {creditCards.map((c) => {
                    const usage = computeCardUsage(c, expandedTitles || []);
                    const cyc = computeInvoiceCycleForPurchase({
                      purchaseDate: today,
                      closingDay: c.closing_day,
                      dueDay: c.due_day,
                    });
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className="budget-card clickable-card"
                        style={{ width: "100%" }}
                        onClick={() => setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth })}
                      >
                        <div className="budget-row-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <BankIcon name={c.name} size={38} />
                            <div>
                              <strong>{c.name}</strong>
                              <div className="hint">Fecha dia {c.closing_day} · Vence dia {c.due_day}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <strong style={{ color: "var(--kc-ink)" }}>{money(usage.usedLimitCents)}</strong>
                            <div className="hint">Livre: {money(usage.availableLimitCents)}</div>
                          </div>
                        </div>
                        <div className="budget-bar" role="progressbar" aria-valuenow={usage.utilizationPct} aria-valuemin={0} aria-valuemax={100}>
                          <div
                            className={`budget-fill${usage.utilizationPct >= 90 ? " over" : usage.utilizationPct >= 75 ? " warn" : ""}`}
                            style={{ width: `${usage.utilizationPct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhum cartão de crédito cadastrado.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 5: TRANSAÇÕES (MOVEMENTS) ================= */}
        {effectiveView === "movements" && (
          <div className="kc-mob-stack">
            <div className="kc-mob-ov-strip">
              <div className="kc-mob-strip-pill">
                <span>A receber</span>
                <strong className="is-green">{money(summary.receivable.total)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>A pagar</span>
                <strong className="is-red">{money(summary.payable.total)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Resultado</span>
                <strong className={summary.periodResult < 0 ? "is-red" : ""}>{money(summary.periodResult)}</strong>
              </div>
            </div>

            <section className="kc-mob-card">
              <div className="kc-mob-filter-bar">
                <div className="filter-pills">
                  {[
                    ["all", "Todos"],
                    ["expense", "Despesas"],
                    ["income", "Receitas"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      className={filter === k ? "active" : ""}
                      onClick={() => setFilter(k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <label className="kc-mob-search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar descrição ou categoria..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>

              {rows.length > 0 ? (
                <div className="kc-mob-timeline">
                  {rows.map((t) => {
                    const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
                    const isLate = rem > 0 && isoDate(t.due_on) < today;
                    const isDone = rem === 0;
                    const dotStatus = isDone ? "is-done" : isLate ? "is-late" : "is-pending";
                    const vis = getCategoryVisual(t.category, t.direction);
                    const subInfo =
                      t.installment_total > 1
                        ? `${walletNameOf(t.wallet_id)} • ${t.installment_index}/${t.installment_total} x ${money(cents(t.amount_cents))}`
                        : `${walletNameOf(t.wallet_id)} • ${t.category}`;

                    return (
                      <div key={t.id} className="kc-mob-tl-row-wrap">
                        <button
                          type="button"
                          className="kc-mob-tl-row"
                          onClick={() => open("detail", t.id)}
                        >
                          <span className={`kc-mob-tl-dot ${dotStatus}`} aria-hidden="true" />
                          <span
                            className="kc-mob-tl-avatar"
                            style={{ background: vis.bg, color: vis.fg }}
                            aria-hidden="true"
                          >
                            {t.entry_kind === "transfer" ? (
                              <ArrowLeftRight size={17} />
                            ) : t.direction === "income" ? (
                              <Plus size={18} />
                            ) : (
                              <ReceiptText size={17} />
                            )}
                          </span>
                          <div className="kc-mob-tl-main">
                            <strong>{t.description}</strong>
                            <span>{subInfo}</span>
                          </div>
                          <div className="kc-mob-tl-right">
                            <strong className={t.direction === "income" ? "is-income" : ""}>
                              {money(cents(t.amount_cents))}
                            </strong>
                            <span>{fmtDate(t.due_on).slice(0, 5)} · {isDone ? "Pago" : isLate ? "Vencido" : "Pendente"}</span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhum lançamento encontrado neste período.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 6: ORÇAMENTOS (BUDGETS) ================= */}
        {effectiveView === "budgets" && (
          <div className="kc-mob-stack">
            <div className="kc-mob-ov-strip">
              <div className="kc-mob-strip-pill">
                <span>Renda {monthOnly}</span>
                <strong>{money(monthlyIncomeCents)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Orçado</span>
                <strong>{money(allocatedBudgetCents)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Livre</span>
                <strong className="is-green">{money(remainingAllocableCents)}</strong>
              </div>
            </div>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Limites de {monthOnly}</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => setActionMenu("budget_pick")}
                >
                  Definir limite
                </button>
              </div>
              <BudgetList
                items={budgetItems}
                monthLabel={monthLong}
                insufficientCash={summary.minCash !== null && summary.minCash < 0}
                onEditBudget={openBudget}
                onFulfillPlan={fulfillPlan}
                onEditPlan={editPlan}
                onCancelPlan={cancelPlan}
              />
            </section>
          </div>
        )}

        {/* ================= VISTA 7: OBJETIVOS & CAIXINHAS (PLANNING) ================= */}
        {effectiveView === "planning" && (
          <div className="kc-mob-stack">
            <div className="kc-mob-ov-strip">
              <div className="kc-mob-strip-pill">
                <span>Em Caixinhas</span>
                <strong>{summary.knownCash ? money(capitalBalanceCents) : "R$ 0,00"}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Guardado mês</span>
                <strong className="is-green">{money(reservedThisMonthCents)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Aporte seguro</span>
                <strong>{money(safeContribution?.safeContributionCents || 0)}</strong>
              </div>
            </div>

            <div className="kc-mob-quick-actions-row">
              <button type="button" className="kc-mob-qbtn" onClick={() => openReserveCaixinha()}>
                <PiggyBank size={18} />
                <span>Guardar</span>
              </button>
              <button type="button" className="kc-mob-qbtn" onClick={() => open("capital_goal")}>
                <Plus size={18} />
                <span>Nova caixinha</span>
              </button>
              <button type="button" className="kc-mob-qbtn is-accent" onClick={() => open("goal_sim")}>
                <Compass size={18} />
                <span>Planejar compra</span>
              </button>
            </div>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Caixinhas ({capitalGoals.length})</h2>
              </div>
              {capitalGoals.length > 0 ? (
                <div className="budget-list">
                  {capitalGoals.map((g) => {
                    const saved = caixinhaBalance(g);
                    const bankWallet =
                      checkingWallets.find((w) => w.id === g.parent_wallet_id) ||
                      wallets.find((w) => w.id === g.parent_wallet_id);
                    const pace = computeCapitalPace({
                      targetCents: cents(g.target_cents),
                      targetDate: isoDate(g.desired_on) || today.slice(0, 4) + "-12-31",
                      currentCapitalCents: saved,
                      monthlyContributionCents: capitalBudget?.limitCents || 0,
                      today,
                    });
                    return (
                      <button
                        type="button"
                        key={g.id}
                        className="budget-card clickable-card"
                        style={{ width: "100%" }}
                        onClick={() =>
                          setSelectedCaixinha({
                            raw: g,
                            pace,
                            saved,
                            bankName: bankWallet?.name || "Sem banco",
                          })
                        }
                      >
                        <div className="budget-row-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <BankIcon name={bankWallet?.name || g.title} size={34} />
                            <div>
                              <strong>{g.title}</strong>
                              <div className="hint">{bankWallet ? bankWallet.name : "Sem banco"}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <strong>{money(saved)}</strong>
                            <div className="hint">Meta: {money(pace.targetCents)}</div>
                          </div>
                        </div>
                        <div className="budget-bar">
                          <div className="budget-fill" style={{ width: `${pace.progressPct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Crie uma Caixinha para separar sua reserva ou objetivo.</Empty>
              )}
            </section>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Planejamentos ({purchaseGoals.length})</h2>
              </div>
              {purchaseGoals.length > 0 ? (
                <div className="kc-mob-stack" style={{ gap: 10 }}>
                  {purchaseGoals.map((g, idx) => {
                    const comparison = comparePlanningQuotes(data || {}, g, { today });
                    const chosenQ = comparison.quotes.find((q) => q.isChosen) || comparison.winner;
                    const sim = chosenQ?.sim || comparison.winner?.sim;
                    const pType = g.plan_type || "purchase";
                    const TypeIcon = pType === "trip" ? Plane : pType === "shopping_list" ? ListChecks : Compass;
                    return (
                      <button
                        type="button"
                        key={g.id || idx}
                        className="goal-bento-card"
                        onClick={() => setSelectedGoal({ raw: g, sim, comparison })}
                      >
                        <div className="goal-bento-top">
                          <span className="goal-bento-icon">
                            <TypeIcon size={18} />
                          </span>
                          <span className={`status ${sim?.isFeasible ? "done" : sim?.firstFeasibleDate ? "partial" : "late"}`}>
                            {sim?.isFeasible
                              ? "Viável na data"
                              : sim?.firstFeasibleDate
                                ? `A partir de ${fmtDate(sim.firstFeasibleDate)}`
                                : "Ainda não cabe"}
                          </span>
                        </div>
                        <strong>{g.title}</strong>
                        <div className="goal-bento-meta">
                          <span>{money(cents(g.target_cents))}</span>
                          <small>
                            {comparison.hasComparison
                              ? `${comparison.quotes.length} cotações`
                              : g.installment_count > 1
                                ? `${g.installment_count}x`
                                : "À vista"}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Simule compras, viagens ou listas antes de gastar.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 8: SAÚDE & DÍVIDAS (HEALTH) ================= */}
        {effectiveView === "health" && healthPlan && (
          <div className="kc-mob-stack">
            <div className="kc-mob-ov-strip">
              <div className="kc-mob-strip-pill">
                <span>Endividamento</span>
                <strong className="is-red">{debtDisplay}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Reserva</span>
                <strong>
                  {healthPlan.diagnosis.indicators.emergencyCoverageMonths === null
                    ? "0m"
                    : `${healthPlan.diagnosis.indicators.emergencyCoverageMonths.toFixed(1)} meses`}
                </strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Renda compr.</span>
                <strong>
                  {healthPlan.diagnosis.indicators.incomeCommitmentRatio === null
                    ? "0%"
                    : `${Math.round(healthPlan.diagnosis.indicators.incomeCommitmentRatio * 100)}%`}
                </strong>
              </div>
            </div>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Marcos de recuperação</h2>
                <button
                  type="button"
                  className="pill pill-secondary pill-compact"
                  onClick={() => setHealthModal("milestones")}
                >
                  Detalhes
                </button>
              </div>
              <div className="kc-mob-stack" style={{ gap: 10 }}>
                {[
                  ["1. Contas cobertas", healthPlan.milestones.firstCoveredMonth, "Contas essenciais cabem na renda"],
                  ["2. Início dos aportes", healthPlan.milestones.firstSavingMonth, "Sobra livre para guardar"],
                  ["3. Estabilidade", healthPlan.milestones.firstStableMonth, "Reserva formada e sobra constante"],
                ].map(([title, ym, desc]) => (
                  <div key={title} className="kc-mob-milestone-row">
                    <div>
                      <strong>{title}</strong>
                      <span>{desc}</span>
                    </div>
                    <strong className="kc-mob-milestone-ym">{ym || "A definir"}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Potencial de corte</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => navigateTo("health", "cuts")}
                >
                  Abrir simulador 31/12
                </button>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                Você pode economizar até <strong>{money(potentialMonthlyCutCents)}/mês</strong> (
                <strong>+{money(potentialYearEndGainFromCutsCents)}</strong> até o fim do ano) ajustando recorrências e
                vazamentos.
              </p>
            </section>
          </div>
        )}

        {/* ================= VISTA 9: MEU CAPITAL (PATRIMONY) ================= */}
        {effectiveView === "patrimony" && (
          <div className="kc-mob-stack">
            <div className="kc-mob-ov-strip">
              <div className="kc-mob-strip-pill">
                <span>Capital hoje</span>
                <strong>{summary.knownCash ? money(capitalBalanceCents) : "R$ 0,00"}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Patrimônio líq.</span>
                <strong>{display(netWorthAtDateCents)}</strong>
              </div>
              <div className="kc-mob-strip-pill">
                <span>Bens</span>
                <strong>{money(summary.assets)}</strong>
              </div>
            </div>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Carteira de pessoas (A receber)</h2>
                <button
                  type="button"
                  className="pill pill-outline-orange pill-compact"
                  onClick={() => open("title", null, "lend")}
                >
                  Emprestar
                </button>
              </div>
              {peopleLoans.length > 0 ? (
                <div className="budget-list">
                  {peopleLoans.map(({ person, openBalanceCents, openRepaymentTitles }) => (
                    <div className="budget-card" key={person.id}>
                      <div className="budget-row-top">
                        <div>
                          <strong>{person.name}</strong>
                          <div className="hint">{person.relationship}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong>{openBalanceCents > 0 ? money(openBalanceCents) : "Quitado"}</strong>
                          {openRepaymentTitles[0] && (
                            <button
                              type="button"
                              className="pill pill-outline-orange pill-compact"
                              onClick={() => handleAction("settle", openRepaymentTitles[0].id)}
                            >
                              Receber
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>Nenhum empréstimo para terceiros registrado.</Empty>
              )}
            </section>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Bens e imóveis</h2>
                <button
                  type="button"
                  className="pill pill-outline-orange pill-compact"
                  onClick={() => open("asset")}
                >
                  Adicionar bem
                </button>
              </div>
              <strong style={{ fontSize: 24 }}>{money(summary.assets)}</strong>
            </section>
          </div>
        )}

        {/* ================= VISTA 10: GRÁFICOS (CHARTS) ================= */}
        {effectiveView === "charts" && (
          <div className="kc-mob-stack">
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Despesas por categoria</h2>
              </div>
              {expenses.length > 0 ? (
                <FinanceChart type="donut" data={expenses} height={240} />
              ) : (
                <Empty>Sem despesas no período.</Empty>
              )}
            </section>

            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Receitas vs Despesas</h2>
              </div>
              {months.length > 0 ? (
                <FinanceChart type="bar" data={months} height={240} />
              ) : (
                <Empty>Sem movimentos no período.</Empty>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 11: EVOLUÇÃO ATÉ 31/12 ================= */}
        {effectiveView === "evolution" && (
          <div className="kc-mob-stack">
            <section className="kc-mob-card">
              <div className="kc-mob-card-head">
                <h2>Evolução mês a mês</h2>
              </div>
              <div className="kc-mob-stack" style={{ gap: 10 }}>
                {months.map((m) => (
                  <div key={m.month} className="kc-mob-evo-card">
                    <div className="kc-mob-evo-top">
                      <strong>
                        {new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </strong>
                      <strong className={m.result < 0 ? "is-red" : "is-green"}>
                        {m.result >= 0 ? "+" : ""}
                        {money(m.result)}
                      </strong>
                    </div>
                    <div className="kc-mob-evo-grid">
                      <div>
                        <span>Entradas</span>
                        <strong>{money(m.income)}</strong>
                      </div>
                      <div>
                        <span>Saídas</span>
                        <strong>{money(m.expense)}</strong>
                      </div>
                      <div>
                        <span>Saldo previsto</span>
                        <strong className={m.balance < 0 ? "is-red" : ""}>{display(m.balance)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================= VISTA 12: PERFIL ================= */}
        {effectiveView === "profile" && (
          <div className="kc-mob-stack">
            {profileContent}
          </div>
        )}
      </main>

      {/* ================= MENU LATERAL (NAVIGATION DRAWER — IMAGEM 6) ================= */}
      {drawerOpen && (
        <div
          className="kc-mob-drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <aside className="kc-mob-drawer" aria-label="Menu principal">
            <button
              type="button"
              className="kc-mob-drawer-user"
              onClick={() => navigateTo("profile", null)}
            >
              <div className="kc-mob-drawer-avatar">
                {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="kc-mob-drawer-user-info">
                <strong>{user?.name || "Titular"}</strong>
                <span>{user?.email || ""}</span>
                <span className={`kc-mob-drawer-badge ${healthBadgeInfo.cls}`}>
                  <Award size={12} /> {healthBadgeInfo.label}
                </span>
              </div>
              <ChevronRight size={18} className="kc-mob-drawer-chevron" />
            </button>

            <nav className="kc-mob-drawer-nav">
              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "overview" ? " active" : ""}`}
                onClick={() => navigateTo("overview", null)}
              >
                <Compass size={20} />
                <span>Resumo</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "wallets" ? " active" : ""}`}
                onClick={() => navigateTo("overview", "wallets")}
              >
                <Landmark size={20} />
                <span>Contas</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "movements" ? " active" : ""}`}
                onClick={() => navigateTo("movements", null)}
              >
                <ReceiptText size={20} />
                <span>Transações</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "cards" ? " active" : ""}`}
                onClick={() => navigateTo("overview", "cards")}
              >
                <CreditCard size={20} />
                <span>Cartões de crédito</span>
              </button>

              <div className="kc-mob-drawer-section-label">Planejar & Cortar</div>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "cuts" ? " active" : ""}`}
                onClick={() => navigateTo("health", "cuts")}
              >
                <Scissors size={20} />
                <span>Cortes & Fim do Ano</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "budgets" ? " active" : ""}`}
                onClick={() => navigateTo("budgets", null)}
              >
                <Percent size={20} />
                <span>Orçamentos</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "planning" ? " active" : ""}`}
                onClick={() => navigateTo("planning", null)}
              >
                <Target size={20} />
                <span>Objetivos & Caixinhas</span>
              </button>

              <div className="kc-mob-drawer-section-label">Analisar</div>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "health" ? " active" : ""}`}
                onClick={() => navigateTo("health", null)}
              >
                <HeartPulse size={20} />
                <span>Endividamento & Saúde</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "charts" ? " active" : ""}`}
                onClick={() => navigateTo("overview", "charts")}
              >
                <PieChart size={20} />
                <span>Gráficos</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "evolution" ? " active" : ""}`}
                onClick={() => navigateTo("budgets", "evolution")}
              >
                <CalendarRange size={20} />
                <span>Projeção até 31/12</span>
              </button>

              <button
                type="button"
                className={`kc-mob-drawer-item${effectiveView === "patrimony" ? " active" : ""}`}
                onClick={() => navigateTo("patrimony", null)}
              >
                <Wallet size={20} />
                <span>Patrimônio & Empréstimos</span>
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* ================= FAB (+) & SPEED DIAL (IMAGENS 2 E 3) ================= */}
      {fabOpen && (
        <div
          className="kc-mob-fab-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFabOpen(false);
          }}
        >
          <div className="kc-mob-speed-dial" role="menu" aria-label="Adicionar lançamento">
            <button
              type="button"
              role="menuitem"
              className="kc-mob-sd-item"
              onClick={() => {
                setFabOpen(false);
                open("title", null, "transfer");
              }}
            >
              <span className="kc-mob-sd-icon is-amber">
                <ArrowUpDown size={18} />
              </span>
              <strong>Transferência</strong>
            </button>

            <button
              type="button"
              role="menuitem"
              className="kc-mob-sd-item"
              onClick={() => {
                setFabOpen(false);
                open("income", null, "bill");
              }}
            >
              <span className="kc-mob-sd-icon is-green">
                <Plus size={19} strokeWidth={2.5} />
              </span>
              <strong>Receita</strong>
            </button>

            <button
              type="button"
              role="menuitem"
              className="kc-mob-sd-item"
              onClick={() => {
                setFabOpen(false);
                open("title", null, "bill");
              }}
            >
              <span className="kc-mob-sd-icon is-red">
                <Minus size={19} strokeWidth={2.5} />
              </span>
              <strong>Despesa</strong>
            </button>

            <button
              type="button"
              role="menuitem"
              className="kc-mob-sd-item"
              onClick={() => {
                setFabOpen(false);
                open("card_expense", null, "bill");
              }}
            >
              <span className="kc-mob-sd-icon is-blue">
                <CreditCard size={18} />
              </span>
              <strong>Despesa cartão</strong>
            </button>
          </div>
        </div>
      )}

      <div className="kc-mob-fab-cluster">
        <button
          type="button"
          className="kc-mob-scroll-top"
          aria-label="Voltar ao topo"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <ArrowUp size={18} />
        </button>

        <button
          type="button"
          className={`kc-mob-fab${fabOpen ? " is-open" : ""}`}
          aria-label="Adicionar lançamento"
          aria-expanded={fabOpen}
          onClick={() => setFabOpen((v) => !v)}
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
