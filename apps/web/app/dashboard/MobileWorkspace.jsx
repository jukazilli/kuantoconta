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
  Award,
  Plane,
  ListChecks,
  Check,
  X,
  LockOpen,
  TrendingUp,
  CloudOff,
} from "lucide-react";
import BankIcon from "./BankIcon";
import BudgetList from "./BudgetList";
import FinanceChart from "./FinanceChart";

const CATEGORY_COLORS = {
  Moradia: { bg: "#EDE9FE", fg: "#6D28D9", solid: "#7C3AED" },
  Alimentação: { bg: "#F3E8E2", fg: "#78350F", solid: "#8D5B4C" },
  Transporte: { bg: "#E0F2FE", fg: "#0369A1", solid: "#0284C7" },
  Saúde: { bg: "#FCE7F3", fg: "#BE185D", solid: "#DB2777" },
  Lazer: { bg: "#FEF3C7", fg: "#B45309", solid: "#D97706" },
  Educação: { bg: "#CCFBF1", fg: "#0F766E", solid: "#0D9488" },
  Assinaturas: { bg: "#FFE4E6", fg: "#BE123C", solid: "#E11D48" },
  Empréstimos: { bg: "#FFEDD5", fg: "#C2410C", solid: "#EA580C" },
  Pagamentos: { bg: "#FEE2E2", fg: "#B91C1C", solid: "#E04F44" },
  Salário: { bg: "#DCFCE7", fg: "#15803D", solid: "#16A34A" },
  Benefícios: { bg: "#F3E8E2", fg: "#78350F", solid: "#7C5846" },
  "Renda extra": { bg: "#D1FAE5", fg: "#047857", solid: "#059669" },
  Rendimentos: { bg: "#E0E7FF", fg: "#3730A3", solid: "#4F46E5" },
};

export function getCategoryVisual(categoryName, direction = "expense") {
  if (CATEGORY_COLORS[categoryName]) return CATEGORY_COLORS[categoryName];
  if (direction === "income") return { bg: "#DCFCE7", fg: "#15803D", solid: "#16A34A" };
  return { bg: "#FFF1E8", fg: "#C2410C", solid: "#FE6803" };
}

const WEEKDAYS_SHORT = ["dom.", "seg.", "ter.", "quar.", "qui.", "sex.", "sáb."];
function formatDateWithWeekday(iso, fmtDateFn) {
  const clean = String(iso || "").slice(0, 10);
  const base = fmtDateFn(clean);
  if (clean.length !== 10) return base;
  const d = new Date(`${clean}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return base;
  return `${base} • ${WEEKDAYS_SHORT[d.getUTCDay()]}`;
}

function SemicircleSavingsGauge({ pct = 0 }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
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
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
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
              stroke={isFilled ? "#FE6803" : "#E2E5EC"}
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

function SimpleDonutRing({ segments = [], totalLabel = "R$ 0,00", subLabel = "Total" }) {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  return (
    <div className="kc-mob-donut-ring-wrap">
      <svg viewBox="0 0 168 168" className="kc-mob-donut-svg" aria-hidden="true">
        <circle cx="84" cy="84" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="24" />
        {total > 0 &&
          segments.map((seg, idx) => {
            const pct = seg.value / total;
            const dash = pct * circumference;
            const offset = -accumulatedPct * circumference;
            accumulatedPct += pct;
            return (
              <circle
                key={seg.label || idx}
                cx="84"
                cy="84"
                r={radius}
                fill="none"
                stroke={seg.color || "#FE6803"}
                strokeWidth="24"
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={offset}
                transform="rotate(-90 84 84)"
              />
            );
          })}
      </svg>
      <div className="kc-mob-donut-center">
        <strong>{totalLabel}</strong>
        {subLabel && <span>{subLabel}</span>}
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
  busy = false,
  applyCutPlan,
  Empty,
  profileContent,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [planChoiceOpen, setPlanChoiceOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState("expense"); // "expense" | "income"
  const [planningTab, setPlanningTab] = useState("overview"); // "overview" | "cuts"
  const [mobileSection, setMobileSection] = useState(null); // "wallets" | "cards" | "charts" | "evolution" | null
  const [selectedCutIds, setSelectedCutIds] = useState({});
  const [txMenuId, setTxMenuId] = useState(null);
  const [cardMenuId, setCardMenuId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chartsTab, setChartsTab] = useState("expenses"); // "expenses" | "income" | "other"

  const effectiveView = mobileSection || active;

  function navigateTo(tabKey, subView = null, nextPlanningTab = null) {
    setMobileSection(subView);
    if (nextPlanningTab) setPlanningTab(nextPlanningTab);
    else if (tabKey === "planning" && !subView) setPlanningTab("overview");
    setTab(tabKey);
    setDrawerOpen(false);
    setTxMenuId(null);
    setCardMenuId(null);
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

  // Year-end projection (31/12) with user-selected cuts (no automatic category cut suggestions)
  const monthsRemainingInYear = useMemo(() => {
    const curMonthNum = Number((today || "2026-11-22").slice(5, 7)) || 11;
    return Math.max(1, 12 - curMonthNum + 1);
  }, [today]);

  const recurringCutCandidates = useMemo(
    () =>
      (habits?.recurringItems || []).map((r) => ({
        key: `rec:${r.id}`,
        kind: "recurring",
        ruleId: r.id,
        description: r.description,
        category: r.category || "Outros",
        monthlyCents: cents(r.monthlyCents),
      })),
    [habits, cents]
  );

  const pendingCutCandidates = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const t of pendingExpenseRows) {
      if (t.series_id && recurringCutCandidates.some((r) => r.ruleId === t.series_id)) continue;
      const dedupKey = t.series_id || t.id;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
      if (rem <= 0) continue;
      list.push({
        key: `tit:${t.id}`,
        kind: "title",
        titleId: t.id,
        isSeries: Boolean(t.series_id || t.installment_total > 1),
        description: t.description,
        category: t.category || "Outros",
        monthlyCents: rem,
        dueOn: t.due_on,
      });
    }
    return list;
  }, [pendingExpenseRows, recurringCutCandidates, cents]);

  const allCutCandidates = useMemo(
    () => [...recurringCutCandidates, ...pendingCutCandidates],
    [recurringCutCandidates, pendingCutCandidates]
  );

  const selectedCutItems = useMemo(
    () => allCutCandidates.filter((item) => Boolean(selectedCutIds[item.key])),
    [allCutCandidates, selectedCutIds]
  );

  const interactiveMonthlyCutCents = useMemo(
    () => selectedCutItems.reduce((sum, item) => sum + cents(item.monthlyCents), 0),
    [selectedCutItems, cents]
  );

  const yearEndBaseCents = useMemo(() => {
    const decMonth = (months || []).find((m) => m.month.endsWith("-12")) || (months || [])[months.length - 1];
    if (decMonth && decMonth.balance !== null && decMonth.balance !== undefined) {
      return cents(decMonth.balance);
    }
    return cents(projectedBalanceCents) + cents(capitalBalanceCents);
  }, [months, projectedBalanceCents, capitalBalanceCents, cents]);

  const yearEndWithCutsCents = yearEndBaseCents + interactiveMonthlyCutCents * monthsRemainingInYear;

  // Savings Percentage for the Semicircle Gauge
  const totalIncomeConsideredCents = cents(summary?.receivable?.total);
  const totalExpenseConsideredCents = cents(summary?.payable?.total);
  const currentMonthlyFlowCents = totalIncomeConsideredCents - totalExpenseConsideredCents;
  const projectedFlowAfterCutsCents = currentMonthlyFlowCents + interactiveMonthlyCutCents;
  const netMonthSavingsCents = Math.max(0, currentMonthlyFlowCents);
  const monthSavingsPct =
    totalIncomeConsideredCents > 0
      ? Math.max(0, Math.round((netMonthSavingsCents / totalIncomeConsideredCents) * 100))
      : 0;

  const cashflowMaxCents = Math.max(
    10000,
    totalIncomeConsideredCents,
    totalExpenseConsideredCents,
    Math.abs(totalIncomeConsideredCents - totalExpenseConsideredCents)
  );

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

  const timelineOverviewItems = useMemo(() => {
    const list = [...(rows || [])]
      .filter((t) => !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard"))
      .sort((a, b) => isoDate(b.due_on).localeCompare(isoDate(a.due_on)));
    return list.slice(0, 6);
  }, [rows, isoDate]);

  const walletNameOf = (id) => wallets.find((w) => w.id === id)?.name || "A definir";

  // Sum of currently filtered rows in Movements view (for the subtitle under title like Image 15)
  const movementsFilteredSumCents = useMemo(
    () => (rows || []).reduce((acc, t) => acc + cents(t.amount_cents), 0),
    [rows, cents]
  );

  // Total open across all credit cards (for the subtitle under Cartões title like Image 10)
  const cardsTotalOpenCents = useMemo(
    () =>
      (creditCards || []).reduce((acc, c) => {
        const u = computeCardUsage(c, expandedTitles || []);
        return acc + cents(u.usedLimitCents);
      }, 0),
    [creditCards, computeCardUsage, expandedTitles, cents]
  );

  // Charts analytics breakdowns (Fixas vs Parceladas vs Avulsas, Conta vs Cartão, Receitas por categoria)
  const chartAnalytics = useMemo(() => {
    const expRows = (rows || []).filter(
      (t) => t.direction === "expense" && !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard")
    );
    const incRows = (rows || []).filter(
      (t) => t.direction === "income" && !["transfer", "reserve_transfer"].includes(t.entry_kind || "standard")
    );
    let fixedExp = 0;
    let installmentExp = 0;
    let singleExp = 0;
    let cardExp = 0;
    let debitExp = 0;

    for (const t of expRows) {
      const amt = cents(t.amount_cents);
      if (t.installment_total > 1) installmentExp += amt;
      else if (t.series_id || String(t.id).startsWith("rec:")) fixedExp += amt;
      else singleExp += amt;

      if (t.credit_card_id) cardExp += amt;
      else debitExp += amt;
    }

    const incByCatMap = {};
    let fixedInc = 0;
    let singleInc = 0;
    for (const t of incRows) {
      const amt = cents(t.amount_cents);
      const cat = t.category || "Outros";
      incByCatMap[cat] = (incByCatMap[cat] || 0) + amt;
      if (t.series_id || String(t.id).startsWith("rec:")) fixedInc += amt;
      else singleInc += amt;
    }
    const incByCat = Object.entries(incByCatMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalCardLimit = (creditCards || []).reduce((s, c) => s + cents(c.limit_cents), 0);
    const totalCardUsed = cardsTotalOpenCents;
    const totalCardAvail = Math.max(0, totalCardLimit - totalCardUsed);

    return {
      totalExp: fixedExp + installmentExp + singleExp,
      fixedExp,
      installmentExp,
      singleExp,
      cardExp,
      debitExp,
      totalInc: fixedInc + singleInc,
      incByCat,
      fixedInc,
      singleInc,
      totalCardLimit,
      totalCardUsed,
      totalCardAvail,
    };
  }, [rows, cents, creditCards, cardsTotalOpenCents]);

  const movementStatusFilter = screenFilters?.movements?.status || "all";

  // Dynamic view title & subtitle for 2-tier header (Images 1-8, 10, 14, 15)
  const headerConfig = useMemo(() => {
    if (effectiveView === "overview") return { title: null, subtitle: null };
    if (effectiveView === "movements") {
      const tLabel =
        filter === "expense" && movementStatusFilter === "pending"
          ? "Despesas pendentes"
          : filter === "income" && movementStatusFilter === "pending"
            ? "Receitas pendentes"
            : filter === "expense"
              ? "Contas a pagar"
              : filter === "income"
                ? "Valores a receber"
                : "Transações";
      return { title: tLabel, subtitle: money(movementsFilteredSumCents) };
    }
    if (effectiveView === "cards") {
      return { title: "Cartões", subtitle: money(cardsTotalOpenCents) };
    }
    if (effectiveView === "wallets") {
      return { title: "Contas", subtitle: money(checkingBalanceCents + capitalBalanceCents) };
    }
    if (effectiveView === "budgets") {
      return { title: "Orçamentos", subtitle: `Orçado: ${money(allocatedBudgetCents)}` };
    }
    if (effectiveView === "charts") {
      return { title: "Gráficos", subtitle: null };
    }
    if (effectiveView === "planning") {
      return {
        title: "Planejamentos",
        subtitle: planningTab === "cuts" ? "Planejar cortes no fluxo" : money(capitalBalanceCents),
      };
    }
    if (effectiveView === "health") {
      return { title: "Endividamento & Saúde", subtitle: `Dívida: ${debtDisplay}` };
    }
    if (effectiveView === "evolution") {
      return { title: "Projeção até 31/12", subtitle: null };
    }
    if (effectiveView === "patrimony") {
      return { title: "Patrimônio & Empréstimos", subtitle: display(netWorthAtDateCents) };
    }
    if (effectiveView === "profile") {
      return { title: "Meu Perfil", subtitle: user?.email || "" };
    }
    return { title: "Kuantoconta", subtitle: null };
  }, [
    effectiveView,
    filter,
    movementStatusFilter,
    money,
    movementsFilteredSumCents,
    cardsTotalOpenCents,
    checkingBalanceCents,
    capitalBalanceCents,
    allocatedBudgetCents,
    planningTab,
    debtDisplay,
    display,
    netWorthAtDateCents,
    user?.email,
  ]);

  const monthShortUpper = useMemo(() => {
    const clean = (monthNavLabel || "nov").slice(0, 3).toUpperCase();
    return clean;
  }, [monthNavLabel]);

  return (
    <div className="kc-mob-shell">
      {/* TOP APP BAR — PADRÃO LARANJA KUANTOCONTA */}
      <header className={`kc-mob-topbar${effectiveView === "overview" ? " kc-mob-topbar--hero" : " kc-mob-topbar--internal"}`}>
        {effectiveView === "overview" ? (
          /* Na Home (Resumo): 1 linha limpa com Menu, < Mês > centralizado e Ações */
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
        ) : (
          /* Nas Telas Internas (Transações, Cartões, Gráficos, Orçamentos, Cortes): 2 Andares como nas Imagens 1–8 e 10–15 */
          <>
            <div className="kc-mob-topbar-row">
              <div className="kc-mob-topbar-title-group">
                <button
                  type="button"
                  className="kc-mob-icon-btn"
                  aria-label="Voltar para o início"
                  onClick={() => navigateTo("overview", null)}
                >
                  <ChevronLeft size={24} />
                </button>
                <div className="kc-mob-topbar-titles">
                  <h1>{headerConfig.title}</h1>
                  {headerConfig.subtitle && <small>{headerConfig.subtitle}</small>}
                </div>
              </div>

              <div className="kc-mob-topbar-right">
                {effectiveView === "movements" && (
                  <button
                    type="button"
                    className="kc-mob-icon-btn"
                    aria-label="Pesquisar lançamento"
                    onClick={() => setSearchOpen((v) => !v)}
                  >
                    <Search size={20} />
                  </button>
                )}
                {effectiveView === "cards" && (
                  <button
                    type="button"
                    className="kc-mob-icon-btn"
                    aria-label="Ver gráficos dos cartões"
                    onClick={() => {
                      setChartsTab("other");
                      navigateTo("overview", "charts");
                    }}
                  >
                    <TrendingUp size={20} />
                  </button>
                )}
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

            {effectiveView !== "profile" && (
              <div className="kc-mob-topbar-month-row">
                <div className="kc-mob-month-switcher" aria-label="Navegador de período">
                  <button
                    type="button"
                    className="kc-mob-month-arrow"
                    aria-label="Mês anterior"
                    onClick={() => selectMonth(-1)}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <button
                    type="button"
                    className="kc-mob-month-label"
                    onClick={() => setFilterOpen(true)}
                    aria-label="Alterar período ou filtros de data"
                  >
                    <span>
                      {isCustomRange
                        ? `${fmtDate(rangeStart).slice(0, 5)}–${fmtDate(date).slice(0, 5)}`
                        : monthNavLabel}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="kc-mob-month-arrow"
                    aria-label="Próximo mês"
                    onClick={() => selectMonth(1)}
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
              </div>
            )}
          </>
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
                onClick={() => navigateTo("planning", null, "cuts")}
              >
                <strong className={yearEndWithCutsCents > yearEndBaseCents ? "is-pos" : ""}>
                  {money(yearEndWithCutsCents)}
                </strong>
                <span>{interactiveMonthlyCutCents > 0 ? "31/12 c/ cortes" : "Projeção 31/12"}</span>
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
            {/* Card 1: Despesas | Receitas Pendentes */}
            <section className="kc-mob-card kc-mob-pending-card" aria-label="Compromissos pendentes do período">
              <div className="kc-mob-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pendingTab === "expense"}
                  className={`kc-mob-tab is-expense${pendingTab === "expense" ? " active" : ""}`}
                  onClick={() => setPendingTab("expense")}
                >
                  A pagar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pendingTab === "income"}
                  className={`kc-mob-tab is-income${pendingTab === "income" ? " active" : ""}`}
                  onClick={() => setPendingTab("income")}
                >
                  A receber
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

            {/* Seção 2: Visão Geral 2x2 (Contas, Endividamento, A receber, A pagar) */}
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
                  <span className="kc-mob-ov-icon is-orange">
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

                {/* 2. Endividamento */}
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

                {/* 3. Receitas / A receber */}
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
                    <span className="kc-mob-ov-label">A receber</span>
                    <div className="kc-mob-ov-sub">
                      <span>Previsto</span>
                      <strong>{money(summary.receivable.total)}</strong>
                    </div>
                  </div>
                </button>

                {/* 4. Despesas / A pagar */}
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
                    <span className="kc-mob-ov-label">A pagar</span>
                    <div className="kc-mob-ov-sub">
                      <span>Previsto</span>
                      <strong>{money(summary.payable.total)}</strong>
                    </div>
                  </div>
                </button>
              </div>
            </section>

            {/* Card 3: Economia Mensal & Planejador de Cortes até 31/12 */}
            <section className="kc-mob-card" aria-label="Economia mensal e planejamento de cortes até 31/12">
              <div className="kc-mob-card-head">
                <h2>Economia e metas até 31/12</h2>
                <button
                  type="button"
                  className="kc-mob-dots-btn"
                  aria-label="Planejar cortes no fluxo"
                  onClick={() => navigateTo("planning", null, "cuts")}
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>

              <div className="kc-mob-economy-grid">
                <div className="kc-mob-economy-left">
                  <SemicircleSavingsGauge pct={monthSavingsPct} />
                  <div className="kc-mob-economy-saved">
                    <strong>{money(interactiveMonthlyCutCents > 0 ? yearEndWithCutsCents : netMonthSavingsCents)}</strong>
                    <span>{interactiveMonthlyCutCents > 0 ? "Em 31/12 c/ cortes" : "Valor economizado"}</span>
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
                    onClick={() => navigateTo("planning", null, "cuts")}
                  >
                    <span className="kc-mob-econ-circle is-amber">
                      <Scissors size={15} />
                    </span>
                    <div>
                      <span>Planejar cortes</span>
                      <strong className="is-amber">
                        {interactiveMonthlyCutCents > 0 ? `+${money(interactiveMonthlyCutCents)}/mês ›` : "Simular fluxo ›"}
                      </strong>
                    </div>
                  </button>
                </div>
              </div>
            </section>

            {/* Card 4: Contas */}
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

            {/* Card 5: Fluxo de Caixa */}
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

            {/* Card 6: Últimos Lançamentos */}
            <section className="kc-mob-card" aria-label="Últimos lançamentos">
              <div className="kc-mob-card-head">
                <h2>Últimas despesas e contas</h2>
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
                        <button
                          type="button"
                          className="kc-mob-dots-btn"
                          aria-label={`Opções de ${w.name}`}
                          onClick={() => setSelectedWallet(w)}
                        >
                          <MoreHorizontal size={18} />
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

        {/* ================= VISTA 4: CARTÕES DE CRÉDITO (IMAGENS 10 E 14) ================= */}
        {effectiveView === "cards" && (
          <div className="kc-mob-stack">
            {creditCards.length > 0 ? (
              creditCards.map((c) => {
                const usage = computeCardUsage(c, expandedTitles || []);
                const cyc = computeInvoiceCycleForPurchase({
                  purchaseDate: today,
                  closingDay: c.closing_day,
                  dueDay: c.due_day,
                });
                const isMenuOpen = cardMenuId === c.id;
                const linkedWalletName = c.default_wallet_id ? walletNameOf(c.default_wallet_id) : "A definir";

                return (
                  <section key={c.id} className="kc-mob-card kc-mob-cc-card">
                    {/* Topo do Card de Cartão: Logo + Nome + Ações (+ | Fatura | •••) */}
                    <div className="kc-mob-cc-head">
                      <button
                        type="button"
                        className="kc-mob-cc-brand"
                        onClick={() => setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth })}
                      >
                        <BankIcon name={c.name} size={42} />
                        <div>
                          <strong>{c.name}</strong>
                          <span>Cartão de crédito</span>
                        </div>
                      </button>

                      <div className="kc-mob-cc-actions">
                        <button
                          type="button"
                          className="kc-mob-dots-btn"
                          aria-label={`Nova despesa no cartão ${c.name}`}
                          onClick={() => {
                            open("card_expense", null, "bill");
                          }}
                        >
                          <Plus size={20} />
                        </button>
                        <button
                          type="button"
                          className="kc-mob-dots-btn"
                          aria-label={`Ver fatura de ${c.name}`}
                          onClick={() => setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth })}
                        >
                          <ReceiptText size={19} />
                        </button>
                        <div className="kc-mob-cc-menu-wrap">
                          <button
                            type="button"
                            className="kc-mob-dots-btn"
                            aria-label={`Menu do cartão ${c.name}`}
                            aria-expanded={isMenuOpen}
                            onClick={() => setCardMenuId(isMenuOpen ? null : c.id)}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                          {isMenuOpen && (
                            <div className="kc-mob-dropdown-menu" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuId(null);
                                  open("card_expense", null, "bill");
                                }}
                              >
                                Nova despesa no cartão
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuId(null);
                                  setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth });
                                }}
                              >
                                Ver fatura / Reajustar
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuId(null);
                                  setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth });
                                }}
                              >
                                Histórico de faturas
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCardMenuId(null);
                                  setFilter("expense");
                                  navigateTo("movements", null);
                                }}
                              >
                                Despesas associadas
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bloco 1: 3 Colunas (Limite | Em aberto | Limite disp.) + Barra com % */}
                    <div className="kc-mob-cc-stats3">
                      <div>
                        <span>Limite</span>
                        <strong>{money(cents(c.limit_cents))}</strong>
                      </div>
                      <div className="is-center">
                        <span>Em aberto</span>
                        <strong>{money(usage.usedLimitCents)}</strong>
                      </div>
                      <div className="is-right">
                        <span>Limite disp.</span>
                        <strong>{money(usage.availableLimitCents)}</strong>
                      </div>
                    </div>

                    <div className="kc-mob-cc-progress-track">
                      <div
                        className={`kc-mob-cc-progress-fill${usage.utilizationPct >= 90 ? " is-over" : ""}`}
                        style={{ width: `${Math.min(100, usage.utilizationPct)}%` }}
                      />
                      <span className="kc-mob-cc-progress-pct">{usage.utilizationPct}%</span>
                    </div>

                    <hr className="kc-mob-dotted-hr" />

                    {/* Bloco 2: Conta | Fechamento | Vencimento */}
                    <div className="kc-mob-cc-stats3">
                      <div>
                        <span>Conta</span>
                        <strong>{linkedWalletName}</strong>
                      </div>
                      <div className="is-center">
                        <span>Fechamento</span>
                        <strong>{String(c.closing_day).padStart(2, "0")}/{monthShortUpper}.</strong>
                      </div>
                      <div className="is-right">
                        <span>Vencimento</span>
                        <strong>{String(c.due_day).padStart(2, "0")}/{monthShortUpper}.</strong>
                      </div>
                    </div>

                    <hr className="kc-mob-dotted-hr" />

                    {/* Bloco 3: Fatura parcial + Status Aberta + Registrar pagamento */}
                    <div className="kc-mob-cc-invoice-row">
                      <span>Fatura parcial</span>
                      <strong>{money(usage.usedLimitCents)}</strong>
                    </div>

                    <div className="kc-mob-cc-footer">
                      <span className="kc-mob-cc-status-pill">
                        <LockOpen size={13} />
                        <span>{usage.usedLimitCents > 0 ? "Aberta" : "Sem fatura"}</span>
                      </span>

                      <button
                        type="button"
                        className="kc-mob-cc-pay-btn"
                        onClick={() => setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth })}
                      >
                        <CheckCircle2 size={16} />
                        <span>Registrar pagamento</span>
                      </button>
                    </div>
                  </section>
                );
              })
            ) : (
              <section className="kc-mob-card kc-mob-empty-state">
                <div className="kc-mob-empty-circle">
                  <CreditCard size={34} />
                </div>
                <strong>Nenhum cartão cadastrado</strong>
                <p>Toque no botão + abaixo para cadastrar seu cartão de crédito e acompanhar faturas e limites.</p>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => open("credit_card")}
                >
                  Cadastrar cartão
                </button>
              </section>
            )}
          </div>
        )}

        {/* ================= VISTA 5: TRANSAÇÕES / DESPESAS PENDENTES (IMAGEM 15) ================= */}
        {effectiveView === "movements" && (
          <div className="kc-mob-stack">
            {/* Barra de Busca Expansível */}
            {(searchOpen || query) && (
              <div className="kc-mob-search-bar-card">
                <Search size={18} />
                <input
                  autoFocus
                  placeholder="Buscar lançamento ou categoria..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button type="button" className="kc-mob-dots-btn" onClick={() => setQuery("")} aria-label="Limpar busca">
                    <X size={17} />
                  </button>
                )}
              </div>
            )}

            {/* Barra de Chips de Filtro Ativo (Igual ao chip "Pendentes (x)" da Imagem 15) */}
            <div className="kc-mob-active-filters-bar">
              {movementStatusFilter !== "all" && (
                <button
                  type="button"
                  className="kc-mob-active-chip is-amber"
                  onClick={() => setScreenFilter("movements", { status: "all" })}
                >
                  <span>
                    {movementStatusFilter === "pending"
                      ? "Pendentes"
                      : movementStatusFilter === "done"
                        ? "Efetivados"
                        : "Vencidos"}
                  </span>
                  <span className="kc-mob-chip-x" aria-hidden="true">×</span>
                </button>
              )}

              {filter !== "all" && (
                <button
                  type="button"
                  className={`kc-mob-active-chip ${filter === "expense" ? "is-red" : "is-green"}`}
                  onClick={() => setFilter("all")}
                >
                  <span>{filter === "expense" ? "A pagar" : "A receber"}</span>
                  <span className="kc-mob-chip-x" aria-hidden="true">×</span>
                </button>
              )}

              <div className="kc-mob-quick-filter-pills">
                {[
                  ["all", "Todos"],
                  ["expense", "A pagar"],
                  ["income", "A receber"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className={`kc-mob-qpill${filter === k ? " active" : ""}`}
                    onClick={() => setFilter(k)}
                  >
                    {l}
                  </button>
                ))}
                <button
                  type="button"
                  className={`kc-mob-qpill${movementStatusFilter === "pending" ? " active" : ""}`}
                  onClick={() =>
                    setScreenFilter("movements", {
                      status: movementStatusFilter === "pending" ? "all" : "pending",
                    })
                  }
                >
                  Pendentes
                </button>
              </div>
            </div>

            {/* Lista de Transações no Padrão Exato da Imagem 15 */}
            <section className="kc-mob-card kc-mob-tx-list-card">
              {rows.length > 0 ? (
                <div className="kc-mob-tx-list">
                  {rows.map((t) => {
                    const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
                    const isLate = rem > 0 && isoDate(t.due_on) < today;
                    const isDone = rem === 0;
                    const vis = getCategoryVisual(t.category, t.direction);
                    const isMenuOpen = txMenuId === t.id;
                    const typeTagLabel =
                      t.entry_kind === "transfer"
                        ? "Transferência"
                        : t.credit_card_id
                          ? "Cartões"
                          : t.entry_kind === "loan_out" || t.entry_kind === "loan_repayment"
                            ? "Empréstimo"
                            : t.installment_total > 1
                              ? "Parceladas"
                              : t.series_id || String(t.id).startsWith("rec:")
                                ? "Fixas"
                                : t.direction === "income"
                                  ? "Receita"
                                  : "Conta";

                    return (
                      <article key={t.id} className="kc-mob-tx-item">
                        {/* Botão Circular de Status / Baixa Rápida à Esquerda */}
                        <button
                          type="button"
                          className={`kc-mob-tx-clock ${isDone ? "is-done" : isLate ? "is-late" : "is-pending"}`}
                          aria-label={isDone ? "Ver lançamento efetivado" : `Confirmar pagamento de ${t.description}`}
                          onClick={() => (isDone || t.entry_kind === "transfer" ? open("detail", t.id) : handleAction("settle", t.id))}
                        >
                          {t.entry_kind === "transfer" ? (
                            <ArrowLeftRight size={18} />
                          ) : isDone ? (
                            <CheckCircle2 size={20} />
                          ) : (
                            <Clock3 size={20} />
                          )}
                        </button>

                        {/* Coluna Central: Banco -> Título + Parcela -> 2 Chips Coloridos */}
                        <button
                          type="button"
                          className="kc-mob-tx-center"
                          onClick={() => open("detail", t.id)}
                        >
                          <span className="kc-mob-tx-bank">{walletNameOf(t.wallet_id)}</span>
                          <strong className="kc-mob-tx-title">
                            {t.description}
                            {t.installment_total > 1 && (
                              <span className="kc-mob-tx-inst">
                                {" "}
                                {t.installment_index}/{t.installment_total}
                              </span>
                            )}
                          </strong>
                          <div className="kc-mob-tx-tags">
                            <span
                              className="kc-mob-tx-tag"
                              style={{ background: vis.solid, color: "#ffffff" }}
                            >
                              {t.category || "Geral"} ›
                            </span>
                            <span className="kc-mob-tx-tag is-type">
                              {typeTagLabel} ›
                            </span>
                          </div>
                        </button>

                        {/* Coluna Direita: Data • DiaSemana + ••• | Valor | Bolinha */}
                        <div className="kc-mob-tx-right">
                          <div className="kc-mob-tx-date-row">
                            <span>{formatDateWithWeekday(t.due_on, fmtDate)}</span>
                            <button
                              type="button"
                              className="kc-mob-tx-more"
                              aria-label={`Opções de ${t.description}`}
                              aria-expanded={isMenuOpen}
                              onClick={() => setTxMenuId(isMenuOpen ? null : t.id)}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          </div>

                          <strong className={`kc-mob-tx-amount${t.direction === "income" ? " is-income" : ""}`}>
                            {money(cents(t.amount_cents))}
                          </strong>

                          <span
                            className={`kc-mob-tx-dot ${isDone ? "is-done" : isLate ? "is-late" : "is-pending"}`}
                            aria-hidden="true"
                          />

                          {isMenuOpen && (
                            <div className="kc-mob-dropdown-menu" role="menu">
                              {rem > 0 && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setTxMenuId(null);
                                    handleAction("settle", t.id);
                                  }}
                                >
                                  Confirmar pagamento
                                </button>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setTxMenuId(null);
                                  open("detail", t.id);
                                }}
                              >
                                Ver detalhes
                              </button>
                              {t.entry_kind !== "transfer" && (
                                <>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setTxMenuId(null);
                                      handleAction("edit", t.id);
                                    }}
                                  >
                                    Editar lançamento
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setTxMenuId(null);
                                      handleAction("duplicate", t.id);
                                    }}
                                  >
                                    Duplicar
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className="is-danger"
                                onClick={() => {
                                  setTxMenuId(null);
                                  handleAction("cancel", t.id);
                                }}
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="kc-mob-empty-state">
                  <div className="kc-mob-empty-circle">
                    <CloudOff size={34} />
                  </div>
                  <strong>Nada aqui</strong>
                  <p>Nenhum registro encontrado neste período.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 6: ORÇAMENTOS (IMAGENS 7, 8 E 9) ================= */}
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
                <h2>Orçamentos mensais</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => setActionMenu("budget_pick")}
                >
                  Novo limite
                </button>
              </div>
              {budgetItems.some((b) => b.limitCents !== null) ? (
                <BudgetList
                  items={budgetItems}
                  monthLabel={monthLong}
                  insufficientCash={summary.minCash !== null && summary.minCash < 0}
                  onEditBudget={openBudget}
                  onFulfillPlan={fulfillPlan}
                  onEditPlan={editPlan}
                  onCancelPlan={cancelPlan}
                />
              ) : (
                <div className="kc-mob-empty-state">
                  <div className="kc-mob-empty-circle">
                    <CloudOff size={36} />
                  </div>
                  <strong>Nada aqui</strong>
                  <p>Nenhum orçamento configurado em {monthOnly}. Defina limites por categoria para controlar seus gastos.</p>
                  <button
                    type="button"
                    className="pill pill-primary pill-compact"
                    onClick={() => setActionMenu("budget_pick")}
                  >
                    Criar orçamento
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= VISTA 7: PLANEJAMENTOS (CAIXINHAS, COMPRAS & PLANEJADOR DE CORTES) ================= */}
        {effectiveView === "planning" && (
          <div className="kc-mob-stack">
            {/* Cards 2x2 no mesmo padrão visual da Visão Geral */}
            <section className="kc-mob-section" aria-label="Resumo de planejamentos">
              <div className="kc-mob-overview-grid">
                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => setPlanningTab("overview")}
                >
                  <span className="kc-mob-ov-icon is-orange">
                    <PiggyBank size={19} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">
                      {summary.knownCash ? money(capitalBalanceCents) : "R$ 0,00"}
                    </strong>
                    <span className="kc-mob-ov-label">Em caixinhas</span>
                    <div className="kc-mob-ov-sub">
                      <span>Reserva + Metas</span>
                      <strong>{capitalGoals.length} {capitalGoals.length === 1 ? "caixinha" : "caixinhas"}</strong>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => setPlanningTab("overview")}
                >
                  <span className="kc-mob-ov-icon is-green">
                    <ArrowUp size={19} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">{money(reservedThisMonthCents)}</strong>
                    <span className="kc-mob-ov-label">Guardados mês</span>
                    <div className="kc-mob-ov-sub">
                      <span>No período</span>
                      <strong>{purchaseGoals.length} {purchaseGoals.length === 1 ? "plano" : "planos"}</strong>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => openReserveCaixinha()}
                >
                  <span className="kc-mob-ov-icon is-blue">
                    <TrendingUp size={18} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">{money(safeContribution?.safeContributionCents || 0)}</strong>
                    <span className="kc-mob-ov-label">Aporte</span>
                    <div className="kc-mob-ov-sub">
                      <span>Sugestão segura</span>
                      <strong>Sem faltar caixa</strong>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="kc-mob-ov-card"
                  onClick={() => setPlanningTab("cuts")}
                >
                  <span className="kc-mob-ov-icon is-amber">
                    <Scissors size={18} />
                  </span>
                  <div className="kc-mob-ov-info">
                    <strong className="kc-mob-ov-val">
                      {interactiveMonthlyCutCents > 0 ? `+${money(interactiveMonthlyCutCents)}` : "Simular"}
                    </strong>
                    <span className="kc-mob-ov-label">Planejar cortes</span>
                    <div className="kc-mob-ov-sub">
                      <span>Em 31/12</span>
                      <strong>{money(yearEndWithCutsCents)}</strong>
                    </div>
                  </div>
                </button>
              </div>
            </section>

            {/* Abas internas de Planejamentos */}
            <div className="kc-mob-quick-filter-pills" role="tablist" aria-label="Modos de planejamento">
              <button
                type="button"
                role="tab"
                aria-selected={planningTab === "overview"}
                className={`kc-mob-qpill${planningTab === "overview" ? " active" : ""}`}
                onClick={() => setPlanningTab("overview")}
              >
                Caixinhas & Planos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={planningTab === "cuts"}
                className={`kc-mob-qpill${planningTab === "cuts" ? " active" : ""}`}
                onClick={() => setPlanningTab("cuts")}
              >
                Planejar cortes
              </button>
            </div>

            {planningTab === "overview" ? (
              <>
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
                    <Empty>Crie uma Caixinha no botão + para separar sua reserva ou objetivo.</Empty>
                  )}
                </section>

                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Planejamentos de compra ({purchaseGoals.length})</h2>
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
                    <Empty>Toque no + e escolha Planejar para simular compras, viagens ou cortes.</Empty>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="kc-mob-card kc-mob-cuts-hero">
                  <span className="eyebrow">SIMULADOR DE FLUXO APÓS CORTES</span>
                  <div className="kc-mob-cuts-compare">
                    <div className="kc-mob-cuts-box">
                      <span>Fluxo mensal atual</span>
                      <strong className={currentMonthlyFlowCents < 0 ? "is-red" : ""}>
                        {money(currentMonthlyFlowCents)}
                      </strong>
                      <small>31/12 atual: {money(yearEndBaseCents)}</small>
                    </div>
                    <div className="kc-mob-cuts-box is-highlight">
                      <span>Fluxo após cortes</span>
                      <strong className={projectedFlowAfterCutsCents < 0 ? "is-red" : "is-green"}>
                        {money(projectedFlowAfterCutsCents)}
                      </strong>
                      <small>Em 31/12: {money(yearEndWithCutsCents)}</small>
                    </div>
                  </div>
                  <p className="kc-mob-cuts-summary">
                    Escolha abaixo exatamente quais contas ou recorrências você deseja encerrar.{" "}
                    {selectedCutItems.length > 0 ? (
                      <>
                        Com <strong>{selectedCutItems.length}</strong> corte(s) selecionado(s), seu fluxo ganha{" "}
                        <strong>+{money(interactiveMonthlyCutCents)}/mês</strong>.
                      </>
                    ) : (
                      "Nenhum corte selecionado ainda — o controle é 100% seu."
                    )}
                  </p>
                </section>

                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <div>
                      <h2>Selecione o que deseja cortar</h2>
                      <p className="hint" style={{ margin: "2px 0 0" }}>
                        Marque as contas ou recorrências que você quer simular e encerrar
                      </p>
                    </div>
                  </div>
                  {allCutCandidates.length > 0 ? (
                    <div className="kc-mob-cuts-list">
                      {allCutCandidates.map((item) => {
                        const checked = Boolean(selectedCutIds[item.key]);
                        return (
                          <button
                            type="button"
                            key={item.key}
                            className={`kc-mob-cut-item${checked ? " is-selected" : ""}`}
                            onClick={() =>
                              setSelectedCutIds((old) => ({ ...old, [item.key]: !old[item.key] }))
                            }
                          >
                            <span className={`kc-mob-cut-check${checked ? " checked" : ""}`}>
                              {checked && <Check size={14} strokeWidth={3} />}
                            </span>
                            <div className="kc-mob-cut-info">
                              <strong>{item.description}</strong>
                              <span>
                                {item.category} •{" "}
                                {item.kind === "recurring"
                                  ? "Recorrência mensal"
                                  : `Venc. ${fmtDate(item.dueOn)}`}
                              </span>
                            </div>
                            <div className="kc-mob-cut-vals">
                              <strong>+{money(item.monthlyCents)}/mês</strong>
                              <span>+{money(item.monthlyCents * monthsRemainingInYear)} até 31/12</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty>Nenhuma recorrência ou conta pendente disponível para corte.</Empty>
                  )}

                  {selectedCutItems.length > 0 && (
                    <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                      <button
                        type="button"
                        className="pill pill-primary"
                        style={{ width: "100%", justifyContent: "center" }}
                        disabled={busy}
                        onClick={async () => {
                          if (!applyCutPlan) return;
                          await applyCutPlan(selectedCutItems);
                          setSelectedCutIds({});
                        }}
                      >
                        <Scissors size={16} />
                        <span>
                          {busy
                            ? "Efetivando cortes..."
                            : `Efetivar planejamento (${selectedCutItems.length} ${selectedCutItems.length === 1 ? "corte" : "cortes"})`}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="light-button"
                        onClick={() => setSelectedCutIds({})}
                      >
                        Limpar seleção
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
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
                <h2>Planejar cortes no fluxo</h2>
                <button
                  type="button"
                  className="pill pill-primary pill-compact"
                  onClick={() => navigateTo("planning", null, "cuts")}
                >
                  Abrir planejador
                </button>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                Escolha exatamente quais contas ou recorrências deseja cortar para avaliar o impacto no seu fluxo até 31/12.
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

        {/* ================= VISTA 10: GRÁFICOS COM ABAS INFERIORES (IMAGENS 1 A 6) ================= */}
        {effectiveView === "charts" && (
          <div className="kc-mob-stack" style={{ paddingBottom: 68 }}>
            {chartsTab === "expenses" && (
              <>
                {/* 1. Ranking Categorias (Imagem 6) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Ranking categorias</h2>
                  </div>
                  {expenses.length > 0 ? (
                    <>
                      <div className="kc-mob-ranking-bars">
                        {expenses.map((item) => {
                          const totalExp = Math.max(1, expenses.reduce((s, x) => s + cents(x.value), 0));
                          const pct = ((cents(item.value) / totalExp) * 100).toFixed(1).replace(".", ",");
                          const widthPct = Math.max(18, Math.round((cents(item.value) / totalExp) * 100));
                          const vis = getCategoryVisual(item.name, "expense");
                          return (
                            <div key={item.name} className="kc-mob-rank-row">
                              <span className="kc-mob-rank-label">{item.name}</span>
                              <div className="kc-mob-rank-track">
                                <div
                                  className="kc-mob-rank-fill"
                                  style={{ width: `${widthPct}%`, background: vis.solid }}
                                >
                                  <span>{pct}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="kc-mob-chart-note">
                        Essas categorias totalizam <strong>{money(chartAnalytics.totalExp)}</strong>. Elas representam
                        100% do total de despesas do período.
                      </p>
                    </>
                  ) : (
                    <Empty>Sem despesas no período.</Empty>
                  )}
                </section>

                {/* 2. Despesas por Categoria (Imagem 5) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Despesas por categoria</h2>
                  </div>
                  {expenses.length > 0 ? (
                    <div className="kc-mob-donut-split">
                      <SimpleDonutRing
                        totalLabel={money(chartAnalytics.totalExp)}
                        subLabel="Total"
                        segments={expenses.map((e) => ({
                          label: e.name,
                          value: cents(e.value),
                          color: getCategoryVisual(e.name, "expense").solid,
                        }))}
                      />
                      <div className="kc-mob-donut-legend">
                        {expenses.map((e) => (
                          <div key={e.name} className="kc-mob-legend-item">
                            <span
                              className="kc-mob-legend-dot"
                              style={{ background: getCategoryVisual(e.name, "expense").solid }}
                            />
                            <span>{e.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty>Sem despesas no período.</Empty>
                  )}
                </section>

                {/* 3. Despesas por Recorrência: Fixas vs Parceladas vs Avulsas (Imagem 4) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Despesas por recorrência</h2>
                  </div>
                  <SimpleDonutRing
                    totalLabel={money(chartAnalytics.totalExp)}
                    subLabel="Total"
                    segments={[
                      { label: "Fixas", value: chartAnalytics.fixedExp, color: "#1877F2" },
                      { label: "Parceladas", value: chartAnalytics.installmentExp, color: "#F59E0B" },
                      { label: "Avulsas", value: chartAnalytics.singleExp, color: "#FE6803" },
                    ]}
                  />
                  <div className="kc-mob-breakdown-box">
                    <button
                      type="button"
                      className="kc-mob-breakdown-row"
                      onClick={() => {
                        setFilter("expense");
                        navigateTo("movements", null);
                      }}
                    >
                      <span className="kc-mob-legend-dot" style={{ background: "#1877F2" }} />
                      <span className="kc-mob-bd-name">Fixas</span>
                      <strong>{money(chartAnalytics.fixedExp)} ›</strong>
                    </button>
                    <button
                      type="button"
                      className="kc-mob-breakdown-row"
                      onClick={() => {
                        setFilter("expense");
                        navigateTo("movements", null);
                      }}
                    >
                      <span className="kc-mob-legend-dot" style={{ background: "#F59E0B" }} />
                      <span className="kc-mob-bd-name">Parceladas</span>
                      <strong>{money(chartAnalytics.installmentExp)} ›</strong>
                    </button>
                    {chartAnalytics.singleExp > 0 && (
                      <button
                        type="button"
                        className="kc-mob-breakdown-row"
                        onClick={() => {
                          setFilter("expense");
                          navigateTo("movements", null);
                        }}
                      >
                        <span className="kc-mob-legend-dot" style={{ background: "#FE6803" }} />
                        <span className="kc-mob-bd-name">Avulsas</span>
                        <strong>{money(chartAnalytics.singleExp)} ›</strong>
                      </button>
                    )}
                  </div>
                </section>

                {/* 4. Despesas Débito/Conta x Crédito (Imagem 3) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Despesas Conta x Cartão</h2>
                  </div>
                  <SimpleDonutRing
                    totalLabel={money(chartAnalytics.totalExp)}
                    subLabel="Total"
                    segments={[
                      { label: "Conta / Débito", value: chartAnalytics.debitExp, color: "#E04F44" },
                      { label: "Cartão de crédito", value: chartAnalytics.cardExp, color: "#1877F2" },
                    ]}
                  />
                  <div className="kc-mob-breakdown-box">
                    <button
                      type="button"
                      className="kc-mob-breakdown-row"
                      onClick={() => {
                        setFilter("expense");
                        navigateTo("movements", null);
                      }}
                    >
                      <span className="kc-mob-legend-dot" style={{ background: "#E04F44" }} />
                      <span className="kc-mob-bd-name">Conta / Débito</span>
                      <strong>{money(chartAnalytics.debitExp)} ›</strong>
                    </button>
                    <button
                      type="button"
                      className="kc-mob-breakdown-row"
                      onClick={() => navigateTo("overview", "cards")}
                    >
                      <span className="kc-mob-legend-dot" style={{ background: "#1877F2" }} />
                      <span className="kc-mob-bd-name">Cartão de crédito</span>
                      <strong>{money(chartAnalytics.cardExp)} ›</strong>
                    </button>
                  </div>
                </section>
              </>
            )}

            {chartsTab === "income" && (
              <>
                {/* Aba Receitas (Imagem 1) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Receitas por categoria</h2>
                  </div>
                  {chartAnalytics.incByCat.length > 0 ? (
                    <div className="kc-mob-donut-split">
                      <SimpleDonutRing
                        totalLabel={money(chartAnalytics.totalInc)}
                        subLabel="Total"
                        segments={chartAnalytics.incByCat.map((i) => ({
                          label: i.name,
                          value: i.value,
                          color: getCategoryVisual(i.name, "income").solid,
                        }))}
                      />
                      <div className="kc-mob-donut-legend">
                        {chartAnalytics.incByCat.map((i) => (
                          <div key={i.name} className="kc-mob-legend-item">
                            <span
                              className="kc-mob-legend-dot"
                              style={{ background: getCategoryVisual(i.name, "income").solid }}
                            />
                            <span>{i.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty>Sem receitas registradas no período.</Empty>
                  )}
                </section>

                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Receitas por recorrência</h2>
                  </div>
                  <SimpleDonutRing
                    totalLabel={money(chartAnalytics.totalInc)}
                    subLabel="Total"
                    segments={[
                      { label: "Recorrentes", value: chartAnalytics.fixedInc, color: "#16A34A" },
                      { label: "Avulsas", value: chartAnalytics.singleInc, color: "#1877F2" },
                    ]}
                  />
                  <div className="kc-mob-breakdown-box">
                    <div className="kc-mob-breakdown-row">
                      <span className="kc-mob-legend-dot" style={{ background: "#16A34A" }} />
                      <span className="kc-mob-bd-name">Fixas / Salário</span>
                      <strong>{money(chartAnalytics.fixedInc)}</strong>
                    </div>
                    <div className="kc-mob-breakdown-row">
                      <span className="kc-mob-legend-dot" style={{ background: "#1877F2" }} />
                      <span className="kc-mob-bd-name">Avulsas / Extra</span>
                      <strong>{money(chartAnalytics.singleInc)}</strong>
                    </div>
                  </div>
                </section>
              </>
            )}

            {chartsTab === "other" && (
              <>
                {/* Aba Outros / Detalhamento dos Cartões & Cortes (Imagem 2) */}
                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Detalhamento dos cartões</h2>
                  </div>
                  <SimpleDonutRing
                    totalLabel={money(chartAnalytics.totalCardLimit)}
                    subLabel="Limite total"
                    segments={[
                      { label: "Em aberto", value: chartAnalytics.totalCardUsed, color: "#FE6803" },
                      { label: "Disponível", value: chartAnalytics.totalCardAvail, color: "#D1D5DB" },
                    ]}
                  />
                  <div className="kc-mob-cc-stats3" style={{ marginTop: 14 }}>
                    <div>
                      <span>● Limite</span>
                      <strong>{money(chartAnalytics.totalCardLimit)}</strong>
                    </div>
                    <div className="is-center">
                      <span style={{ color: "#FE6803" }}>● Em aberto</span>
                      <strong>{money(chartAnalytics.totalCardUsed)}</strong>
                    </div>
                    <div className="is-right">
                      <span>● Limite disp.</span>
                      <strong>{money(chartAnalytics.totalCardAvail)}</strong>
                    </div>
                  </div>

                  <div className="kc-mob-breakdown-box" style={{ marginTop: 14 }}>
                    <div className="kc-mob-breakdown-row">
                      <span className="kc-mob-bd-name">Efetivadas</span>
                      <strong className="is-green">{money(summary.payable.settled)}</strong>
                    </div>
                    <div className="kc-mob-breakdown-row">
                      <span className="kc-mob-bd-name">Pendentes</span>
                      <strong style={{ color: "#D97706" }}>{money(pendingExpenseTotalCents)}</strong>
                    </div>
                    <div className="kc-mob-breakdown-row">
                      <span className="kc-mob-bd-name">Total faturas</span>
                      <strong>{money(chartAnalytics.totalCardUsed)}</strong>
                    </div>
                  </div>
                </section>

                <section className="kc-mob-card">
                  <div className="kc-mob-card-head">
                    <h2>Evolução receitas x despesas</h2>
                  </div>
                  {months.length > 0 ? (
                    <FinanceChart type="bar" data={months} height={220} />
                  ) : (
                    <Empty>Sem movimentos no período.</Empty>
                  )}
                </section>
              </>
            )}

            {/* Barra Inferior de Abas da Tela de Gráficos (Imagens 1 a 6) */}
            <nav className="kc-mob-charts-bottom-bar" aria-label="Categorias de gráficos">
              <button
                type="button"
                className={`kc-mob-chart-tab is-expense${chartsTab === "expenses" ? " active" : ""}`}
                onClick={() => setChartsTab("expenses")}
              >
                <span className="kc-mob-chart-tab-pill">
                  <Minus size={16} strokeWidth={3} />
                </span>
                <span>Despesas</span>
              </button>

              <button
                type="button"
                className={`kc-mob-chart-tab is-income${chartsTab === "income" ? " active" : ""}`}
                onClick={() => setChartsTab("income")}
              >
                <span className="kc-mob-chart-tab-pill">
                  <Plus size={16} strokeWidth={3} />
                </span>
                <span>Receitas</span>
              </button>

              <button
                type="button"
                className={`kc-mob-chart-tab is-other${chartsTab === "other" ? " active" : ""}`}
                onClick={() => setChartsTab("other")}
              >
                <span className="kc-mob-chart-tab-pill">
                  <TrendingUp size={16} />
                </span>
                <span>Cartões & Fluxo</span>
              </button>
            </nav>
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

      {/* ================= MENU LATERAL (NAVIGATION DRAWER) ================= */}
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

              <div className="kc-mob-drawer-section-label">Planejar</div>

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
                onClick={() => navigateTo("planning", null, "overview")}
              >
                <Target size={20} />
                <span>Planejamentos</span>
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

      {/* ================= FAB (+) & SPEED DIAL CONTEXTUAL KUANTOCONTA ================= */}
      {fabOpen && (
        <div
          className="kc-mob-fab-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFabOpen(false);
          }}
        >
          <div className="kc-mob-speed-dial" role="menu" aria-label="Adicionar lançamento">
            {effectiveView === "planning" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="kc-mob-sd-item"
                  onClick={() => {
                    setFabOpen(false);
                    open("capital_goal");
                  }}
                >
                  <span className="kc-mob-sd-icon is-orange">
                    <Plus size={19} strokeWidth={2.5} />
                  </span>
                  <strong>Nova caixinha</strong>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="kc-mob-sd-item"
                  onClick={() => {
                    setFabOpen(false);
                    openReserveCaixinha();
                  }}
                >
                  <span className="kc-mob-sd-icon is-green">
                    <PiggyBank size={18} />
                  </span>
                  <strong>Guardar</strong>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="kc-mob-sd-item"
                  onClick={() => {
                    setFabOpen(false);
                    setPlanChoiceOpen(true);
                  }}
                >
                  <span className="kc-mob-sd-icon is-amber">
                    <Compass size={18} />
                  </span>
                  <strong>Planejar</strong>
                </button>
              </>
            ) : (
              <>
                {effectiveView === "cards" && (
                  <button
                    type="button"
                    role="menuitem"
                    className="kc-mob-sd-item"
                    onClick={() => {
                      setFabOpen(false);
                      open("credit_card");
                    }}
                  >
                    <span className="kc-mob-sd-icon is-orange">
                      <CreditCard size={18} />
                    </span>
                    <strong>Cartão de Crédito</strong>
                  </button>
                )}

                {effectiveView === "budgets" && (
                  <button
                    type="button"
                    role="menuitem"
                    className="kc-mob-sd-item"
                    onClick={() => {
                      setFabOpen(false);
                      setActionMenu("budget_pick");
                    }}
                  >
                    <span className="kc-mob-sd-icon is-orange">
                      <Percent size={18} />
                    </span>
                    <strong>Novo Orçamento</strong>
                  </button>
                )}

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
                  <strong>A pagar</strong>
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
                  <strong>A receber</strong>
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
                  <span className="kc-mob-sd-icon is-orange">
                    <CreditCard size={18} />
                  </span>
                  <strong>Despesa cartão</strong>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="kc-mob-sd-item"
                  onClick={() => {
                    setFabOpen(false);
                    open("title", null, "lend");
                  }}
                >
                  <span className="kc-mob-sd-icon is-purple">
                    <HandCoins size={18} />
                  </span>
                  <strong>Emprestar</strong>
                </button>

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
                  <strong>Transferir</strong>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="kc-mob-sd-item"
                  onClick={() => {
                    setFabOpen(false);
                    openReserveCaixinha();
                  }}
                >
                  <span className="kc-mob-sd-icon is-green">
                    <PiggyBank size={18} />
                  </span>
                  <strong>Guardar em caixinha</strong>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {planChoiceOpen && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPlanChoiceOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="O que você quer planejar?">
            <div className="dialog-head">
              <h2>O que você quer planejar?</h2>
              <button type="button" className="dialog-close" onClick={() => setPlanChoiceOpen(false)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="action-menu">
              <button
                type="button"
                onClick={() => {
                  setPlanChoiceOpen(false);
                  open("goal_sim");
                }}
              >
                <span>
                  <strong>Planejar compra ou viagem</strong>
                  <small>Simule parcelamento, entrada e veja se cabe no seu caixa</small>
                </span>
                <span>›</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlanChoiceOpen(false);
                  setPlanningTab("cuts");
                }}
              >
                <span>
                  <strong>Planejar cortes no orçamento</strong>
                  <small>Escolha contas ou recorrências para cortar e simule seu fluxo até 31/12</small>
                </span>
                <span>›</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {effectiveView !== "charts" && (
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
      )}
    </div>
  );
}
