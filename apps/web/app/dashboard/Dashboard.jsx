"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  ArrowDown,
  ArrowUp,
  Coins,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  Wallet,
  Landmark,
  TrendingUp,
  AlertTriangle,
  LogOut,
  X,
  Info,
  HeartPulse,
  Check,
  Bell,
  Compass,
  Trash2,
  Scissors,
  Eye,
  Target,
  LayoutGrid,
  ArrowLeftRight,
  CalendarRange,
  User,
  HandCoins,
  CreditCard,
  PiggyBank,
  Award,
  ExternalLink,
  Plane,
  ShoppingBag,
  ListChecks,
  Columns3,
} from "lucide-react";
import { authClient } from "../../lib/auth/client";
import { money, cents, brDay, isoDate } from "../../lib/finance";
import { computeRange, lastDayOfMonth, firstDayOfMonth, moveMonth, inRange } from "../../lib/period";
import { computeMonthlyIncomeCeilingCents, computeProjectedBalanceWithBudgetsCents, computeSafeMonthlyContributionCents, computeTotalDebtCents } from "../../lib/budgets";
import { buildNotifications } from "../../lib/notifications";
import { buildExecutionTitlesFromGoal, comparePlanningQuotes, compareSavedPlans, simulateGoalPurchase } from "../../lib/goal-planner";
import { computeCapitalPace } from "../../lib/capital-pace";
import { analyzeConsumptionHabits } from "../../lib/habit-analyzer";
import { rolloverOverdueLoanRepayments, summarizePeopleLoans } from "../../lib/lending";
import { consolidateCreditCardTitles, computeCardUsage, computeInvoiceCycleForPurchase } from "../../lib/credit-cards";
import { maskToCents, maskToDecimal, centsToMask } from "../../lib/money-input";
import { expandRecurring } from "../../lib/recurring";
import { buildFinancialHealthPlan } from "../../lib/financial-health";
import EntryDrawer from "./EntryDrawer";
import MoneyInput from "./MoneyInput";
import PaymentSplitEditor, { serializeSplitRow } from "./PaymentSplitEditor";
import { normalizeFormQuotes } from "./PlanningWizard";
import MovementList from "./MovementList";
import BudgetList from "./BudgetList";
import CancelScopeDialog from "./CancelScopeDialog";
import FinanceChart from "./FinanceChart";
import HealthDiagnosisCard from "./HealthDiagnosisCard";
import PlanningGoalsPanel from "./PlanningGoalsPanel";
import DesktopWorkspace from "./DesktopWorkspace";
import MobileWorkspace from "./MobileWorkspace";
import { DEFAULT_DESKTOP_COLUMNS, sanitizeColumnSettings, sanitizeWorkspaceColumns } from "../../lib/workspace-columns";
import GuidedTour from "./GuidedTour";
import BankIcon from "./BankIcon";
import McpConnectionsCard from "./McpConnectionsCard";
import ManageWalletsModal from "./ManageWalletsModal";
import CreditCardInvoiceModal from "./CreditCardInvoiceModal";
import InstallAppCard from "../components/InstallAppCard";
import { usePwa } from "../components/PwaProvider";

const TABS = [
  ["overview", "Visão geral"],
  ["movements", "Movimentos"],
  ["budgets", "Orçamentos"],
  ["planning", "Planejamento"],
  ["patrimony", "Meu Capital"],
  ["health", "Saúde financeira"],
];

const TAB_ICONS = {
  overview: LayoutGrid,
  movements: ArrowLeftRight,
  budgets: SlidersHorizontal,
  planning: Compass,
  patrimony: Landmark,
  health: HeartPulse,
  profile: User,
};

const CATS = {
  expense: ["Moradia", "Alimentação", "Transporte", "Saúde", "Lazer", "Educação", "Assinaturas", "Empréstimos", "Outros"],
  income: ["Salário", "Renda extra", "Benefícios", "Rendimentos", "Reembolsos", "Outros"],
};

const TODAY = brDay();
const END = TODAY.slice(0, 4) + "-12-31";
const fmtDate = (d) => {
  const s = isoDate(d).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : "—";
};
const ymLabel = (m) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
const display = (v) => (v === null || v === undefined ? "A calcular" : money(v));

async function request(method = "GET", body = null) {
  const res = await fetch("/api/portfolio", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.replace("/auth/sign-in");
    throw new Error("Sessão expirada. Redirecionando para o login...");
  }
  const reply = await res.json().catch(() => ({ error: "Resposta inesperada." }));
  if (!res.ok) throw new Error(reply.error || "Não foi possível concluir.");
  return reply;
}

const defaultForm = (kind = "expense") => ({
  intent: "spent",
  description: "",
  amount: "",
  direction: kind,
  category: "",
  occurredOn: TODAY,
  dueOn: TODAY,
  settlementState: kind === "expense" ? "paid" : "pending",
  settledOn: TODAY,
  plannedMonth: TODAY.slice(0, 7),
  plannedFor: "",
  spendingPlanId: "",
  closeSpendingPlan: true,
  mode: "single",
  count: "6",
  startIndex: "1",
  valueMode: "total",
  walletId: "",
  walletKind: "checking",
  fromWalletId: "",
  toWalletId: "",
  transferredOn: TODAY,
  loanPrincipal: "0,00",
  loanReceivedOn: TODAY,
  loanCreditWallet: true,
  loanCount: "12",
  goalId: null,
  goalPlanType: "purchase",
  goalBudgetCategoryId: "",
  goalWizardStep: 1,
  goalActiveQuoteIdx: 0,
  goalQuotes: null,
  goalTarget: "2.500,00",
  goalDownPayment: "0,00",
  goalInstallments: "1",
  goalDesiredOn: TODAY,
  goalPaymentMethod: "standard",
  goalCreditCardId: "",
  name: "",
  balance: "0,00",
  label: "",
  keepOpen: false,
  idempotencyKey: "",
});

function Empty({ children }) {
  return (
    <div className="empty">
      <Info size={18} />
      <span>{children}</span>
    </div>
  );
}

const defaultScreenFilters = () => ({
  overview: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), showPlanned: true, showRealized: true, showCategories: true, debtMode: "all_commitments" },
  movements: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), direction: "all", status: "all" },
  budgets: { rangeStart: TODAY, date: lastDayOfMonth(TODAY) },
  planning: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), onlyFeasible: false },
  patrimony: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), walletKind: "all" },
  health: { rangeStart: TODAY, date: lastDayOfMonth(TODAY) },
});

export default function Dashboard({ user }) {
  const { clearCachesOnSignOut } = usePwa();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);
  const [active, setActive] = useState("overview");
  const [screenFilters, setScreenFilters] = useState(defaultScreenFilters);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [query, setQuery] = useState("");
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState("");
  const [actionMenu, setActionMenu] = useState(null); // "create" | "budget_pick" | null
  const [filterOpen, setFilterOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedCaixinha, setSelectedCaixinha] = useState(null);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [healthModal, setHealthModal] = useState(null); // "diagnosis" | "dedoduro" | "tesouraco" | "milestones" | null
  const [tourOpen, setTourOpen] = useState(false);
  const [manageWalletsOpen, setManageWalletsOpen] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null); // { cardId, month } | null
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(false);
  const [isMobilePhone, setIsMobilePhone] = useState(false);
  const [desktopColumns, setDesktopColumns] = useState(DEFAULT_DESKTOP_COLUMNS);
  const [columnSettings, setColumnSettings] = useState({});
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [focusColumnKey, setFocusColumnKey] = useState(null);
  const [evolutionModalOpen, setEvolutionModalOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [batchExecutePlan, setBatchExecutePlan] = useState(null);
  const [checkoutListPlan, setCheckoutListPlan] = useState(null);
  const [inlineListItemText, setInlineListItemText] = useState("");
  const filterRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqDesktop = window.matchMedia("(min-width: 1024px)");
    const mqMobile = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      const w = window.innerWidth || 0;
      setIsDesktopWorkspace(mqDesktop.matches || w >= 1024);
      setIsMobilePhone(mqMobile.matches || (w > 0 && w <= 767));
    };
    sync();
    mqDesktop.addEventListener("change", sync);
    mqMobile.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mqDesktop.removeEventListener("change", sync);
      mqMobile.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = `kc_desktop_workspace_${user?.email || "user"}`;
    if (data?.workspacePrefs?.desktopColumns) {
      const cols = sanitizeWorkspaceColumns(data.workspacePrefs.desktopColumns);
      const cfg = sanitizeColumnSettings(data.workspacePrefs.columnSettings);
      setDesktopColumns(cols);
      setColumnSettings(cfg);
      window.localStorage.setItem(storageKey, JSON.stringify({ desktopColumns: cols, columnSettings: cfg }));
      return;
    }
    try {
      const cached = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (cached?.desktopColumns) {
        setDesktopColumns(sanitizeWorkspaceColumns(cached.desktopColumns));
        setColumnSettings(sanitizeColumnSettings(cached.columnSettings));
      }
    } catch {}
  }, [data?.workspacePrefs, user?.email]);

  const persistWorkspacePrefs = (nextCols, nextSettings) => {
    if (typeof window !== "undefined") {
      const storageKey = `kc_desktop_workspace_${user?.email || "user"}`;
      window.localStorage.setItem(storageKey, JSON.stringify({ desktopColumns: nextCols, columnSettings: nextSettings }));
    }
    request("POST", {
      action: "save_workspace_prefs",
      desktopColumns: nextCols,
      columnSettings: nextSettings,
    }).catch(() => {});
  };

  const handleChangeColumns = (nextCols, focusKey = null) => {
    const clean = sanitizeWorkspaceColumns(nextCols);
    setDesktopColumns(clean);
    if (focusKey) setFocusColumnKey(focusKey);
    persistWorkspacePrefs(clean, columnSettings);
  };

  const handleChangeColumnSettings = (nextSettings) => {
    const clean = sanitizeColumnSettings(nextSettings);
    setColumnSettings(clean);
    persistWorkspacePrefs(desktopColumns, clean);
  };

  useEffect(() => {
    if (!data || loading) return;
    const hasEntries = (data.titles?.length || 0) > 0 || (data.recurringRules?.length || 0) > 0;
    const key = `kc_tour_done_${user?.email || "user"}`;
    if (!hasEntries && typeof window !== "undefined" && !window.localStorage.getItem(key)) {
      setTourOpen(true);
    }
  }, [data, loading, user?.email]);

  const curFilter = screenFilters[active] || screenFilters.overview;
  const rangeStart = curFilter.rangeStart || TODAY;
  const date = curFilter.date || lastDayOfMonth(TODAY);
  const setScreenFilter = (tabKey, patch) =>
    setScreenFilters((old) => ({ ...old, [tabKey]: { ...(old[tabKey] || {}), ...patch } }));
  const setRangeStart = (v) => setScreenFilter(active, { rangeStart: v });
  const setDate = (v) => setScreenFilter(active, { date: v });
  const filter = screenFilters.movements.direction || "all";
  const setFilter = (dir) => setScreenFilter("movements", { direction: dir });
  const showPlanned = screenFilters.overview.showPlanned !== false;
  const setShowPlanned = (v) => setScreenFilter("overview", { showPlanned: v });
  const showRealized = screenFilters.overview.showRealized !== false;
  const setShowRealized = (v) => setScreenFilter("overview", { showRealized: v });
  const showCategories = screenFilters.overview.showCategories !== false;
  const setShowCategories = (v) => setScreenFilter("overview", { showCategories: v });

  const lastRefreshRef = useRef(0);

  async function refresh() {
    lastRefreshRef.current = Date.now();
    try {
      const x = await request();
      setData(x);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();

    const syncIfStale = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastRefreshRef.current < 3000) return;
      refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") syncIfStale();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", syncIfStale);
    window.addEventListener("online", syncIfStale);
    window.addEventListener("pageshow", syncIfStale);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", syncIfStale);
      window.removeEventListener("online", syncIfStale);
      window.removeEventListener("pageshow", syncIfStale);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setActionMenu(null);
        setFilterOpen(false);
      }
    };
    const onDocClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, []);

  const expanded = useMemo(() => {
    const raw = expandRecurring(data || {}, rangeStart < TODAY ? rangeStart : TODAY, date < TODAY ? TODAY : date);
    return { ...raw, titles: rolloverOverdueLoanRepayments(raw.titles || [], TODAY) };
  }, [data, rangeStart, date]);
  const peopleLoans = useMemo(
    () => summarizePeopleLoans({ people: data?.people || [], titles: expanded?.titles || [] }),
    [data?.people, expanded?.titles]
  );
  const summary = useMemo(() => computeRange(expanded, rangeStart, date, TODAY), [expanded, rangeStart, date]);
  const healthPlan = useMemo(
    () => (data ? buildFinancialHealthPlan(data, { today: TODAY, previousSnapshot: data.latestHealthSnapshot || null }) : null),
    [data]
  );

  const allWallets = data?.wallets || [];
  const wallets = allWallets.filter((w) => !w.archived_at);
  const creditCards = (data?.creditCards || []).filter((c) => !c.archived_at);
  const debtMode = screenFilters.overview.debtMode || "all_commitments";
  const setDebtMode = (v) => setScreenFilter("overview", { debtMode: v });
  const titles = expanded?.titles || [];
  const selectedTitleObj = titles.find((x) => x.id === selectedTitle);
  const months = summary.months.map((m) => ({ ...m, label: ymLabel(m.month) }));
  const charts = months.length ? months : [];
  const expenses = Object.entries(summary.categoryTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const rows = titles
    .filter((t) => {
      if (!inRange(t.due_on, rangeStart, date)) return false;
      if (active === "movements") {
        if (filter !== "all" && t.direction !== filter) return false;
        const mStatus = screenFilters.movements.status || "all";
        const rem = cents(t.amount_cents) - cents(t.settled_cents);
        if (mStatus === "pending" && rem === 0) return false;
        if (mStatus === "done" && rem > 0) return false;
        if (mStatus === "late" && !(rem > 0 && isoDate(t.due_on) < TODAY)) return false;
      }
      if (query && !t.description.toLowerCase().includes(query.toLowerCase()) && !t.category.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      return true;
    })
    .sort((a, b) => isoDate(a.due_on).localeCompare(isoDate(b.due_on)));

  const overviewRows = rows.filter((x) => {
    const remaining = cents(x.amount_cents) - cents(x.settled_cents);
    if (remaining === 0 && !showRealized) return false;
    if (remaining > 0 && !showPlanned) return false;
    return remaining > 0 || showRealized;
  });

  const walletName = (id) => wallets.find((w) => w.id === id)?.name || "Conta";
  const walletBalance = (w) =>
    w.opening_balance_cents === null
      ? null
      : cents(w.opening_balance_cents) +
      (data?.settlements || [])
        .filter((x) => !x.reversed_at && x.wallet_id === w.id && w.opening_at && new Date(x.created_at) >= new Date(w.opening_at))
        .reduce((a, x) => a + (x.direction === "income" ? 1 : -1) * cents(x.amount_cents), 0);

  const selectedMonth = summary.targetMonth;
  const monthDate = new Date(`${selectedMonth}-15T12:00:00Z`);
  const monthLong = monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthOnly = monthDate.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const monthNavLabel = selectedMonth.slice(0, 4) === TODAY.slice(0, 4) ? monthOnly : `${monthOnly.slice(0, 3)}/${selectedMonth.slice(0, 4)}`;

  const monthlyIncomeCents = useMemo(
    () =>
      computeMonthlyIncomeCeilingCents({
        month: selectedMonth,
        titles: data?.titles || [],
        recurringRules: data?.recurringRules || [],
        cancelledRecurring: data?.cancelledRecurring || [],
      }),
    [selectedMonth, data]
  );
  const budgetItems = summary.budgetSummary || [];
  const allocatedBudgetCents = budgetItems.reduce((sum, b) => sum + (b.limitCents !== null ? Math.max(0, cents(b.limitCents)) : 0), 0);
  const remainingAllocableCents = Math.max(0, monthlyIncomeCents - allocatedBudgetCents);
  const capitalBudget = budgetItems.find((b) => /capital|reserva/i.test(b.categoryName));
  const isCaixinhaWallet = (w) =>
    Boolean(w?.parent_wallet_id) ||
    Boolean(w?.caixinha_purpose) ||
    Boolean(w?.is_reserved) ||
    w?.wallet_kind === "reserve" ||
    w?.wallet_kind === "investment";
  const checkingWallets = wallets.filter((w) => !isCaixinhaWallet(w));
  const walletBalanceMap = useMemo(() => {
    const map = {};
    for (const w of wallets) {
      map[w.id] = walletBalance(w);
    }
    return map;
  }, [wallets, data]);
  const checkingBalanceCents = useMemo(
    () => checkingWallets.reduce((sum, w) => sum + (walletBalance(w) ?? 0), 0),
    [wallets, data]
  );
  const capitalBalanceCents = useMemo(
    () => wallets.filter(isCaixinhaWallet).reduce((sum, w) => sum + (walletBalance(w) ?? 0), 0),
    [wallets, data]
  );
  const caixinhaBalance = (g) => {
    if (g?.wallet_id) {
      const w = wallets.find((x) => x.id === g.wallet_id);
      return w ? Math.max(0, walletBalance(w) ?? 0) : 0;
    }
    return Math.max(0, capitalBalanceCents);
  };
  const bankCaixinhasTotal = (bankId) =>
    (data?.goals || [])
      .filter((g) => g.category === "capital_goal" && g.status !== "cancelled" && g.parent_wallet_id === bankId && g.wallet_id)
      .reduce((s, g) => s + caixinhaBalance(g), 0);
  const activeCaixinhaWalletIds = new Set(
    (data?.goals || [])
      .filter((g) => g.category === "capital_goal" && g.status !== "cancelled" && g.wallet_id)
      .map((g) => String(g.wallet_id))
  );
  const reservedThisMonthCents = useMemo(
    () =>
      (data?.titles || [])
        .filter(
          (t) =>
            !t.cancelled_at &&
            t.entry_kind === "reserve_transfer" &&
            t.direction === "income" &&
            (!t.wallet_id || activeCaixinhaWalletIds.size === 0 || activeCaixinhaWalletIds.has(String(t.wallet_id))) &&
            isoDate(t.due_on).slice(0, 7) === selectedMonth
        )
        .reduce((s, t) => s + cents(t.settled_cents), 0),
    [data, selectedMonth]
  );
  const rangeRows = useMemo(
    () => titles.filter((t) => inRange(t.due_on, rangeStart, date)),
    [titles, rangeStart, date]
  );
  const selectedMonthRows = useMemo(
    () => titles.filter((t) => isoDate(t.due_on).slice(0, 7) === selectedMonth),
    [titles, selectedMonth]
  );
  const priorPendingNetCents = useMemo(() => {
    if (rangeStart <= TODAY) return 0;
    return titles.reduce((sum, t) => {
      if (t.cancelled_at) return sum;
      const kind = t.entry_kind || "standard";
      if (["transfer", "reserve_transfer"].includes(kind)) return sum;
      if (kind === "loan_out" && !t.credit_card_id) return sum;
      if (t.direction === "income" && (kind === "debt_payment" || kind === "loan_principal" || t.liability_id)) return sum;
      const due = isoDate(t.due_on);
      if (due >= rangeStart) return sum;
      const pending = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
      return sum + (t.direction === "income" ? pending : -pending);
    }, 0);
  }, [titles, rangeStart]);
  const projectedBalanceCents = useMemo(
    () =>
      computeProjectedBalanceWithBudgetsCents({
        openingOperationalCents: summary.knownCash ? checkingBalanceCents + priorPendingNetCents : 0,
        rows: rangeRows,
        settledRows: selectedMonthRows,
        budgetSummary: budgetItems,
      }),
    [summary.knownCash, checkingBalanceCents, priorPendingNetCents, rangeRows, selectedMonthRows, budgetItems]
  );
  const safeContribution = useMemo(
    () =>
      computeSafeMonthlyContributionCents({
        projectedBalanceCents,
        checkingBalanceCents,
        budgetSummary: budgetItems,
      }),
    [projectedBalanceCents, checkingBalanceCents, budgetItems]
  );
  const totalDebtCents = useMemo(
    () =>
      computeTotalDebtCents({
        titles: expanded?.titles || [],
        liabilities: data?.liabilities || [],
        knownCash: summary.knownCash,
        mode: debtMode,
        rangeStart,
        date,
        today: TODAY,
      }),
    [expanded, data, summary.knownCash, debtMode, rangeStart, date]
  );
  const notifications = useMemo(
    () =>
      buildNotifications({
        summary,
        healthPlan,
        titles: data?.titles || [],
        budgetSummary: budgetItems,
        today: TODAY,
      }),
    [summary, healthPlan, data, budgetItems]
  );
  const debtDisplay = totalDebtCents === null ? "A calcular" : money(totalDebtCents);
  const capitalGoals = (data?.goals || []).filter((g) => g.category === "capital_goal");
  const purchaseGoals = (data?.goals || []).filter((g) => g.category !== "capital_goal");
  const reserveCaixinhasCents = capitalGoals
    .filter((g) => (g.caixinha_purpose || "goal") === "reserve")
    .reduce((s, g) => s + (g.wallet_id ? caixinhaBalance(g) : 0), 0);
  const goalCaixinhasCents = Math.max(0, capitalBalanceCents - reserveCaixinhasCents);
  const capitalProjectedAtDateCents =
    capitalBalanceCents + (capitalBudget?.limitCents > 0 ? capitalBudget.limitCents * Math.max(1, months.length) : 0);
  const netWorthAtDateCents =
    summary.projectedCash === null ? null : summary.projectedCash + summary.assets - (totalDebtCents ?? 0);
  const habits = useMemo(
    () =>
      analyzeConsumptionHabits({
        rows,
        recurringRules: data?.recurringRules || [],
        budgetSummary: budgetItems,
      }),
    [rows, data, budgetItems]
  );

  async function addPerson(personPayload) {
    const res = await request("POST", { action: "person", ...personPayload });
    await refresh();
    return res?.person || { id: res?.id, ...personPayload };
  }

  async function archiveWallet({ sourceWalletId, targetWalletId, balanceAction }) {
    setBusy(true);
    setError("");
    try {
      await request("PATCH", { action: "archive_wallet", sourceWalletId, targetWalletId, balanceAction });
      await refresh();
      setNotice("Conta arquivada e compromissos migrados para a conta destino.");
    } finally {
      setBusy(false);
    }
  }

  async function unarchiveWallet(walletId) {
    setBusy(true);
    setError("");
    try {
      await request("PATCH", { action: "unarchive_wallet", walletId });
      await refresh();
      setNotice("Conta desarquivada com saldo zerado (R$ 0,00).");
    } finally {
      setBusy(false);
    }
  }

  async function payCreditCardInvoice({ creditCardId, invoiceMonth, walletId, amount, paidOn }) {
    setBusy(true);
    setError("");
    try {
      await request("PATCH", {
        action: "pay_credit_card_invoice",
        creditCardId,
        invoiceMonth,
        walletId,
        amount,
        paidOn,
      });
      await refresh();
      setNotice("Pagamento da fatura registrado e limite liberado.");
    } finally {
      setBusy(false);
    }
  }

  function open(kind, id, intentOverride = null) {
    if (kind === "card_expense" && creditCards.length === 0) {
      open("credit_card", null);
      return;
    }
    const isCardExpense = kind === "card_expense";
    const actualDrawer = isCardExpense || kind === "income" ? "title" : kind;
    const t = titles.find((item) => item.id === id);
    const dir = kind === "income" ? "income" : t?.direction || "expense";
    const nextIntent = intentOverride || "bill";
    const defaultChecking = checkingWallets[0]?.id || wallets[0]?.id || "";
    const secondChecking = checkingWallets.find((w) => w.id !== defaultChecking)?.id || "";
    const firstCard = isCardExpense ? creditCards[0] : null;
    setForm({
      ...defaultForm(dir),
      intent: nextIntent,
      settlementState: nextIntent === "transfer" ? "paid" : "pending",
      creditCardId: firstCard ? firstCard.id : "",
      walletId: firstCard?.default_wallet_id || t?.wallet_id || defaultChecking,
      fromWalletId: t?.wallet_id || defaultChecking,
      toWalletId: secondChecking,
      parentWalletId: defaultChecking,
      caixinhaPurpose: "goal",
      initialAmount: "",
      downPaymentSource: "checking",
      sourceGoalId: "",
      goalId: null,
      goalPlanType: "purchase",
      goalBudgetCategoryId: "",
      goalWizardStep: 1,
      goalActiveQuoteIdx: 0,
      goalQuotes: null,
      goalPaymentMethod: "standard",
      goalCreditCardId: creditCards[0]?.id || "",
      transferredOn: TODAY,
      lentOn: TODAY,
      expectedRepaymentOn: lastDayOfMonth(TODAY),
      lendCreditCardId: "",
      lendCardInstallments: 1,
      lendRepaymentCount: 1,
      lendRepaymentWalletId: t?.wallet_id || defaultChecking,
      category: t?.category || "",
      amount:
        kind === "settle" && t
          ? centsToMask(Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)))
          : "",
      direction: dir,
      currentCapitalCents: capitalBalanceCents,
      monthlyCapitalContributionCents: capitalBudget?.limitCents || 0,
      idempotencyKey: crypto.randomUUID(),
    });
    setSelectedTitle(id || null);
    setError("");
    setDrawer(actualDrawer);
  }

  function openBudget(item) {
    setForm({
      ...defaultForm("expense"),
      category: item.categoryName,
      budgetCategoryId: item.categoryId,
      budgetMonth: selectedMonth,
      budgetActive: item.limitCents !== null,
      budgetVersion: item.version,
      amount: item.limitCents !== null ? centsToMask(item.limitCents) : "",
    });
    setSelectedTitle(item.categoryId);
    setError("");
    setDrawer("budget");
  }

  function openReserveCaixinha(caixinha = null) {
    const target = caixinha || capitalGoals[0] || null;
    const bankId = target?.parent_wallet_id || checkingWallets[0]?.id || wallets[0]?.id || "";
    setForm({
      ...defaultForm("expense"),
      caixinhaId: target?.id || "",
      fromWalletId: bankId,
      reserveBankFilter: "",
      reserveDirection: "deposit",
      transferredOn: TODAY,
      amount: "",
      idempotencyKey: crypto.randomUUID(),
    });
    setSelectedTitle(null);
    setError("");
    setDrawer("reserve_caixinha");
  }

  function editTitle(id, duplicate = false) {
    const t = titles.find((x) => x.id === id);
    if (!t) return;
    setForm({
      ...defaultForm(t.direction),
      description: duplicate ? t.description.replace(/ \(\d+\/\d+\)$/, "") : t.description,
      amount: centsToMask(cents(t.amount_cents)),
      direction: t.direction,
      category: t.category,
      walletId: t.wallet_id,
      occurredOn: isoDate(t.due_on),
      dueOn: isoDate(t.due_on),
      settlementState: duplicate ? (t.direction === "expense" ? "paid" : "pending") : "pending",
      mode: "single",
    });
    setSelectedTitle(duplicate ? null : id);
    setError("");
    setDrawer(duplicate ? "title" : "edit");
  }

  async function saveGoal(payload) {
    setBusy(true);
    setError("");
    try {
      await request("POST", { action: "goal", ...payload });
      await refresh();
      setNotice("Simulação salva sem gerar cobranças reais.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveGoalItems(goal, nextItems, extra = {}) {
    if (!goal?.id) return;
    setSelectedGoal((old) => {
      if (!old || old.raw.id !== goal.id) return old;
      const curQuotes = Array.isArray(old.raw.quotes_json) ? old.raw.quotes_json : [];
      const first = curQuotes[0] || { id: "q-1", label: "Lista principal", isChosen: true };
      const nextQuotes = [{ ...first, items: nextItems }, ...curQuotes.slice(1)];
      return { ...old, raw: { ...old.raw, quotes_json: nextQuotes } };
    });
    try {
      await request("PATCH", {
        action: "update_goal_items",
        goalId: goal.id,
        items: nextItems,
        ...extra,
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function reuseGoalList(goal) {
    if (!goal?.id) return;
    const curQuotes = Array.isArray(goal.quotes_json) ? goal.quotes_json : [];
    const curItems = Array.isArray(curQuotes[0]?.items) ? curQuotes[0].items : [];
    const unchecked = curItems.map((it) => ({ ...it, checked: false }));
    const nextMonthDate = moveMonth((isoDate(goal.desired_on) || TODAY).slice(0, 7), 1) + "-" + (isoDate(goal.desired_on) || TODAY).slice(8, 10);
    const nextDesiredOn = nextMonthDate > TODAY ? nextMonthDate : TODAY;
    setBusy(true);
    setError("");
    try {
      await request("PATCH", {
        action: "update_goal_items",
        goalId: goal.id,
        items: unchecked,
        desiredOn: nextDesiredOn,
        resetStatus: true,
      });
      await refresh();
      setSelectedGoal(null);
      setNotice(`Lista "${goal.title}" reiniciada para ${fmtDate(nextDesiredOn)}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function executeBatchTitles(e) {
    e.preventDefault();
    if (!batchExecutePlan || busy) return;
    const chosen = batchExecutePlan.items.filter((it) => it.selected && it.amountCents > 0);
    if (!chosen.length) {
      setError("Selecione ao menos um item com valor para lançar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      for (const it of chosen) {
        const effectiveDue = it.dueOn || batchExecutePlan.dueOn || TODAY;
        await request("POST", {
          action: "title",
          walletId: it.walletId || checkingWallets[0]?.id || wallets[0]?.id,
          creditCardId: it.paymentMethod === "credit_card" ? it.creditCardId : null,
          direction: "expense",
          description: it.description,
          category: it.category || batchExecutePlan.category || "Outros",
          amount: (it.amountCents / 100).toFixed(2),
          occurredOn: TODAY,
          dueOn: effectiveDue,
          mode: it.installmentCount > 1 ? "installments" : "single",
          valueMode: "total",
          count: it.installmentCount > 1 ? String(it.installmentCount) : "1",
          startIndex: "1",
          settlementState: "pending",
          idempotencyKey: crypto.randomUUID(),
        });
      }
      if (batchExecutePlan.markFulfilled) {
        await request("PATCH", { action: "fulfill_goal", goalId: batchExecutePlan.goal.id });
      }
      await refresh();
      setBatchExecutePlan(null);
      setNotice(`${chosen.length} lançamento(s) criado(s) individualmente com sucesso.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCheckoutList(e) {
    e.preventDefault();
    if (!checkoutListPlan || busy) return;
    const amtCents = maskToCents(checkoutListPlan.amountMask || "0,00");
    if (amtCents <= 0) {
      setError("Informe o valor total pago no caixa.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const paidDay = checkoutListPlan.paidOn || TODAY;
      const cat = checkoutListPlan.category || "Alimentação";
      if (checkoutListPlan.splitMode && Array.isArray(checkoutListPlan.splits) && checkoutListPlan.splits.length > 0) {
        const serialized = checkoutListPlan.splits.map((r) => serializeSplitRow(r, checkingWallets[0]?.id || wallets[0]?.id || ""));
        const splitTotal = serialized.reduce((s, sp) => s + sp.amountCents, 0);
        if (splitTotal !== amtCents) {
          setError("A soma das formas de pagamento deve fechar exatamente com o valor pago no caixa.");
          setBusy(false);
          return;
        }
        for (let i = 0; i < serialized.length; i++) {
          const sp = serialized[i];
          const isCard = sp.paymentMethod === "credit_card" && Boolean(sp.creditCardId);
          await request("POST", {
            action: "title",
            walletId: sp.walletId || checkingWallets[0]?.id || wallets[0]?.id,
            creditCardId: isCard ? sp.creditCardId : null,
            direction: "expense",
            description: serialized.length > 1 ? `${checkoutListPlan.goal.title} (${i + 1}/${serialized.length})` : checkoutListPlan.goal.title,
            category: cat,
            amount: (sp.amountCents / 100).toFixed(2),
            occurredOn: paidDay,
            dueOn: paidDay,
            mode: "single",
            settlementState: isCard ? "pending" : "paid",
            settledOn: isCard ? null : paidDay,
            idempotencyKey: crypto.randomUUID(),
          });
        }
      } else {
        const isCard = Boolean(checkoutListPlan.creditCardId);
        await request("POST", {
          action: "title",
          walletId: checkoutListPlan.walletId || checkingWallets[0]?.id || wallets[0]?.id,
          creditCardId: isCard ? checkoutListPlan.creditCardId : null,
          direction: "expense",
          description: checkoutListPlan.goal.title,
          category: cat,
          amount: (amtCents / 100).toFixed(2),
          occurredOn: paidDay,
          dueOn: paidDay,
          mode: "single",
          settlementState: isCard ? "pending" : "paid",
          settledOn: isCard ? null : paidDay,
          idempotencyKey: crypto.randomUUID(),
        });
      }
      await request("PATCH", { action: "fulfill_goal", goalId: checkoutListPlan.goal.id });
      await refresh();
      setCheckoutListPlan(null);
      setNotice(`Compra "${checkoutListPlan.goal.title}" registrada em ${cat}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelGoal(goalId, isCaixinha = false) {
    setBusy(true);
    setError("");
    try {
      await request("PATCH", { action: "cancel_goal", goalId });
      await refresh();
      setNotice(isCaixinha ? "Caixinha removida." : "Planejamento de compra removido.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function fulfillPlan(plan, categoryName) {
    setForm({
      ...defaultForm("expense"),
      intent: "spent",
      description: plan.description,
      amount: centsToMask(plan.remainingCents ?? cents(plan.estimated_amount_cents)),
      category: categoryName || "",
      walletId: wallets[0]?.id || "",
      occurredOn: TODAY,
      settledOn: TODAY,
      dueOn: TODAY,
      settlementState: "paid",
      spendingPlanId: plan.id,
      closeSpendingPlan: true,
      idempotencyKey: crypto.randomUUID(),
    });
    setSelectedTitle(null);
    setError("");
    setDrawer("title");
  }

  function editPlan(plan) {
    setForm({
      ...defaultForm("expense"),
      planId: plan.id,
      description: plan.description,
      amount: centsToMask(cents(plan.estimated_amount_cents)),
      plannedMonth: plan.planned_month || TODAY.slice(0, 7),
      plannedFor: plan.planned_for ? isoDate(plan.planned_for) : "",
    });
    setSelectedTitle(plan.id);
    setError("");
    setDrawer("edit_plan");
  }

  function cancelPlan(planId) {
    setConfirmDialog({
      title: "Cancelar previsão de gasto?",
      body: "Nenhuma compra já realizada será alterada.",
      confirmLabel: "Cancelar previsão",
      onConfirm: async () => {
        setBusy(true);
        setError("");
        try {
          await request("PATCH", { action: "cancel_spending_plan", planId });
          await refresh();
          setNotice("Previsão cancelada.");
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  }

  const field = (name, val) => setForm((old) => ({ ...old, [name]: val }));

  async function addCategory(payload) {
    await request("POST", { action: "category", ...payload });
    await refresh();
  }

  async function materializeIfVirtual(id) {
    if (!String(id || "").startsWith("rec:")) return id;
    const response = await request("POST", { action: "materialize", occurrenceId: id });
    if (!response.id) throw new Error("Não foi possível registrar esta ocorrência.");
    return response.id;
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (drawer === "settle") {
        const titleId = await materializeIfVirtual(selectedTitle);
        await request("PATCH", {
          action: "settle",
          titleId,
          amount: maskToDecimal(form.amount),
          settledOn: form.settledOn,
          idempotency: crypto.randomUUID(),
        });
      } else if (drawer === "wallet") {
        await request("POST", {
          action: "wallet",
          name: form.name,
          balance: maskToDecimal(form.balance, { allowNegative: true }),
          walletKind: "checking",
          liquidityKind: "immediate",
          isReserved: false,
        });
      } else if (drawer === "reserve_caixinha") {
        await request("POST", {
          action: "reserve_caixinha",
          goalId: form.caixinhaId,
          fromWalletId: form.fromWalletId,
          amount: maskToDecimal(form.amount),
          transferredOn: form.transferredOn || TODAY,
          direction: form.reserveDirection || "deposit",
        });
      } else if (drawer === "loan") {
        await request("POST", {
          action: "loan",
          description: form.description,
          principal: maskToDecimal(form.loanPrincipal || "0,00"),
          receivedOn: form.loanReceivedOn || TODAY,
          creditWallet: form.loanCreditWallet !== false,
          walletId: form.walletId,
          installmentCount: Number(form.loanCount || 12),
          installmentAmount: maskToDecimal(form.amount),
          firstDueOn: form.dueOn || TODAY,
        });
      } else if (drawer === "goal_sim") {
        const rawQuotes = normalizeFormQuotes(form, checkingWallets, creditCards);
        const toCentsSafe = (v) => {
          try {
            return maskToCents(v || "0,00");
          } catch {
            return 0;
          }
        };
        const serializedQuotes = rawQuotes.map((q) => {
          const itemsSum = (q.items || []).reduce((s, it) => s + cents(it.amountCents), 0);
          const targetCents = itemsSum > 0 ? itemsSum : toCentsSafe(q.target);
          const downPaymentCents =
            q.paymentStructure === "hybrid" ? Math.min(targetCents, toCentsSafe(q.downPayment)) : 0;
          const instCount =
            q.paymentStructure === "upfront" ? 1 : Math.max(1, Math.min(120, Number(q.installmentCount || 1)));
          const interestBps = Math.min(
            10000,
            Math.max(0, Math.round(Number(String(q.interestPct || "0").replace(",", ".")) * 100) || 0)
          );
          return {
            ...q,
            targetCents,
            downPaymentCents,
            installmentCount: instCount,
            interestBps,
          };
        });
        const chosenQuote = serializedQuotes.find((q) => q.isChosen) || serializedQuotes[0];
        const effectiveTargetCents = Math.max(100, chosenQuote?.targetCents || toCentsSafe(form.goalTarget));
        const effectiveDownCents = Math.min(effectiveTargetCents, chosenQuote?.downPaymentCents || 0);
        const effectiveCount = chosenQuote?.installmentCount || Number(form.goalInstallments || 1);
        const effectiveInterestBps = chosenQuote?.interestBps || 0;
        const payload = {
          title: form.description || "Planejamento",
          target: (effectiveTargetCents / 100).toFixed(2),
          downPayment: (effectiveDownCents / 100).toFixed(2),
          installmentCount: effectiveCount,
          interestBps: effectiveInterestBps,
          desiredOn: form.goalDesiredOn || TODAY,
          planType: form.goalPlanType || "purchase",
          paymentStructure: chosenQuote?.paymentStructure || "upfront",
          quotes: serializedQuotes,
          budgetCategoryId: form.goalBudgetCategoryId || null,
          selectedWalletId: chosenQuote?.selectedWalletId || null,
          sourceGoalId: chosenQuote?.downPaymentSource === "caixinha" ? (chosenQuote.sourceGoalId || null) : null,
          createLinkedCaixinha: chosenQuote?.downPaymentSource === "create_caixinha",
          parentWalletId:
            chosenQuote?.downPaymentSource === "create_caixinha"
              ? (chosenQuote.parentWalletId || checkingWallets[0]?.id || null)
              : null,
          paymentMethod: chosenQuote?.paymentMethod || form.goalPaymentMethod || "standard",
          creditCardId:
            (chosenQuote?.paymentMethod || form.goalPaymentMethod) === "credit_card"
              ? (chosenQuote?.creditCardId || form.goalCreditCardId || creditCards[0]?.id || null)
              : null,
        };
        if (form.goalId) {
          await request("PATCH", { action: "update_goal", goalId: form.goalId, ...payload });
        } else {
          await request("POST", { action: "goal", ...payload });
        }
      } else if (drawer === "capital_goal") {
        await request("POST", {
          action: "goal",
          category: "capital_goal",
          title: form.description || "Caixinha",
          target: maskToDecimal(form.goalTarget || "0,00"),
          downPayment: "0.00",
          installmentCount: 1,
          desiredOn: form.goalDesiredOn || TODAY,
          parentWalletId: form.parentWalletId || checkingWallets[0]?.id || null,
          caixinhaPurpose: form.caixinhaPurpose || "goal",
          initialAmount: form.initialAmount && form.initialAmount !== "0,00" ? maskToDecimal(form.initialAmount) : "",
        });
      } else if (drawer === "budget") {
        await request("POST", {
          action: "budget",
          categoryId: form.budgetCategoryId,
          month: form.budgetMonth || selectedMonth,
          active: form.budgetActive !== false,
          limit: form.budgetActive !== false ? maskToDecimal(form.amount) : "0.00",
          expectedVersion: form.budgetVersion ?? null,
        });
      } else if (drawer === "edit_plan") {
        await request("PATCH", {
          action: "update_spending_plan",
          planId: form.planId,
          description: form.description,
          amount: maskToDecimal(form.amount),
          plannedMonth: form.plannedMonth,
          plannedFor: form.plannedFor || null,
        });
      } else if (drawer === "asset") {
        await request("POST", { action: "asset", label: form.label, amount: maskToDecimal(form.amount) });
      } else if (drawer === "credit_card") {
        await request("POST", {
          action: "credit_card",
          name: form.name,
          limit: maskToDecimal(form.cardLimit || "0"),
          closingDay: Number(form.closingDay || 5),
          dueDay: Number(form.dueDay || 10),
          defaultWalletId: form.walletId || null,
        });
      } else if (drawer === "title" && form.intent === "transfer") {
        const fromW = form.fromWalletId;
        const toW = form.toWalletId;
        if (!fromW || !toW) throw new Error("Selecione as contas de origem e destino.");
        if (fromW === toW) throw new Error("As contas de origem e destino devem ser diferentes.");
        const amountDec = maskToDecimal(form.amount);
        if (!amountDec || Number(amountDec) <= 0) throw new Error("Informe o valor da transferência.");
        const transferredOn = form.transferredOn || form.dueOn || TODAY;
        await request("POST", {
          action: "transfer",
          description: form.description?.trim() || "",
          amount: amountDec,
          fromWalletId: fromW,
          toWalletId: toW,
          transferredOn,
          settled: form.settlementState === "paid",
        });
      } else if (drawer === "title" && form.intent === "lend") {
        const usingCard = Boolean(form.lendCreditCardId);
        await request("POST", {
          action: "lend",
          description: form.description,
          amount: maskToDecimal(form.amount),
          walletId: usingCard ? null : form.walletId,
          creditCardId: usingCard ? form.lendCreditCardId : null,
          cardInstallments: usingCard ? Number(form.lendCardInstallments || 1) : 1,
          repaymentCount: Number(form.lendRepaymentCount || 1),
          valueMode: form.valueMode || "total",
          repaymentWalletId: form.lendRepaymentWalletId || form.walletId,
          personId: form.personId,
          lentOn: form.lentOn || TODAY,
          expectedRepaymentOn: form.expectedRepaymentOn || form.dueOn || TODAY,
        });
      } else {
        const isEdit = drawer === "edit";
        const effectiveState = !isEdit && form.mode === "single" ? form.settlementState : "pending";
        const payload = {
          walletId: form.walletId,
          direction: form.direction,
          description: form.description,
          category: form.category,
          amount: maskToDecimal(form.amount),
          occurredOn: isEdit ? form.dueOn : form.occurredOn || form.dueOn,
          dueOn: isEdit ? form.dueOn : effectiveState === "paid" ? form.settledOn || TODAY : form.dueOn,
        };
        if (isEdit) {
          const titleId = await materializeIfVirtual(selectedTitle);
          await request("PATCH", { action: "edit", titleId, ...payload });
        } else {
          await request("POST", {
            action: "title",
            ...payload,
            creditCardId: form.creditCardId || null,
            mode: form.mode,
            valueMode: form.valueMode,
            count: form.count,
            startIndex: form.startIndex,
            endsOn: form.endsOn || null,
            settlementState: effectiveState,
            settledOn: effectiveState === "paid" ? form.settledOn || TODAY : null,
            spendingPlanId: form.spendingPlanId || null,
            closeSpendingPlan: form.closeSpendingPlan !== false,
            idempotencyKey: form.idempotencyKey || crypto.randomUUID(),
          });
        }
      }
      setNotice("Salvo com sucesso.");
      await refresh();
      if (!form.keepOpen || drawer !== "title") setDrawer(null);
      else setForm((old) => ({ ...old, description: "", amount: "", idempotencyKey: crypto.randomUUID() }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function cancelTitle(title) {
    if (!title) return;
    setCancelTarget(title);
    setCancelError("");
    setError("");
  }

  async function confirmCancel(scope) {
    if (!cancelTarget || busy) return;
    setBusy(true);
    setCancelError("");
    try {
      const result = await request("PATCH", { action: "cancel_scope", titleId: cancelTarget.id, scope });
      await refresh();
      setCancelTarget(null);
      setDrawer(null);
      const suffix = result.preserved_paid > 0 ? " Pagamentos já realizados foram preservados." : "";
      setNotice(`Lançamento excluído.${suffix}`);
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reverseSettlement(id) {
    setConfirmDialog({
      title: "Desfazer este pagamento?",
      body: "O histórico será preservado e o valor voltará a ficar pendente.",
      confirmLabel: "Desfazer pagamento",
      onConfirm: async () => {
        setBusy(true);
        setError("");
        try {
          await request("PATCH", { action: "reverse", settlementId: id });
          await refresh();
          setNotice("Pagamento desfeito. O lançamento voltou a ficar pendente.");
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  }

  function stopRecurring(id) {
    const t = titles.find((item) => item.id === id);
    if (!t?.series_id) return;
    setConfirmDialog({
      title: "Encerrar recorrência?",
      body: "A repetição será encerrada a partir desta ocorrência. Os meses anteriores serão mantidos.",
      confirmLabel: "Encerrar recorrência",
      onConfirm: async () => {
        setBusy(true);
        setError("");
        try {
          await request("PATCH", { action: "stop_recurring", ruleId: t.series_id, startsOn: isoDate(t.due_on) });
          await refresh();
          setNotice("Recorrência encerrada a partir da data escolhida.");
          setDrawer(null);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  }

  async function applyCutPlan(items = []) {
    if (!items.length || busy) return;
    setBusy(true);
    setError("");
    try {
      let closedCount = 0;
      for (const item of items) {
        if (item.kind === "recurring" && item.ruleId) {
          await request("PATCH", {
            action: "stop_recurring",
            ruleId: item.ruleId,
            startsOn: TODAY,
          });
          closedCount++;
        } else if (item.kind === "title" && item.titleId) {
          await request("PATCH", {
            action: "cancel_scope",
            titleId: item.titleId,
            scope: item.isSeries ? "future" : "only",
          });
          closedCount++;
        }
      }
      await refresh();
      setNotice(`Planejamento de cortes efetivado! ${closedCount} ${closedCount === 1 ? "compromisso encerrado" : "compromissos encerrados"}.`);
    } catch (e) {
      setError(e.message || "Não foi possível efetivar os cortes selecionados.");
    } finally {
      setBusy(false);
    }
  }

  function handleAction(action, id) {
    if (action === "reverse") {
      reverseSettlement(id);
      return;
    }
    if (action === "stop_recurring") {
      stopRecurring(id);
      return;
    }
    const t = titles.find((x) => x.id === id);
    if (!t) return;
    if (action === "detail") open("detail", id);
    if (action === "edit") editTitle(id);
    if (action === "duplicate") editTitle(id, true);
    if (action === "settle") open("settle", id);
    if (action === "cancel") cancelTitle(t);
  }

  function selectMonth(delta) {
    const next = moveMonth(rangeStart, delta);
    const first = firstDayOfMonth(`${next}-01`);
    setScreenFilter(active, { rangeStart: first, date: lastDayOfMonth(first) });
  }
  const isCustomRange =
    !(rangeStart === firstDayOfMonth(date) && date === lastDayOfMonth(rangeStart)) &&
    !(rangeStart === TODAY && date === lastDayOfMonth(TODAY));

  const setTab = (k) => {
    setActive(k);
    setNotice("");
  };

  function titlesTable(compact = false) {
    const rawSource = compact ? overviewRows.filter((x) => cents(x.amount_cents) > cents(x.settled_cents)) : rows;
    const consolidated = consolidateCreditCardTitles(rawSource, creditCards, TODAY);
    const source = compact ? consolidated.slice(0, 5) : consolidated;
    const openRow = (id) => {
      if (String(id).startsWith("invoice:")) {
        const [, cardId, ym] = String(id).split(":");
        setInvoiceModal({ cardId, month: ym });
        return;
      }
      open("detail", id);
    };
    return (
      <MovementList
        items={source}
        compact={compact}
        today={TODAY}
        walletName={walletName}
        onDetails={openRow}
        onAction={(act, id) => {
          if (String(id).startsWith("invoice:")) {
            const [, cardId, ym] = String(id).split(":");
            setInvoiceModal({ cardId, month: ym });
            return;
          }
          handleAction(act, id);
        }}
      />
    );
  }

  const expenseCategories = (data?.categories || []).filter((c) => c.direction === "expense" && c.parent_id === null);

  if (loading) {
    return (
      <main className="loading">
        <span className="brand-mark">k</span> Preparando seu painel...
      </main>
    );
  }

  const profileSectionContent = (
    <div className="workspace">
      <section className="card panel profile-panel">
        <div className="account-icon large">{(user.name || user.email || "U")[0].toUpperCase()}</div>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <div className="profile-links">
            <a href="/legal/terms">Termos de Uso</a>
            <a href="/legal/privacy">Aviso de Privacidade</a>
          </div>
          <p className="hint">
            Seus dados financeiros são privados e protegidos por autenticação.
          </p>
          <div className="toolbar-buttons" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="pill pill-secondary"
              onClick={() => setManageWalletsOpen(true)}
            >
              <Wallet size={16} /> Gerenciar contas
            </button>
            <button
              type="button"
              className="pill pill-secondary"
              onClick={() => setTourOpen(true)}
            >
              <Compass size={16} /> Tutorial guiado (&lt; 2 min)
            </button>
            <button
              type="button"
              className="pill pill-primary"
              onClick={async () => {
                await clearCachesOnSignOut();
                await authClient.signOut();
                window.location.replace("/auth/sign-in");
              }}
            >
              <LogOut size={16} /> Sair da conta
            </button>
          </div>
        </div>
      </section>
      <InstallAppCard />
      <McpConnectionsCard />
    </div>
  );

  return (
    <div className={`app${isMobilePhone ? " app--mobile" : isDesktopWorkspace && active !== "profile" ? " app--desktop" : ""}`}>
      {!isMobilePhone && (
      <header className="topbar" aria-label="Cabeçalho e ações">
        <div className="topbar-left">
          <button type="button" className="brand" onClick={() => setTab("overview")} aria-label="kuantoconta, Visão geral">
            <span className="brand-mark">k</span>
            <span className="brand-name">kuantoconta</span>
          </button>
          {isDesktopWorkspace && active === "profile" && (
            <>
              <span className="topbar-divider" aria-hidden="true" />
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setTab("overview")}>
                <ChevronLeft size={15} aria-hidden="true" /> Voltar ao workspace
              </button>
            </>
          )}
          {active !== "profile" && (
            <>
              <span className="topbar-divider" aria-hidden="true" />
              <div className="topbar-actions" data-tour="actions">
                <button type="button" className="pill pill-primary" onClick={() => open("title", null, "bill")}>
                  <Plus size={17} aria-hidden="true" />
                  Lançamento
                </button>
                <button type="button" className="pill pill-secondary" onClick={() => setActionMenu("create")}>
                  Novo
                </button>
              </div>
            </>
          )}
        </div>

        {active !== "profile" && (
          <div className="topbar-center" data-tour="filters">
            {isCustomRange && (
              <button
                type="button"
                className="date-range-chip soft-pill"
                aria-label="Período customizado selecionado"
                onClick={() => setFilterOpen(true)}
              >
                {fmtDate(rangeStart).slice(0, 5)} – {fmtDate(date).slice(0, 5)}
              </button>
            )}
            <div className="month-nav soft-pill" aria-label="Navegar por mês">
              <button type="button" aria-label="Mês anterior" onClick={() => selectMonth(-1)}>
                <ChevronLeft size={19} strokeWidth={2.5} aria-hidden="true" />
              </button>
              <strong>{monthNavLabel}</strong>
              <button type="button" aria-label="Próximo mês" onClick={() => selectMonth(1)}>
                <ChevronRight size={19} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
            {active !== "health" && (
              <div className="filter-wrap">
                <button
                  type="button"
                  className="filter-btn"
                  aria-label="Abrir filtros desta tela"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen(true)}
                >
                  <SlidersHorizontal size={19} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="topbar-right">
          {isDesktopWorkspace && active !== "profile" && (
            <button
              type="button"
              className="topbar-cols-pill"
              aria-label="Adicionar ou gerenciar colunas"
              onClick={() => setAddColumnOpen((v) => !v)}
            >
              <Columns3 size={14} aria-hidden="true" />
              <span>Colunas</span>
              <strong>{desktopColumns.length}</strong>
            </button>
          )}
          {summary.knownCash && (
            <button
              type="button"
              className="topbar-balance-pill"
              title={`Uso diário: ${money(checkingBalanceCents)} · Caixinhas: ${money(capitalBalanceCents)}`}
              aria-label="Saldo total em contas bancárias e caixinhas"
              onClick={() => setManageWalletsOpen(true)}
            >
              <Wallet size={14} aria-hidden="true" />
              <span>Saldo</span>
              <strong>{money(checkingBalanceCents + capitalBalanceCents)}</strong>
            </button>
          )}
          <button
            type="button"
            className="bell-btn"
            aria-label={`Notificações (${notifications.length})`}
            onClick={() => setNotificationsOpen(true)}
          >
            <Bell size={18} aria-hidden="true" />
            {notifications.length > 0 && <span className="bell-badge">{notifications.length}</span>}
          </button>
          <button
            type="button"
            className={`avatar${active === "profile" ? " active" : ""}`}
            title={user.email}
            aria-label="Abrir Perfil"
            aria-current={active === "profile" ? "page" : undefined}
            onClick={() => setTab("profile")}
          >
            {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      )}

      {error && (
        <div className="notice error" role="alert" style={isMobilePhone ? { margin: "10px 14px 0" } : undefined}>
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="kc-toast-popup" role="status" aria-live="polite">
          <CheckCircle2 size={18} className="kc-toast-icon" aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Fechar notificação">
            <X size={15} />
          </button>
        </div>
      )}

      <main className={isMobilePhone ? "dashboard dashboard--mobile" : "dashboard"} aria-label="Conteúdo principal" data-tour="workspace">
        {isMobilePhone ? (
          <MobileWorkspace
            user={user}
            active={active}
            setTab={setTab}
            monthNavLabel={monthNavLabel}
            monthLong={monthLong}
            monthOnly={monthOnly}
            selectMonth={selectMonth}
            isCustomRange={isCustomRange}
            rangeStart={rangeStart}
            date={date}
            today={TODAY}
            fmtDate={fmtDate}
            isoDate={isoDate}
            money={money}
            cents={cents}
            display={display}
            summary={summary}
            projectedBalanceCents={projectedBalanceCents}
            checkingBalanceCents={checkingBalanceCents}
            capitalBalanceCents={capitalBalanceCents}
            totalDebtCents={totalDebtCents}
            debtDisplay={debtDisplay}
            checkingWallets={checkingWallets}
            wallets={wallets}
            walletBalance={walletBalance}
            bankCaixinhasTotal={bankCaixinhasTotal}
            creditCards={creditCards}
            expandedTitles={expanded?.titles || []}
            rows={rows}
            overviewRows={overviewRows}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            screenFilters={screenFilters}
            setScreenFilter={setScreenFilter}
            budgetItems={budgetItems}
            monthlyIncomeCents={monthlyIncomeCents}
            allocatedBudgetCents={allocatedBudgetCents}
            remainingAllocableCents={remainingAllocableCents}
            months={months}
            expenses={expenses}
            charts={charts}
            capitalGoals={capitalGoals}
            purchaseGoals={purchaseGoals}
            reserveCaixinhasCents={reserveCaixinhasCents}
            goalCaixinhasCents={goalCaixinhasCents}
            reservedThisMonthCents={reservedThisMonthCents}
            safeContribution={safeContribution}
            capitalBudget={capitalBudget}
            caixinhaBalance={caixinhaBalance}
            capitalProjectedAtDateCents={capitalProjectedAtDateCents}
            netWorthAtDateCents={netWorthAtDateCents}
            peopleLoans={peopleLoans}
            healthPlan={healthPlan}
            habits={habits}
            notifications={notifications}
            setNotificationsOpen={setNotificationsOpen}
            setFilterOpen={setFilterOpen}
            open={open}
            openBudget={openBudget}
            openReserveCaixinha={openReserveCaixinha}
            fulfillPlan={fulfillPlan}
            editPlan={editPlan}
            cancelPlan={cancelPlan}
            handleAction={handleAction}
            setActionMenu={setActionMenu}
            setSelectedWallet={setSelectedWallet}
            setManageWalletsOpen={setManageWalletsOpen}
            setInvoiceModal={setInvoiceModal}
            setSelectedCaixinha={setSelectedCaixinha}
            setSelectedGoal={setSelectedGoal}
            setHealthModal={setHealthModal}
            computeCardUsage={computeCardUsage}
            computeInvoiceCycleForPurchase={computeInvoiceCycleForPurchase}
            comparePlanningQuotes={comparePlanningQuotes}
            computeCapitalPace={computeCapitalPace}
            data={data}
            busy={busy}
            applyCutPlan={applyCutPlan}
            Empty={Empty}
            profileContent={profileSectionContent}
          />
        ) : isDesktopWorkspace && active !== "profile" ? (
          <DesktopWorkspace
            columns={desktopColumns}
            columnSettings={columnSettings}
            onChangeColumns={handleChangeColumns}
            onChangeColumnSettings={handleChangeColumnSettings}
            addPopoverOpen={addColumnOpen}
            onToggleAddPopover={setAddColumnOpen}
            focusColumnKey={focusColumnKey}
            onFocusHandled={() => setFocusColumnKey(null)}
            today={TODAY}
            date={date}
            monthLong={monthLong}
            monthOnly={monthOnly}
            summary={summary}
            display={display}
            money={money}
            cents={cents}
            isoDate={isoDate}
            fmtDate={fmtDate}
            projectedBalanceCents={projectedBalanceCents}
            checkingBalanceCents={checkingBalanceCents}
            capitalBalanceCents={capitalBalanceCents}
            caixinhaBalance={caixinhaBalance}
            totalDebtCents={totalDebtCents}
            debtDisplay={debtDisplay}
            titlesTable={titlesTable}
            budgetItems={budgetItems}
            monthlyIncomeCents={monthlyIncomeCents}
            allocatedBudgetCents={allocatedBudgetCents}
            remainingAllocableCents={remainingAllocableCents}
            months={months}
            expenses={expenses}
            charts={charts}
            showCategories={showCategories}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            checkingWallets={checkingWallets}
            wallets={wallets}
            walletBalance={walletBalance}
            bankCaixinhasTotal={bankCaixinhasTotal}
            creditCards={creditCards}
            expandedTitles={expanded?.titles || []}
            capitalGoals={capitalGoals}
            purchaseGoals={purchaseGoals}
            reserveCaixinhasCents={reserveCaixinhasCents}
            goalCaixinhasCents={goalCaixinhasCents}
            reservedThisMonthCents={reservedThisMonthCents}
            safeContribution={safeContribution}
            capitalBudget={capitalBudget}
            capitalProjectedAtDateCents={capitalProjectedAtDateCents}
            netWorthAtDateCents={netWorthAtDateCents}
            peopleLoans={peopleLoans}
            healthPlan={healthPlan}
            habits={habits}
            data={data}
            screenFilters={screenFilters}
            setScreenFilter={setScreenFilter}
            open={open}
            openBudget={openBudget}
            openReserveCaixinha={openReserveCaixinha}
            fulfillPlan={fulfillPlan}
            editPlan={editPlan}
            cancelPlan={cancelPlan}
            handleAction={handleAction}
            setActionMenu={setActionMenu}
            setSelectedWallet={setSelectedWallet}
            setManageWalletsOpen={setManageWalletsOpen}
            setInvoiceModal={setInvoiceModal}
            setSelectedCaixinha={setSelectedCaixinha}
            setSelectedGoal={setSelectedGoal}
            setHealthModal={setHealthModal}
            onOpenEvolutionModal={() => setEvolutionModalOpen(true)}
            Empty={Empty}
          />
        ) : (
          <>
        {active === "overview" && (
          <>
            <section className="summary-grid" aria-label="Indicadores principais">
              <button
                type="button"
                className="card metric-card clickable"
                onClick={() => {
                  setFilter("expense");
                  setTab("movements");
                }}
              >
                <span className="metric-icon">
                  <ArrowDown size={24} aria-hidden="true" />
                </span>
                <span className="metric-text">
                  <span className="metric-label">A pagar</span>
                  <strong className="metric-value">{display(summary.payable.total)}</strong>
                </span>
              </button>
              <button
                type="button"
                className="card metric-card clickable"
                onClick={() => {
                  setFilter("income");
                  setTab("movements");
                }}
              >
                <span className="metric-icon">
                  <ArrowUp size={24} aria-hidden="true" />
                </span>
                <span className="metric-text">
                  <span className="metric-label">A receber</span>
                  <strong className="metric-value">{display(summary.receivable.total)}</strong>
                </span>
              </button>
              <button type="button" className="card metric-card clickable" onClick={() => setTab("budgets")}>
                <span className="metric-icon">
                  <TrendingUp size={24} aria-hidden="true" />
                </span>
                <span className="metric-text">
                  <span className="metric-label">Saldo previsto</span>
                  <strong className={`metric-value ${projectedBalanceCents < 0 ? "red" : ""}`}>
                    {display(projectedBalanceCents)}
                  </strong>
                  {summary.knownCash && capitalBalanceCents > 0 && (
                    <span className="metric-sub-mini">
                      Uso: {money(checkingBalanceCents)} · Reserva: {money(capitalBalanceCents)}
                    </span>
                  )}
                </span>
              </button>
              <button type="button" className="card metric-card clickable" onClick={() => setTab("patrimony")}>
                <span className="metric-icon">
                  <Coins size={24} aria-hidden="true" />
                </span>
                <span className="metric-text">
                  <span className="metric-label">Endividamento</span>
                  <strong className="metric-value">{debtDisplay}</strong>
                </span>
              </button>
            </section>

            <section className="mid-grid" aria-label="Compromissos e limites">
              <article className="card commitments">
                <div className="card-heading">
                  <h2 className="card-title">Próximos compromissos</h2>
                  <button type="button" className="pill pill-secondary pill-compact" onClick={() => setTab("movements")}>
                    Ver todos <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="commitments-body">{titlesTable(true)}</div>
              </article>

              <article className="card limits">
                <div className="limits-heading">
                  <div>
                    <div className="eyebrow">ORÇAMENTOS DO MÊS</div>
                    <div className="month-heading">{monthLong}</div>
                  </div>
                  <button
                    type="button"
                    className="pill pill-secondary pill-compact"
                    onClick={() => setTab("budgets")}
                  >
                    Ver orçamentos <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="limits-body">
                  <BudgetList
                    items={budgetItems}
                    monthLabel={monthLong}
                    insufficientCash={summary.minCash !== null && summary.minCash < 0}
                    compact
                    onEditBudget={openBudget}
                    onFulfillPlan={fulfillPlan}
                    onEditPlan={editPlan}
                    onCancelPlan={cancelPlan}
                  />
                </div>
              </article>
            </section>

            <section className="bottom-grid" aria-label="Análises e saldos">
              {showCategories && (
                <article className="card chart-card distribution">
                  <div className="eyebrow">DISTRIBUIÇÃO</div>
                  <h2 className="chart-title">Despesas por categoria</h2>
                  <div className="chart-body">
                    {expenses.length ? (
                      <FinanceChart type="donut" data={expenses} height={235} />
                    ) : (
                      <Empty>Sem despesas no período.</Empty>
                    )}
                  </div>
                </article>
              )}

              <article className="card chart-card cashflow">
                <div className="eyebrow">PERÍODO SELECIONADO</div>
                <h2 className="chart-title">Receitas e despesas</h2>
                <div className="chart-body">
                  {months.length && months.some((m) => m.income || m.expense) ? (
                    <FinanceChart type="bar" data={months} height={235} />
                  ) : (
                    <Empty>Sem movimentos no período.</Empty>
                  )}
                </div>
              </article>

              <article className="card bank-card">
                <div className="bank-header">
                  <div>
                    <div className="eyebrow">CONTAS BANCÁRIAS</div>
                    <h2 className="chart-title">Saldos em conta</h2>
                  </div>
                  <button type="button" className="pill pill-secondary pill-compact" onClick={() => setManageWalletsOpen(true)}>
                    Gerenciar
                  </button>
                </div>
                <div className="bank-box">
                  <div className="bank-box-header">
                    <strong>Suas contas</strong>
                    <strong className="bank-total">{display(checkingBalanceCents)}</strong>
                  </div>
                  {checkingWallets.length ? (
                    <div className="bank-rows">
                      {checkingWallets.slice(0, 4).map((w) => {
                        const caixinhaSum = bankCaixinhasTotal(w.id);
                        return (
                          <button
                            type="button"
                            className="account-row clickable-row"
                            key={w.id}
                            onClick={() => setSelectedWallet(w)}
                          >
                            <BankIcon name={w.name} size={36} />
                            <span className="account-name">{w.name}</span>
                            <span className="account-balance">
                              <strong>{display(walletBalance(w))}</strong>
                              {caixinhaSum > 0 && <span>+ {money(caixinhaSum)} em caixinhas</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty>Nenhuma conta cadastrada. Use Novo → Conta bancária.</Empty>
                  )}
                </div>
              </article>
            </section>

            <section className="card panel" style={{ marginTop: 18 }} aria-label="Cartões de crédito e faturas">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">CRÉDITO E FATURAS DO MÊS</div>
                  <h2 className="card-title">Cartões de crédito</h2>
                </div>
                <button
                  type="button"
                  className="pill pill-outline-orange pill-compact"
                  onClick={() => open("credit_card")}
                >
                  <Plus size={15} aria-hidden="true" /> Novo cartão
                </button>
              </div>
              {creditCards.length ? (
                <div className="goals-bento-grid">
                  {creditCards.map((c) => {
                    const usage = computeCardUsage(c, expanded?.titles || []);
                    const cyc = computeInvoiceCycleForPurchase({
                      purchaseDate: TODAY,
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
                            <BankIcon name={c.name} size={36} />
                            <div>
                              <strong>{c.name}</strong>
                              <div className="hint">Fecha dia {c.closing_day} · Vence dia {c.due_day}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <strong style={{ color: "var(--kc-ink)" }}>{money(usage.usedLimitCents)}</strong>
                            <div className="hint">Disponível: {money(usage.availableLimitCents)}</div>
                          </div>
                        </div>
                        <div className="budget-bar" role="progressbar" aria-valuenow={usage.utilizationPct} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`budget-fill${usage.utilizationPct >= 90 ? " over" : usage.utilizationPct >= 75 ? " warn" : ""}`} style={{ width: `${usage.utilizationPct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>Nenhum cartão cadastrado. Use Novo → Cartão de crédito para acompanhar faturas e limite.</Empty>
              )}
            </section>
          </>
        )}

        {active === "movements" && (
          <div className="workspace">
            <div className="planning-stats">
              <div className="card kpi-panel">
                <span className="metric-label">A receber no período</span>
                <strong className="kpi-value">{display(summary.receivable.total)}</strong>
                <span className="metric-sub">Previstas e confirmadas</span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">A pagar no período</span>
                <strong className="kpi-value">{display(summary.payable.total)}</strong>
                <span className="metric-sub">Previstos e confirmados</span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">Resultado do período</span>
                <strong className={`kpi-value ${summary.periodResult < 0 ? "red" : ""}`}>
                  {display(summary.periodResult)}
                </strong>
                <span className="metric-sub">Entradas menos saídas</span>
              </div>
            </div>

            <section className="card list-panel">
              <div className="filters">
                <div className="filter-pills">
                  {[
                    ["all", "Todos"],
                    ["expense", "A pagar"],
                    ["income", "A receber"],
                  ].map(([k, l]) => (
                    <button key={k} type="button" className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                <label className="search-input">
                  <Search size={17} />
                  <input
                    placeholder="Buscar lançamento ou categoria"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {titlesTable()}
            </section>
          </div>
        )}

        {active === "budgets" && (
          <div className="workspace planning-bento">
            <div className="card kpi-panel bento-hero bento-span-5">
              <span className="metric-label">Renda prevista em {monthOnly}</span>
              <strong className="kpi-value kpi-hero-value">{money(monthlyIncomeCents)}</strong>
              <span className="metric-sub">
                {monthlyIncomeCents > 0 ? "Base para distribuir seus limites" : "Cadastre suas receitas do mês"}
              </span>
            </div>
            <div className="card kpi-panel bento-kpi bento-span-3">
              <span className="metric-label">Total orçado</span>
              <strong className="kpi-value">{money(allocatedBudgetCents)}</strong>
              <span className="metric-sub">
                {monthlyIncomeCents > 0 ? `${Math.min(100, Math.round((allocatedBudgetCents / monthlyIncomeCents) * 100))}% da renda` : "Limites por categoria"}
              </span>
            </div>
            <div className="card kpi-panel bento-kpi bento-span-2">
              <span className="metric-label">Livre para orçar</span>
              <strong className="kpi-value">{money(remainingAllocableCents)}</strong>
              <span className="metric-sub">Sem teto definido</span>
            </div>
            <button
              type="button"
              className="card bento-action-card bento-span-2"
              onClick={() => setActionMenu("budget_pick")}
            >
              <SlidersHorizontal size={20} aria-hidden="true" />
              <strong>Definir limite</strong>
              <span>Configurar teto</span>
            </button>

            <section className="card panel bento-full">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <h2 className="card-title">Limites de {monthLong}</h2>
                <span className="small-flag">Mês calendário</span>
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

            <section className="card panel bento-evolution">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <h2 className="card-title">Evolução mês a mês</h2>
              </div>
              <div className="table-scroll">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>Sobra/déficit</th>
                      <th>Saldo (contratual)</th>
                      <th>Saldo (com planos)</th>
                      <th>Saldo (com limites)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month}>
                        <td>
                          <strong>
                            {new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
                              month: "long",
                              year: "numeric",
                              timeZone: "UTC",
                            })}
                          </strong>
                        </td>
                        <td>{money(m.income)}</td>
                        <td>{money(m.expense)}</td>
                        <td className={m.result < 0 ? "red" : ""}>{money(m.result)}</td>
                        <td className="money-cell">{display(m.balance)}</td>
                        <td className="money-cell">{display(m.balanceWithPlans)}</td>
                        <td className="money-cell">{display(m.balanceWithinBudgets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {active === "planning" && (
          <div className="workspace planning-bento">
            <div className="card kpi-panel bento-hero bento-span-3">
              <span className="metric-label">Guardado em Caixinhas</span>
              <strong className="kpi-value kpi-hero-value">{summary.knownCash ? money(capitalBalanceCents) : "A calcular"}</strong>
              <span className="metric-sub">
                Reserva: {money(reserveCaixinhasCents)} · Objetivos: {money(goalCaixinhasCents)}
              </span>
            </div>
            <div className="card kpi-panel bento-kpi bento-span-3">
              <span className="metric-label">Guardado em {monthOnly}</span>
              <strong className="kpi-value">{money(reservedThisMonthCents)}</strong>
              <span className="metric-sub">
                {safeContribution.canContribute
                  ? `Aporte seguro: ${money(safeContribution.safeContributionCents)} · Uso diário: ${money(checkingBalanceCents)}`
                  : projectedBalanceCents <= 0
                    ? "Priorize quitar compromissos antes de guardar"
                    : `Livre no uso diário: ${money(checkingBalanceCents)}`}
              </span>
            </div>
            <button
              type="button"
              className="card bento-action-card bento-span-2"
              onClick={() => openReserveCaixinha()}
            >
              <PiggyBank size={20} aria-hidden="true" />
              <strong>Reservar valor</strong>
              <span>Guardar ou resgatar</span>
            </button>
            <button
              type="button"
              className="card bento-action-card bento-span-2"
              onClick={() => open("capital_goal")}
            >
              <Plus size={20} aria-hidden="true" />
              <strong>Nova caixinha</strong>
              <span>Criar objetivo</span>
            </button>
            <button
              type="button"
              className="card bento-action-card bento-action-accent bento-span-2"
              onClick={() => open("goal_sim")}
            >
              <Compass size={20} aria-hidden="true" />
              <strong>Novo planejamento</strong>
              <span>Compra, viagem ou lista</span>
            </button>

            <section className="card panel bento-caixinhas">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <h2 className="card-title">Caixinhas</h2>
                <span className="small-flag">{capitalGoals.length} ativa(s)</span>
              </div>
              {capitalGoals.length ? (
                <div className="budget-list">
                  {capitalGoals.map((g) => {
                    const saved = caixinhaBalance(g);
                    const bankWallet = checkingWallets.find((w) => w.id === g.parent_wallet_id) || wallets.find((w) => w.id === g.parent_wallet_id);
                    const purposeLabel = g.caixinha_purpose === "reserve" ? "Reserva" : g.caixinha_purpose === "capital" ? "Capital" : "Objetivo";
                    const pace = computeCapitalPace({
                      targetCents: cents(g.target_cents),
                      targetDate: isoDate(g.desired_on) || END,
                      currentCapitalCents: saved,
                      monthlyContributionCents: capitalBudget?.limitCents || 0,
                      today: TODAY,
                    });
                    return (
                      <button
                        type="button"
                        className="budget-card clickable-card"
                        style={{ width: "100%" }}
                        key={g.id}
                        onClick={() => setSelectedCaixinha({ raw: g, pace, saved, bankName: bankWallet?.name || "Sem banco" })}
                      >
                        <div className="budget-row-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <BankIcon name={bankWallet?.name || g.title} size={34} />
                            <div>
                              <strong>{g.title}</strong>
                              <div className="hint">{bankWallet ? bankWallet.name : "Sem banco"} · {purposeLabel}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <strong style={{ color: "var(--kc-ink)", fontSize: 15 }}>{money(saved)}</strong>
                            <div className="hint">Meta: {money(pace.targetCents)}</div>
                          </div>
                        </div>
                        <div className="budget-bar" role="progressbar" aria-valuenow={pace.progressPct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="budget-fill" style={{ width: `${pace.progressPct}%` }} />
                        </div>
                        <div className="budget-meta">
                          <span>
                            {pace.remainingCents === 0
                              ? "Meta atingida!"
                              : `Ritmo: ${money(pace.requiredMonthlyCents)}/mês até ${fmtDate(g.desired_on)}`}
                          </span>
                          <span>{pace.progressPct}% ›</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty>
                  Use &ldquo;Nova caixinha&rdquo; no topo para separar dinheiro por objetivo (ex.: Reserva de emergência, Entrada do carro).
                </Empty>
              )}
            </section>

            <section className="card panel bento-purchases">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 className="card-title">Planejamentos</h2>
                  <span className="small-flag">{purchaseGoals.length} ativo(s)</span>
                </div>
                <div className="toolbar-buttons">
                  {purchaseGoals.length >= 2 && (
                    <button
                      type="button"
                      className={`pill pill-compact ${compareMode ? "pill-primary" : "pill-outline-orange"}`}
                      onClick={() => {
                        setCompareMode((v) => !v);
                        setCompareIds([]);
                      }}
                    >
                      {compareMode ? "Cancelar comparação" : "Comparar"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    aria-label="Novo planejamento"
                    title="Novo planejamento"
                    onClick={() => open("goal_sim")}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {compareMode && (
                <div className="compare-select-bar">
                  <span>
                    {compareIds.length < 2
                      ? "Selecione 2 ou mais planejamentos abaixo para comparar lado a lado."
                      : `${compareIds.length} selecionado(s) para comparação.`}
                  </span>
                  {compareIds.length >= 2 && (
                    <button
                      type="button"
                      className="pill pill-primary pill-compact"
                      onClick={() => setCompareModalOpen(true)}
                    >
                      Comparar selecionados ({compareIds.length})
                    </button>
                  )}
                </div>
              )}
              {purchaseGoals.length ? (
                <div className="goals-bento-grid">
                  {purchaseGoals
                    .map((g, idx) => {
                      const comparison = comparePlanningQuotes(data || {}, g, { today: TODAY });
                      const chosenQ = comparison.quotes.find((q) => q.isChosen) || comparison.winner;
                      const sim = chosenQ?.sim || comparison.winner?.sim;
                      return { g, idx, comparison, sim };
                    })
                    .filter(({ sim }) => !screenFilters.planning.onlyFeasible || sim?.isFeasible || Boolean(sim?.firstFeasibleDate))
                    .map(({ g, idx, comparison, sim }) => {
                      const pType = g.plan_type || "purchase";
                      const TypeIcon = pType === "trip" ? Plane : pType === "shopping_list" ? ListChecks : Compass;
                      const typeLabel = pType === "trip" ? "Viagem" : pType === "shopping_list" ? "Lista" : "Compra";
                      const isSelectedForCompare = compareIds.includes(g.id);
                      const itemsArr = Array.isArray(g.quotes_json?.[0]?.items) ? g.quotes_json[0].items : [];
                      const checkedCount = itemsArr.filter((it) => it.checked).length;
                      return (
                        <button
                          type="button"
                          key={g.id || idx}
                          className={`goal-bento-card${isSelectedForCompare ? " compare-selected" : ""}`}
                          onClick={() => {
                            if (compareMode) {
                              setCompareIds((old) =>
                                old.includes(g.id) ? old.filter((id) => id !== g.id) : [...old, g.id]
                              );
                              return;
                            }
                            setInlineListItemText("");
                            setSelectedGoal({ raw: g, sim, comparison });
                          }}
                        >
                          <div className="goal-bento-top">
                            <span className="goal-bento-icon">
                              {compareMode ? (
                                <span className={`compare-check-dot${isSelectedForCompare ? " checked" : ""}`}>
                                  {isSelectedForCompare && <Check size={13} strokeWidth={3} />}
                                </span>
                              ) : (
                                <TypeIcon size={18} />
                              )}
                            </span>
                            <span className={`status ${sim.isFeasible ? "done" : sim.firstFeasibleDate ? "partial" : "late"}`}>
                              {sim.isFeasible ? "Viável na data" : sim.firstFeasibleDate ? `A partir de ${fmtDate(sim.firstFeasibleDate)}` : "Ainda não cabe"}
                            </span>
                          </div>
                          <strong>{g.title}</strong>
                          <div className="goal-bento-meta">
                            <span>{money(cents(g.target_cents))}</span>
                            <small>
                              {pType === "shopping_list" && itemsArr.length > 0
                                ? `Lista · ${checkedCount}/${itemsArr.length} no carrinho`
                                : pType === "trip" && itemsArr.length > 0
                                  ? `Viagem · ${itemsArr.length} item(ns)`
                                  : `${typeLabel}${g.installment_count > 1 ? ` · ${g.installment_count}x de ${money(cents(g.installment_cents))}` : " · À vista"}`}
                            </small>
                          </div>
                          {sim.twoStepVerdict?.linkedCaixinhaTitle && (
                            <div className="hint" style={{ fontSize: 11 }}>
                              Caixinha: {sim.twoStepVerdict.linkedCaixinhaTitle}
                            </div>
                          )}
                          {sim.twoStepVerdict?.creditCardVerdict && (
                            <div className="hint" style={{ fontSize: 11 }}>
                              💳 Cartão {sim.twoStepVerdict.creditCardVerdict.cardName}
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              ) : (
                <Empty>
                  Toque em &ldquo;Novo planejamento&rdquo; no topo para simular compras, cotações, viagens ou listas sem comprometer sua reserva.
                </Empty>
              )}
            </section>
          </div>
        )}

        {active === "patrimony" && (
          <div className="workspace capital-bento">
            <div className="card kpi-panel bento-hero">
              <span className="metric-label">Capital formado hoje</span>
              <strong className="kpi-value kpi-hero-value">{summary.knownCash ? money(capitalBalanceCents) : "A calcular"}</strong>
              <span className="metric-sub">
                {summary.knownCash
                  ? `${capitalProjectedAtDateCents - capitalBalanceCents >= 0 ? "+" : "−"}${money(Math.abs(capitalProjectedAtDateCents - capitalBalanceCents))} previstos até ${fmtDate(date)} · Contas de Reserva e Capital`
                  : "Contas de Reserva e Capital"}
              </span>
            </div>
            <div className="card kpi-panel bento-kpi">
              <span className="metric-label">Capital projetado em {fmtDate(date)}</span>
              <strong className="kpi-value">{summary.knownCash ? money(capitalProjectedAtDateCents) : "A calcular"}</strong>
              <span className="metric-sub">Considerando o ritmo mensal planejado</span>
            </div>
            <div className="card kpi-panel bento-kpi">
              <span className="metric-label">Patrimônio líquido em {fmtDate(date)}</span>
              <strong className="kpi-value">{display(netWorthAtDateCents)}</strong>
              <span className="metric-sub">Caixa + bens − dívidas ({debtDisplay})</span>
            </div>

            <section className="card panel bento-wallets">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <h2 className="card-title">Contas bancárias</h2>
                <button type="button" className="pill pill-secondary pill-compact" onClick={() => setManageWalletsOpen(true)}>
                  Gerenciar contas
                </button>
              </div>
              <div className="wallet-list">
                {checkingWallets.length ? (
                  checkingWallets.map((w) => {
                    const caixinhaSum = bankCaixinhasTotal(w.id);
                    return (
                      <button
                        type="button"
                        className="account-panel-row clickable-row"
                        key={w.id}
                        onClick={() => setSelectedWallet(w)}
                      >
                        <BankIcon name={w.name} size={40} />
                        <div className="account-info">
                          <h3>{w.name}</h3>
                          <p>
                            {caixinhaSum > 0
                              ? `Livre: ${display(walletBalance(w))} · Em caixinhas: ${money(caixinhaSum)}`
                              : `Abertura em ${w.opening_at ? fmtDate(w.opening_at) : "data não informada"}`}
                          </p>
                        </div>
                        <strong>{display(walletBalance(w))} ›</strong>
                      </button>
                    );
                  })
                ) : (
                  <Empty>Nenhuma conta cadastrada. Use Novo → Conta bancária.</Empty>
                )}
              </div>
            </section>

            <section className="card panel bento-chart">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">EVOLUÇÃO NO PERÍODO FILTRADO</div>
                  <h2 className="card-title">Projeção de caixa e capital até {fmtDate(date)}</h2>
                </div>
              </div>
              {summary.knownCash && charts.length ? (
                <FinanceChart type="line" data={charts} height={270} />
              ) : (
                <Empty>Informe o saldo de uma conta para projetar a evolução.</Empty>
              )}
              {summary.firstNegative && (
                <div className="alert" style={{ marginTop: 12 }}>
                  <AlertTriangle size={16} /> Déficit previsto em {fmtDate(summary.firstNegative)}.
                </div>
              )}
            </section>

            <section className="card panel bento-loans">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">VALORES A RECEBER DE TERCEIROS</div>
                  <h2 className="card-title">Carteira de pessoas</h2>
                </div>
                <button
                  type="button"
                  className="pill pill-outline-orange pill-compact"
                  onClick={() => open("title", null, "lend")}
                >
                  <Plus size={15} aria-hidden="true" /> Emprestar
                </button>
              </div>
              {peopleLoans.length ? (
                <div className="budget-list">
                  {peopleLoans.map(({ person, totalLentCents, totalRepaidCents, openBalanceCents, openRepaymentTitles }) => (
                    <div className="budget-card" key={person.id}>
                      <div className="budget-row-top">
                        <div>
                          <strong>{person.name}</strong>
                          <span className="small-flag" style={{ marginLeft: 8, fontSize: 10 }}>{person.relationship}</span>
                          <div className="hint" style={{ marginTop: 2 }}>
                            Emprestado: {money(totalLentCents)} · Devolvido: {money(totalRepaidCents)}
                            {openRepaymentTitles[0] && (
                              <> · Próx.: {fmtDate(openRepaymentTitles[0].dueOn)}{openRepaymentTitles[0].installmentTotal > 1 ? ` (${openRepaymentTitles[0].installmentIndex}/${openRepaymentTitles[0].installmentTotal})` : ""} · {money(openRepaymentTitles[0].remainingCents)}{openRepaymentTitles.length > 1 ? ` (+${openRepaymentTitles.length - 1})` : ""}</>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: openBalanceCents > 0 ? "var(--kc-orange)" : "#067647" }}>
                            {openBalanceCents > 0 ? money(openBalanceCents) : "Quitado"}
                          </strong>
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
                <Empty>Nenhum empréstimo para terceiros registrado. Use + Emprestar para acompanhar.</Empty>
              )}
            </section>

            <section className="card panel bento-extra">
              <div className="card-heading">
                <div>
                  <div className="eyebrow">PATRIMÔNIO IMOBILIZADO</div>
                  <h2 className="card-title">Bens e imóveis</h2>
                </div>
                <button type="button" className="pill pill-outline-orange pill-compact" onClick={() => open("asset")}>
                  <Plus size={15} /> Adicionar bem
                </button>
              </div>
              <div className="large-line">{money(summary.assets)}</div>
              <p className="hint">Imóveis, veículos ou investimentos registrados fora do saldo das contas bancárias.</p>
            </section>
          </div>
        )}

        {active === "health" && healthPlan && (() => {
          const diag = healthPlan.diagnosis;
          const ind = diag.indicators;
          const miles = healthPlan.milestones;
          const STATE_LABELS = {
            red: ["Contas em risco", "late"],
            orange: ["Reorganizando", "review"],
            blue: ["Em equilíbrio", "pending"],
            green: ["Protegido", "done"],
            unknown: ["Dados para completar", "pending"],
          };
          const [stateLabel, stateCls] = STATE_LABELS[diag.state] || STATE_LABELS.unknown;
          const reserveMonths = ind.emergencyCoverageMonths ?? 0;
          const reservePct = Math.min(100, Math.round((reserveMonths / 6) * 100));
          const commitPct = ind.incomeCommitmentRatio === null ? 0 : Math.round(ind.incomeCommitmentRatio * 100);
          const fmtM = (ym) =>
            ym ? new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "") : "A definir";

          return (
            <div className="workspace">
              {/* Linha 1: 3 Cards de Pulso */}
              <div className="planning-stats">
                <button type="button" className="card kpi-panel clickable-card" onClick={() => setHealthModal("diagnosis")}>
                  <div className="card-heading">
                    <span className="metric-label">Estado financeiro</span>
                    <span className={`status ${stateCls}`}>{stateLabel}</span>
                  </div>
                  <strong className="kpi-value">{money(totalDebtCents ?? ind.outstandingDebtCents)}</strong>
                  <span className="metric-sub">Endividamento · Ver diagnóstico ›</span>
                </button>

                <div className="card kpi-panel">
                  <div className="card-heading">
                    <span className="metric-label">Reserva líquida</span>
                    <span className="small-flag">Meta: 6 meses</span>
                  </div>
                  <strong className="kpi-value">
                    {ind.emergencyCoverageMonths === null ? "A calcular" : `${reserveMonths.toFixed(1)} meses`}
                  </strong>
                  <div className="budget-bar" role="progressbar" aria-valuenow={reservePct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="budget-fill" style={{ width: `${reservePct}%` }} />
                  </div>
                </div>

                <div className="card kpi-panel health-kpi-gauge">
                  <span className="metric-label">Comprometimento da renda</span>
                  <FinanceChart type="gauge" data={[{ value: commitPct, name: "Comprometido" }]} height={145} />
                </div>
              </div>

              {/* Linha 2: Linha do Tempo Horizontal de Recuperação (acima da dobra) */}
              <section className="card panel health-milestones-hero">
                <div className="card-heading" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="eyebrow">LINHA DO TEMPO · HORIZONTE 12 MESES</div>
                    <h2 className="card-title">Marcos de recuperação</h2>
                  </div>
                  <button type="button" className="pill pill-primary pill-compact" onClick={() => setHealthModal("milestones")}>
                    Ver detalhes <ChevronRight size={14} />
                  </button>
                </div>
                {(() => {
                  const currentYm = TODAY.slice(0, 7);
                  const rawSteps = [
                    {
                      num: "1",
                      title: "1. Contas cobertas",
                      ym: miles.firstCoveredMonth,
                      tip: "Todas as contas essenciais do mês cabem no que entra, sem atrasos.",
                    },
                    {
                      num: "2",
                      title: "2. Início dos aportes",
                      ym: miles.firstSavingMonth,
                      tip: "Primeiro mês em que sobra dinheiro livre para guardar ou investir.",
                    },
                    {
                      num: "3",
                      title: "3. Estabilidade",
                      ym: miles.firstStableMonth,
                      tip: "Contas em dia, reserva formada e sobra constante por vários meses seguidos.",
                    },
                  ];
                  let currentAssigned = false;
                  const steps = rawSteps.map((s) => {
                    if (s.ym && s.ym <= currentYm) {
                      return { ...s, state: "done" };
                    }
                    if (!currentAssigned) {
                      currentAssigned = true;
                      return { ...s, state: "current" };
                    }
                    return { ...s, state: "pending" };
                  });
                  return (
                    <div className="health-timeline" role="list" aria-label="Marcos de recuperação financeira">
                      {steps.map((s) => (
                        <div
                          key={s.num}
                          role="listitem"
                          tabIndex={0}
                          className={`health-timeline-node is-${s.state}`}
                          aria-label={`${s.title}: ${fmtM(s.ym)}. ${s.tip}`}
                        >
                          <span className="health-timeline-dot" aria-hidden="true">{s.num}</span>
                          <div className="health-timeline-meta">
                            <span className="health-timeline-title">{s.title}</span>
                            <strong className="health-timeline-date">{fmtM(s.ym)}</strong>
                          </div>
                          <div className="health-timeline-tip" role="tooltip">
                            {s.tip}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>

              {/* Linha 3: Dedo Duro & Tesouraço com Gráficos */}
              <div className="register-grid">
                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="eyebrow">PADRÕES DE CONSUMO</div>
                      <h2 className="card-title">Onde o dinheiro escoa</h2>
                    </div>
                    <button type="button" className="pill pill-secondary pill-compact" onClick={() => setHealthModal("dedoduro")}>
                      Ver detalhes <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {habits.topLeaks.length > 0 ? (
                    <FinanceChart
                      type="hbar"
                      data={habits.topLeaks.map((l) => ({ name: l.category, value: l.amountCents, sharePct: l.sharePct }))}
                      height={170}
                    />
                  ) : (
                    <Empty>Sem despesas no período para mapear.</Empty>
                  )}
                  <div className="health-chips-row">
                    <span className={`status ${habits.smallLeaks.detected ? "late" : "pending"}`}>
                      {habits.smallLeaks.detected
                        ? `Formiguinha: ${habits.smallLeaks.count}x (${money(habits.smallLeaks.monthlyTotalCents)})`
                        : "Sem gastos formiguinha"}
                    </span>
                    {habits.weekend.count > 0 && (
                      <span className="small-flag">Fim de semana: {habits.weekend.sharePct}%</span>
                    )}
                  </div>
                </section>

                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="eyebrow">REEDUCAÇÃO</div>
                      <h2 className="card-title">Potencial de corte</h2>
                    </div>
                    <button type="button" className="pill pill-secondary pill-compact" onClick={() => setHealthModal("tesouraco")}>
                      <Scissors size={14} aria-hidden="true" /> Ver cortes
                    </button>
                  </div>
                  {habits.tesouraco.potentialMonthlySavingsCents > 0 ? (
                    <>
                      <FinanceChart
                        type="compare"
                        data={[
                          { label: "Gasto atual", value: habits.totalExpenseCents },
                          { label: "Com corte", value: habits.tesouraco.afterTrimMonthlyCents },
                        ]}
                        height={155}
                      />
                      <div className="health-chips-row">
                        <span className="status done">
                          Libera +{money(habits.tesouraco.potentialMonthlySavingsCents)}/mês ({money(habits.tesouraco.potentialAnnualSavingsCents)}/ano)
                        </span>
                      </div>
                    </>
                  ) : (
                    <Empty>Consumo enxuto neste período. Nenhum vazamento variável relevante para cortar.</Empty>
                  )}
                </section>
              </div>
            </div>
          );
        })()}

        {active === "profile" && profileSectionContent}
          </>
        )}
      </main>

      {!isDesktopWorkspace && !isMobilePhone && (
      <nav className="bottom-dock" aria-label="Navegação principal" data-tour="dock">
        {TABS.map(([key, label]) => {
          const TabIcon = TAB_ICONS[key] || LayoutGrid;
          return (
            <button
              key={key}
              type="button"
              className={`dock-item${active === key ? " active" : ""}${key === "profile" ? " profile" : ""}`}
              aria-current={active === key ? "page" : undefined}
              aria-label={label}
              title={label}
              onClick={() => setTab(key)}
            >
              <TabIcon size={20} className="dock-icon" aria-hidden="true" />
              <span className="dock-label">{label}</span>
            </button>
          );
        })}
      </nav>
      )}

      {evolutionModalOpen && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEvolutionModalOpen(false);
          }}
        >
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="evolutionDialogTitle">
            <div className="dialog-head">
              <h2 id="evolutionDialogTitle">Evolução mês a mês</h2>
              <button type="button" className="dialog-close" onClick={() => setEvolutionModalOpen(false)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="table-scroll">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Entradas</th>
                    <th>Saídas</th>
                    <th>Sobra/déficit</th>
                    <th>Saldo (contratual)</th>
                    <th>Saldo (com planos)</th>
                    <th>Saldo (com limites)</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>
                        <strong>
                          {new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </strong>
                      </td>
                      <td>{money(m.income)}</td>
                      <td>{money(m.expense)}</td>
                      <td className={m.result < 0 ? "red" : ""}>{money(m.result)}</td>
                      <td className="money-cell">{display(m.balance)}</td>
                      <td className="money-cell">{display(m.balanceWithPlans)}</td>
                      <td className="money-cell">{display(m.balanceWithinBudgets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {actionMenu && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActionMenu(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="actionDialogTitle">
            <div className="dialog-head">
              <h2 id="actionDialogTitle">
                {actionMenu === "create" ? "Novo" : "Definir limite mensal"}
              </h2>
              <button type="button" className="dialog-close" onClick={() => setActionMenu(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>

            {actionMenu === "create" && (
              <div className="action-menu">
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("credit_card");
                  }}
                >
                  <span>
                    Cartão de crédito
                    <small>Controlar limite, fechamento, vencimento e faturas</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("wallet");
                  }}
                >
                  <span>
                    Conta bancária
                    <small>Cadastrar uma conta bancária ou carteira</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionMenu("budget_pick")}
                >
                  <span>
                    Orçamento
                    <small>Definir um orçamento mensal</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("goal_sim");
                  }}
                >
                  <span>
                    Planejamento de compra
                    <small>Descobrir o melhor momento para comprar sem gerar cobrança</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("capital_goal");
                  }}
                >
                  <span>
                    Caixinha (Guardar dinheiro)
                    <small>Definir quanto quer guardar até uma data e acompanhar o ritmo</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("asset");
                  }}
                >
                  <span>
                    Bem
                    <small>Registrar imóvel ou investimento fora das contas</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("loan");
                  }}
                >
                  <span>
                    Empréstimo / financiamento
                    <small>Creditar valor recebido e gerar parcelas no endividamento</small>
                  </span>
                  <span>›</span>
                </button>
              </div>
            )}

            {actionMenu === "budget_pick" && (
              <div className="action-menu">
                {monthlyIncomeCents <= 0 ? (
                  <>
                    <div className="alert">
                      <AlertTriangle size={16} />
                      <span>Cadastre seus valores a receber de {monthLong} antes de definir limites de orçamento.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActionMenu(null);
                        open("income", null, "bill");
                      }}
                    >
                      <span>
                        Cadastrar valor a receber
                        <small>Informe seu salário ou receita prevista do mês</small>
                      </span>
                      <span>›</span>
                    </button>
                  </>
                ) : expenseCategories.length ? (
                  expenseCategories.map((cat) => {
                    const existing = budgetItems.find((b) => String(b.categoryId) === String(cat.id));
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => {
                          setActionMenu(null);
                          openBudget({
                            categoryId: cat.id,
                            categoryName: cat.name,
                            limitCents: existing?.limitCents ?? null,
                            version: existing?.version ?? null,
                          });
                        }}
                      >
                        <span>
                          {cat.name}
                          <small>
                            {existing?.limitCents !== null && existing?.limitCents !== undefined
                              ? `Limite atual: ${money(existing.limitCents)}`
                              : "Não controla limite"}
                          </small>
                        </span>
                        <span>›</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="hint">Nenhum orçamento encontrado. Crie um ao adicionar um lançamento.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {filterOpen && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFilterOpen(false);
          }}
        >
          <div className="dialog filter-dialog" role="dialog" aria-modal="true" aria-labelledby="filterDialogTitle">
            <div className="dialog-head">
              <h2 id="filterDialogTitle">
                Filtros · {TABS.find((t) => t[0] === active)?.[1] || "Tela atual"}
              </h2>
              <button type="button" className="dialog-close" onClick={() => setFilterOpen(false)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="filter-dialog-body">
              <div className="popover-dates">
                <label>
                  <span>Início</span>
                  <input
                    aria-label="Início do período"
                    type="date"
                    value={rangeStart}
                    max={date}
                    onChange={(e) => {
                      const v = e.target.value || TODAY;
                      setRangeStart(v);
                      if (v > date) setDate(v);
                    }}
                  />
                </label>
                <label>
                  <span>Fim</span>
                  <input
                    aria-label="Fim do período"
                    type="date"
                    min={rangeStart}
                    max="2099-12-31"
                    value={date}
                    onChange={(e) => setDate(e.target.value >= rangeStart ? e.target.value : rangeStart)}
                  />
                </label>
              </div>
              <div className="popover-shortcuts">
                <button
                  type="button"
                  className="tiny-btn"
                  onClick={() => setScreenFilter(active, { rangeStart: TODAY, date: lastDayOfMonth(TODAY) })}
                >
                  Mês atual
                </button>
                <button
                  type="button"
                  className="tiny-btn"
                  onClick={() => setScreenFilter(active, { rangeStart: TODAY, date: END })}
                >
                  Até 31/12
                </button>
              </div>

              {active === "overview" && (
                <div className="filter-checks-group">
                  <label className="kc-check">
                    <input type="checkbox" checked={showPlanned} onChange={(e) => setShowPlanned(e.target.checked)} />
                    <span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>Incluir previstos</span>
                  </label>
                  <label className="kc-check">
                    <input type="checkbox" checked={showRealized} onChange={(e) => setShowRealized(e.target.checked)} />
                    <span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>Mostrar realizados</span>
                  </label>
                  <label className="kc-check">
                    <input type="checkbox" checked={showCategories} onChange={(e) => setShowCategories(e.target.checked)} />
                    <span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>Exibir despesas por categoria</span>
                  </label>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    <span className="field-caption">Composição do endividamento</span>
                    <div className="filter-pills">
                      {[
                        ["all_commitments", "Todos os compromissos"],
                        ["financial_only", "Apenas dívidas financeiras"],
                      ].map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          className={`filter-pill${debtMode === k ? " active" : ""}`}
                          onClick={() => setDebtMode(k)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {active === "movements" && (
                <div className="filter-checks-group">
                  <span className="field-caption">Situação dos lançamentos</span>
                  <div className="filter-pills">
                    {[
                      ["all", "Todas"],
                      ["pending", "Pendentes"],
                      ["done", "Quitados"],
                      ["late", "Vencidos"],
                    ].map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        className={(screenFilters.movements.status || "all") === k ? "active" : ""}
                        onClick={() => setScreenFilter("movements", { status: k })}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {active === "planning" && (
                <div className="filter-checks-group">
                  <label className="kc-check">
                    <input
                      type="checkbox"
                      checked={Boolean(screenFilters.planning.onlyFeasible)}
                      onChange={(e) => setScreenFilter("planning", { onlyFeasible: e.target.checked })}
                    />
                    <span className="kc-check-box" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>Mostrar apenas compras viáveis</span>
                  </label>
                </div>
              )}

              {active === "patrimony" && (
                <div className="filter-checks-group">
                  <div style={{ display: "grid", gap: 6 }}>
                    <span className="field-caption">Composição do endividamento</span>
                    <div className="filter-pills">
                      {[
                        ["all_commitments", "Todos os compromissos"],
                        ["financial_only", "Apenas dívidas financeiras"],
                      ].map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          className={`filter-pill${debtMode === k ? " active" : ""}`}
                          onClick={() => setDebtMode(k)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button type="button" className="dark-button" onClick={() => setFilterOpen(false)}>
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNotificationsOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="notifDialogTitle">
            <div className="dialog-head">
              <h2 id="notifDialogTitle">Notificações</h2>
              <button type="button" className="dialog-close" onClick={() => setNotificationsOpen(false)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            {notifications.length ? (
              <div className="action-menu">
                {notifications.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      if (n.action === "transfer_capital" || n.action === "reserve_caixinha") openReserveCaixinha();
                      else if (n.targetTab) setTab(n.targetTab);
                    }}
                  >
                    <span>
                      <strong className={n.tone === "danger" ? "red" : ""}>{n.title}</strong>
                      <small>{n.detail}</small>
                    </span>
                    <span>›</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>Tudo em ordem por aqui. Nenhum alerta no momento.</Empty>
            )}
          </div>
        </div>
      )}

      {healthModal && healthPlan && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHealthModal(null);
          }}
        >
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="healthModalTitle">
            <div className="dialog-head">
              <h2 id="healthModalTitle">
                {healthModal === "diagnosis"
                  ? "Diagnóstico financeiro"
                  : healthModal === "dedoduro"
                    ? "Dedo Duro · Detalhes de consumo"
                    : healthModal === "tesouraco"
                      ? "Tesouraço · Onde cortar"
                      : "Seu plano de recuperação"}
              </h2>
              <button type="button" className="dialog-close" onClick={() => setHealthModal(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div style={{ maxHeight: "65vh", overflowY: "auto", display: "grid", gap: 14 }}>
              {healthModal === "diagnosis" && (
                <HealthDiagnosisCard healthPlan={healthPlan} />
              )}
              {healthModal === "dedoduro" && (
                <>
                  {habits.topLeaks.map((l) => (
                    <div className="budget-card" key={l.category}>
                      <div className="budget-row-top">
                        <strong>{l.category}</strong>
                        <strong>{money(l.amountCents)} ({l.sharePct}%)</strong>
                      </div>
                    </div>
                  ))}
                  {habits.smallLeaks.examples.length > 0 && (
                    <div className="budget-card">
                      <strong>Exemplos de gastos pequenos (≤ R$ 50)</strong>
                      <ul className="budget-events" style={{ marginTop: 8 }}>
                        {habits.smallLeaks.examples.map((ex, i) => (
                          <li key={i}>
                            <span>{fmtDate(ex.date)} · {ex.description}</span>
                            <strong>{money(ex.amountCents)}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {healthModal === "tesouraco" && (
                <>
                  {habits.recurringItems.length > 0 ? (
                    <div className="budget-list">
                      {habits.recurringItems.map((r) => (
                        <div className="budget-card" key={r.id}>
                          <div className="budget-row-top">
                            <span><strong>{r.description}</strong> <small className="hint">({r.category})</small></span>
                            <strong>{money(r.monthlyCents)}/mês ({money(r.annualCents)}/ano)</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty>Nenhuma assinatura ou recorrência fixa encontrada para corte.</Empty>
                  )}
                </>
              )}
              {healthModal === "milestones" && (
                <PlanningGoalsPanel healthPlan={healthPlan} />
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGoal && (() => {
        const g = selectedGoal.raw;
        const pType = g.plan_type || "purchase";
        const planItems = Array.isArray(g.quotes_json?.[0]?.items) ? g.quotes_json[0].items : [];
        const pricedItems = planItems.filter((it) => cents(it.amountCents) > 0);
        const linkedBudget = g.budget_category_id
          ? budgetItems.find((b) => String(b.categoryId) === String(g.budget_category_id))
          : null;
        const uncheckedItems = planItems.filter((it) => !it.checked);
        const checkedItems = planItems.filter((it) => it.checked);

        return (
          <div
            className="action-overlay open"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedGoal(null);
            }}
          >
            <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="goalDetailTitle">
              <div className="dialog-head">
                <div>
                  <div className="eyebrow">
                    {pType === "shopping_list" ? "LISTA DE COMPRAS" : pType === "trip" ? "VIAGEM / PROJETO" : "COMPRA PLANEJADA"}
                  </div>
                  <h2 id="goalDetailTitle">{g.title}</h2>
                </div>
                <button type="button" className="dialog-close" onClick={() => setSelectedGoal(null)} aria-label="Fechar">
                  <X size={17} />
                </button>
              </div>
              <div className="detail-layout" style={{ padding: 0 }}>
                {/* MODO LISTA DE COMPRAS (Estilo Lembretes iOS) */}
                {pType === "shopping_list" ? (
                  <>
                    <div className={`goal-verdict ${!linkedBudget || linkedBudget.limitCents === null || (linkedBudget.remainingCents ?? 0) >= cents(g.target_cents) ? "ok" : "warn"}`}>
                      <ListChecks size={18} />
                      <div>
                        <strong>
                          Teto da compra: {money(cents(g.target_cents))} · {checkedItems.length}/{planItems.length} no carrinho
                        </strong>
                        <small>
                          {linkedBudget && linkedBudget.limitCents !== null
                            ? `Orçamento ${linkedBudget.categoryName}: restam ${money(linkedBudget.remainingCents ?? 0)} no mês.`
                            : `Data prevista: ${fmtDate(g.desired_on)}`}
                        </small>
                      </div>
                    </div>

                    <form
                      className="checklist-quick-add"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const label = inlineListItemText.trim();
                        if (!label) return;
                        const newItem = {
                          id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                          title: label.slice(0, 120),
                          amountCents: 0,
                          paymentMethod: "standard",
                          creditCardId: null,
                          installmentCount: 1,
                          checked: false,
                        };
                        setInlineListItemText("");
                        await saveGoalItems(g, [...planItems, newItem]);
                      }}
                    >
                      <input
                        placeholder="Adicionar item na hora (ex.: Leite, Pão)..."
                        value={inlineListItemText}
                        maxLength={120}
                        onChange={(e) => setInlineListItemText(e.target.value)}
                      />
                      <button type="submit" className="pill pill-primary pill-compact">
                        <Plus size={15} /> Add
                      </button>
                    </form>

                    {planItems.length ? (
                      <div className="ios-checklist">
                        {uncheckedItems.map((it) => (
                          <button
                            type="button"
                            key={it.id}
                            className="ios-check-row"
                            onClick={() =>
                              saveGoalItems(
                                g,
                                planItems.map((x) => (x.id === it.id ? { ...x, checked: true } : x))
                              )
                            }
                          >
                            <span className="ios-check-circle" aria-hidden="true" />
                            <span className="ios-check-title">{it.title}</span>
                            {cents(it.amountCents) > 0 && <small className="ios-check-price">{money(it.amountCents)}</small>}
                          </button>
                        ))}
                        {checkedItems.length > 0 && (
                          <div className="ios-check-done-group">
                            <span className="field-caption">No carrinho ({checkedItems.length})</span>
                            {checkedItems.map((it) => (
                              <button
                                type="button"
                                key={it.id}
                                className="ios-check-row done"
                                onClick={() =>
                                  saveGoalItems(
                                    g,
                                    planItems.map((x) => (x.id === it.id ? { ...x, checked: false } : x))
                                  )
                                }
                              >
                                <span className="ios-check-circle checked" aria-hidden="true">
                                  <Check size={13} strokeWidth={3} />
                                </span>
                                <span className="ios-check-title">{it.title}</span>
                                {cents(it.amountCents) > 0 && <small className="ios-check-price">{money(it.amountCents)}</small>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Empty>Nenhum item cadastrado nesta lista. Use o campo acima para adicionar.</Empty>
                    )}

                    <div className="detail-actions">
                      <button
                        type="button"
                        className="pill pill-primary"
                        style={{ justifyContent: "center" }}
                        onClick={() => {
                          const pricedSum = pricedItems.reduce((s, it) => s + cents(it.amountCents), 0);
                          const defaultAmt = pricedSum > 0 ? pricedSum : cents(g.target_cents);
                          setSelectedGoal(null);
                          setCheckoutListPlan({
                            goal: g,
                            amountMask: centsToMask(defaultAmt),
                            walletId: g.selected_wallet_id || checkingWallets[0]?.id || wallets[0]?.id || "",
                            creditCardId: g.credit_card_id || "",
                            paidOn: TODAY,
                            category: linkedBudget?.categoryName || "Alimentação",
                          });
                        }}
                      >
                        <CheckCircle2 size={16} /> Finalizar no caixa
                      </button>
                      <button
                        type="button"
                        className="light-button"
                        disabled={busy}
                        onClick={() => reuseGoalList(g)}
                      >
                        Reutilizar lista (novo mês)
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`goal-verdict ${selectedGoal.sim.isFeasible ? "ok" : "warn"}`}>
                      <Award size={18} />
                      <div>
                        <strong>
                          {selectedGoal.sim.isFeasible
                            ? `Cabe no plano na data desejada (${fmtDate(g.desired_on)})`
                            : selectedGoal.sim.firstFeasibleDate
                              ? `Melhor momento: a partir de ${fmtDate(selectedGoal.sim.firstFeasibleDate)}`
                              : "Ainda não cabe no plano"}
                        </strong>
                        <small>
                          {selectedGoal.sim.bottleneckDate
                            ? `Gargalo em ${fmtDate(selectedGoal.sim.bottleneckDate)} (falta de ${money(selectedGoal.sim.bottleneckShortfallCents)}).`
                            : `Todas as ${selectedGoal.sim.installmentCountVerified || 1} parcela(s) verificadas sem comprometer o piso protegido.`}
                        </small>
                      </div>
                    </div>

                    {pricedItems.length > 0 && (
                      <div className="wizard-items-box">
                        <div className="section-header" style={{ marginBottom: 6 }}>
                          <span className="field-caption" style={{ fontWeight: 600 }}>Itens deste planejamento ({pricedItems.length})</span>
                          <strong style={{ fontSize: 13 }}>{money(pricedItems.reduce((s, it) => s + cents(it.amountCents), 0))}</strong>
                        </div>
                        <ul className="wizard-items-list">
                          {pricedItems.map((it) => {
                            const cName = it.creditCardId ? creditCards.find((c) => c.id === it.creditCardId)?.name : null;
                            return (
                              <li key={it.id}>
                                <span>
                                  <strong>{it.title}</strong>
                                  <small className="hint" style={{ marginLeft: 6 }}>
                                    {it.paymentMethod === "credit_card"
                                      ? `${it.installmentCount || 1}x no cartão${cName ? ` (${cName})` : ""}`
                                      : "À vista / Conta"}
                                  </small>
                                </span>
                                <strong>{money(it.amountCents)}</strong>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {selectedGoal.sim.projectedPositions && (
                      <div className="positions-grid">
                        <div className="position-box">
                          <div className="position-box-head"><Wallet size={15} /> <strong>Conta bancária</strong></div>
                          <small>
                            Na data: <strong>{money(selectedGoal.sim.projectedPositions.walletPosition.balanceOnDateBeforeCents)}</strong> →{" "}
                            <strong className={selectedGoal.sim.projectedPositions.walletPosition.balanceOnDateAfterCents < 0 ? "red" : ""}>
                              {money(selectedGoal.sim.projectedPositions.walletPosition.balanceOnDateAfterCents)}
                            </strong>
                          </small>
                          <small>
                            Menor saldo futuro: <strong>{money(selectedGoal.sim.projectedPositions.walletPosition.minFutureBalanceAfterCents)}</strong>
                          </small>
                        </div>
                        {selectedGoal.sim.projectedPositions.caixinhaPosition && (
                          <div className="position-box">
                            <div className="position-box-head"><PiggyBank size={15} /> <strong>{selectedGoal.sim.projectedPositions.caixinhaPosition.caixinhaTitle}</strong></div>
                            <small>Guardado: <strong>{money(selectedGoal.sim.projectedPositions.caixinhaPosition.currentBalanceCents)}</strong> / {money(selectedGoal.sim.projectedPositions.caixinhaPosition.targetForPlanCents)}</small>
                            <small>Faltam {money(selectedGoal.sim.projectedPositions.caixinhaPosition.stillNeededCents)}</small>
                          </div>
                        )}
                        {(selectedGoal.sim.projectedPositions.cardPositions?.length
                          ? selectedGoal.sim.projectedPositions.cardPositions
                          : selectedGoal.sim.projectedPositions.cardPosition
                            ? [selectedGoal.sim.projectedPositions.cardPosition]
                            : []
                        ).map((cp) => (
                          <div className="position-box" key={cp.cardId}>
                            <div className="position-box-head"><CreditCard size={15} /> <strong>{cp.cardName}</strong></div>
                            <small>
                              Limite na data: <strong>{money(cp.availableLimitBeforeCents)}</strong> →{" "}
                              <strong>{money(cp.availableLimitAfterCents)}</strong>
                            </small>
                            <small>1ª fatura: {cp.firstInvoiceMonth}</small>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="detail-actions">
                      <button
                        type="button"
                        className="dark-button"
                        onClick={() => {
                          const savedQuotes = Array.isArray(g.quotes_json) && g.quotes_json.length > 0
                            ? g.quotes_json.map((q) => ({
                                ...q,
                                target: centsToMask(cents(q.targetCents)),
                                downPayment: centsToMask(cents(q.downPaymentCents)),
                                installmentCount: String(q.installmentCount || 1),
                                interestPct: q.interestBps ? String((Number(q.interestBps) / 100).toFixed(2)).replace(".", ",") : "",
                              }))
                            : null;
                          setSelectedGoal(null);
                          setForm({
                            ...defaultForm("expense"),
                            goalId: g.id,
                            goalPlanType: g.plan_type || "purchase",
                            goalBudgetCategoryId: g.budget_category_id || "",
                            goalQuotes: savedQuotes,
                            description: g.title,
                            goalTarget: centsToMask(cents(g.target_cents)),
                            goalDownPayment: centsToMask(cents(g.down_payment_cents)),
                            goalInstallments: String(g.installment_count || 1),
                            goalDesiredOn: isoDate(g.desired_on) || TODAY,
                            downPaymentSource: g.source_goal_id ? "caixinha" : "checking",
                            sourceGoalId: g.source_goal_id || "",
                            goalPaymentMethod: g.payment_method || "standard",
                            goalCreditCardId: g.credit_card_id || creditCards[0]?.id || "",
                            idempotencyKey: crypto.randomUUID(),
                          });
                          setSelectedTitle(null);
                          setError("");
                          setDrawer("goal_sim");
                        }}
                      >
                        Editar planejamento
                      </button>
                      <button
                        type="button"
                        className="pill pill-outline-orange"
                        style={{ justifyContent: "center" }}
                        onClick={() => {
                          const execItems = buildExecutionTitlesFromGoal(g, {
                            defaultWalletId: checkingWallets[0]?.id || wallets[0]?.id || "",
                            defaultCategory: linkedBudget?.categoryName || "Outros",
                            today: TODAY,
                          }).map((it) => ({ ...it, selected: true }));
                          if (pricedItems.length > 0 || execItems.length > 1) {
                            setSelectedGoal(null);
                            setBatchExecutePlan({
                              goal: g,
                              items: execItems,
                              dueOn: isoDate(g.desired_on) >= TODAY ? isoDate(g.desired_on) : TODAY,
                              category: linkedBudget?.categoryName || "Outros",
                              markFulfilled: true,
                            });
                            return;
                          }
                          const win = selectedGoal.comparison?.winner;
                          const amtCents = win?.targetCents || cents(g.target_cents);
                          const inst = win?.installmentCount || Number(g.installment_count || 1);
                          const ccId = win?.creditCardId || g.credit_card_id || "";
                          setSelectedGoal(null);
                          setForm({
                            ...defaultForm("expense"),
                            intent: "bill",
                            direction: "expense",
                            description: g.title,
                            amount: centsToMask(amtCents),
                            category: linkedBudget?.categoryName || "",
                            mode: inst > 1 ? "installments" : "single",
                            count: String(Math.max(2, Math.min(60, inst))),
                            valueMode: "total",
                            creditCardId: ccId,
                            walletId: g.selected_wallet_id || checkingWallets[0]?.id || "",
                            occurredOn: TODAY,
                            dueOn: isoDate(g.desired_on) >= TODAY ? isoDate(g.desired_on) : TODAY,
                            settlementState: "pending",
                            idempotencyKey: crypto.randomUUID(),
                          });
                          setSelectedTitle(null);
                          setError("");
                          setDrawer("title");
                        }}
                      >
                        {pricedItems.length > 0 ? `Efetivar ${pricedItems.length} itens` : "Efetivar em lançamento"}
                      </button>
                    </div>
                  </>
                )}

                {pType === "shopping_list" && (
                  <button
                    type="button"
                    className="light-button"
                    onClick={() => {
                      const savedQuotes = Array.isArray(g.quotes_json) && g.quotes_json.length > 0
                        ? g.quotes_json.map((q) => ({
                            ...q,
                            target: centsToMask(cents(q.targetCents)),
                            downPayment: centsToMask(cents(q.downPaymentCents)),
                            installmentCount: String(q.installmentCount || 1),
                            interestPct: "",
                          }))
                        : null;
                      setSelectedGoal(null);
                      setForm({
                        ...defaultForm("expense"),
                        goalId: g.id,
                        goalPlanType: "shopping_list",
                        goalBudgetCategoryId: g.budget_category_id || "",
                        goalQuotes: savedQuotes,
                        description: g.title,
                        goalTarget: centsToMask(cents(g.target_cents)),
                        goalDesiredOn: isoDate(g.desired_on) || TODAY,
                        downPaymentSource: "checking",
                        sourceGoalId: "",
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setDrawer("goal_sim");
                    }}
                  >
                    Editar nome, teto ou orçamento da lista
                  </button>
                )}

              <button
                type="button"
                className="light-button"
                disabled={busy}
                onClick={async () => {
                  const id = selectedGoal.raw.id;
                  setSelectedGoal(null);
                  await cancelGoal(id, false);
                }}
              >
                <Trash2 size={15} /> Remover planejamento
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {compareModalOpen && (() => {
        const picked = purchaseGoals.filter((g) => compareIds.includes(g.id));
        const compared = compareSavedPlans(data || {}, picked, { today: TODAY });
        return (
          <div
            className="action-overlay open"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCompareModalOpen(false);
            }}
          >
            <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="comparePlansTitle">
              <div className="dialog-head">
                <div>
                  <div className="eyebrow">COMPARAÇÃO LADO A LADO</div>
                  <h2 id="comparePlansTitle">Qual planejamento cabe melhor?</h2>
                </div>
                <button type="button" className="dialog-close" onClick={() => setCompareModalOpen(false)} aria-label="Fechar">
                  <X size={17} />
                </button>
              </div>
              {compared.winner && (
                <div className="goal-verdict ok" style={{ marginBottom: 14 }}>
                  <Award size={18} />
                  <div>
                    <strong>Melhor escolha: {compared.winner.title}</strong>
                    <small>
                      {compared.winnerReasonText}
                      {compared.totalSavedVsWorstCents > 0 ? ` · Diferença de até ${money(compared.totalSavedVsWorstCents)} no custo total.` : ""}
                    </small>
                  </div>
                </div>
              )}
              <div className="compare-quotes-grid">
                {compared.plans.map((p) => {
                  const minAfter = p.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0;
                  const cardAfter = p.sim.projectedPositions?.cardPosition?.availableLimitAfterCents;
                  return (
                    <div key={p.id} className={`quote-compare-card${p.isWinner ? " winner" : ""}`}>
                      <div className="quote-compare-head">
                        <strong>{p.title}</strong>
                        <span className={`status ${p.sim.isFeasible ? "done" : p.sim.firstFeasibleDate ? "partial" : "late"}`}>
                          {p.isWinner ? "🏆 Melhor" : p.sim.isFeasible ? "Viável" : "Aperta caixa"}
                        </span>
                      </div>
                      <div className="quote-compare-nums">
                        <span>Total: <strong>{money(p.sim.totalCostCents || p.targetCents)}</strong></span>
                        <span>{p.installmentCount > 1 ? `${p.installmentCount}x de ${money(p.sim.perInstallmentCents)}` : "À vista"}</span>
                      </div>
                      <small className="hint">
                        Data desejada: <strong>{fmtDate(p.desiredOn)}</strong> ·{" "}
                        {p.sim.isFeasible ? "Cabe na data" : p.sim.firstFeasibleDate ? `Cabe em ${fmtDate(p.sim.firstFeasibleDate)}` : "Sem folga no horizonte"}
                      </small>
                      <small className="hint">
                        Menor saldo futuro: <strong className={minAfter < 0 ? "red" : ""}>{money(minAfter)}</strong>
                        {cardAfter !== undefined ? ` · Limite cartão após: ${money(cardAfter)}` : ""}
                      </small>
                    </div>
                  );
                })}
              </div>
              <div className="detail-actions" style={{ marginTop: 14 }}>
                <button type="button" className="light-button" onClick={() => setCompareModalOpen(false)}>
                  Fechar comparação
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {batchExecutePlan && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBatchExecutePlan(null);
          }}
        >
          <form className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="batchExecTitle" onSubmit={executeBatchTitles}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">EFETIVAÇÃO INDIVIDUAL</div>
                <h2 id="batchExecTitle">{batchExecutePlan.goal.title}</h2>
              </div>
              <button type="button" className="dialog-close" onClick={() => setBatchExecutePlan(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <p className="hint" style={{ margin: "0 0 12px" }}>
              Cada item será lançado separadamente com sua própria forma de pagamento e parcelamento.
            </p>
            <div className="batch-items-list">
              {batchExecutePlan.items.map((it, idx) => {
                const cName = it.creditCardId ? creditCards.find((c) => c.id === it.creditCardId)?.name : null;
                const wName = wallets.find((w) => w.id === it.walletId)?.name || "Conta";
                return (
                  <label key={it.itemId || idx} className="batch-item-row">
                    <input
                      type="checkbox"
                      checked={it.selected}
                      onChange={(e) =>
                        setBatchExecutePlan((old) => ({
                          ...old,
                          items: old.items.map((x, i) => (i === idx ? { ...x, selected: e.target.checked } : x)),
                        }))
                      }
                    />
                    <span className="batch-item-info">
                      <strong>{it.description}</strong>
                      <small className="hint">
                        {it.paymentMethod === "credit_card"
                          ? `💳 ${cName || "Cartão"} · ${it.installmentCount}x`
                          : `🏦 ${wName} · ${it.installmentCount > 1 ? `${it.installmentCount}x` : "À vista"}`}
                      </small>
                    </span>
                    <strong>{money(it.amountCents)}</strong>
                  </label>
                );
              })}
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Data prevista / início
                <input
                  type="date"
                  required
                  value={batchExecutePlan.dueOn}
                  onChange={(e) =>
                    setBatchExecutePlan((old) => ({
                      ...old,
                      dueOn: e.target.value,
                      items: old.items.map((x) => ({ ...x, dueOn: e.target.value })),
                    }))
                  }
                />
              </label>
              <label>
                Categoria dos lançamentos
                <select
                  value={batchExecutePlan.category}
                  onChange={(e) =>
                    setBatchExecutePlan((old) => ({
                      ...old,
                      category: e.target.value,
                      items: old.items.map((x) => ({ ...x, category: e.target.value })),
                    }))
                  }
                >
                  {(data?.categories || [])
                    .filter((c) => c.direction === "expense" && !c.parent_id)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="kc-check" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={batchExecutePlan.markFulfilled}
                onChange={(e) => setBatchExecutePlan((old) => ({ ...old, markFulfilled: e.target.checked }))}
              />
              <span className="kc-check-box" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
              <span>Marcar planejamento como concluído após lançar</span>
            </label>
            <div className="detail-actions" style={{ marginTop: 14 }}>
              <button type="button" className="light-button" onClick={() => setBatchExecutePlan(null)}>
                Cancelar
              </button>
              <button type="submit" className="pill pill-primary" style={{ justifyContent: "center" }} disabled={busy}>
                {busy
                  ? "Lançando..."
                  : `Lançar ${batchExecutePlan.items.filter((x) => x.selected).length} item(ns)`}
              </button>
            </div>
          </form>
        </div>
      )}

      {checkoutListPlan && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCheckoutListPlan(null);
          }}
        >
          <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="checkoutListTitle" onSubmit={submitCheckoutList}>
            <div className="dialog-head">
              <div>
                <div className="eyebrow">FINALIZAR COMPRA NO CAIXA</div>
                <h2 id="checkoutListTitle">{checkoutListPlan.goal.title}</h2>
              </div>
              <button type="button" className="dialog-close" onClick={() => setCheckoutListPlan(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="form-group">
              <label>
                Valor total real pago no caixa (R$)
                <MoneyInput
                  value={checkoutListPlan.amountMask}
                  onChange={(v) => setCheckoutListPlan((old) => ({ ...old, amountMask: v }))}
                  ariaLabel="Valor pago no caixa"
                />
              </label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="field-caption">Forma de pagamento</span>
                <button
                  type="button"
                  className={`tiny-btn${checkoutListPlan.splitMode ? " active" : ""}`}
                  onClick={() =>
                    setCheckoutListPlan((old) => {
                      if (old.splitMode) return { ...old, splitMode: false };
                      return {
                        ...old,
                        splitMode: true,
                        splits: [
                          {
                            id: `sp-ck-${Date.now()}`,
                            paymentMethod: old.creditCardId ? "credit_card" : "standard",
                            creditCardId: old.creditCardId || "",
                            walletId: old.walletId || checkingWallets[0]?.id || "",
                            sourceGoalId: "",
                            amountMask: old.amountMask || "0,00",
                            installmentCount: "1",
                            interestPct: "",
                          },
                        ],
                      };
                    })
                  }
                >
                  {checkoutListPlan.splitMode ? "Usar 1 meio" : "+ Dividir pagamento"}
                </button>
              </div>

              {checkoutListPlan.splitMode ? (
                <PaymentSplitEditor
                  totalCents={(() => { try { return maskToCents(checkoutListPlan.amountMask || "0,00"); } catch { return 0; } })()}
                  splits={checkoutListPlan.splits || []}
                  wallets={checkingWallets}
                  creditCards={creditCards}
                  rawData={data}
                  allowCaixinha={false}
                  allowInstallments={false}
                  onChange={(nextSplits) => setCheckoutListPlan((old) => ({ ...old, splits: nextSplits }))}
                />
              ) : (
                <label>
                  Conta ou cartão utilizado
                  <select
                    value={checkoutListPlan.creditCardId ? `card:${checkoutListPlan.creditCardId}` : checkoutListPlan.walletId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("card:")) {
                        const cid = v.slice(5);
                        const c = creditCards.find((x) => x.id === cid);
                        setCheckoutListPlan((old) => ({
                          ...old,
                          creditCardId: cid,
                          walletId: c?.default_wallet_id || old.walletId,
                        }));
                      } else {
                        setCheckoutListPlan((old) => ({ ...old, creditCardId: "", walletId: v }));
                      }
                    }}
                  >
                    {checkingWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        🏦 {w.name}
                      </option>
                    ))}
                    {creditCards.map((c) => (
                      <option key={c.id} value={`card:${c.id}`}>
                        💳 {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="form-grid">
                <label>
                  Categoria
                  <select
                    value={checkoutListPlan.category}
                    onChange={(e) => setCheckoutListPlan((old) => ({ ...old, category: e.target.value }))}
                  >
                    {(data?.categories || [])
                      .filter((c) => c.direction === "expense" && !c.parent_id)
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Data da compra
                  <input
                    type="date"
                    required
                    max={TODAY}
                    value={checkoutListPlan.paidOn}
                    onChange={(e) => setCheckoutListPlan((old) => ({ ...old, paidOn: e.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="detail-actions" style={{ marginTop: 14 }}>
              <button type="button" className="light-button" onClick={() => setCheckoutListPlan(null)}>
                Voltar
              </button>
              <button type="submit" className="pill pill-primary" style={{ justifyContent: "center" }} disabled={busy}>
                {busy ? "Registrando..." : "Confirmar pagamento"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedCaixinha && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedCaixinha(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="caixinhaDetailTitle">
            <div className="dialog-head">
              <div>
                <div className="eyebrow">{selectedCaixinha.bankName || "CAIXINHA"}</div>
                <h2 id="caixinhaDetailTitle">{selectedCaixinha.raw.title}</h2>
              </div>
              <button type="button" className="dialog-close" onClick={() => setSelectedCaixinha(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="detail-layout" style={{ padding: 0 }}>
              <div className={`goal-verdict ${selectedCaixinha.pace.remainingCents === 0 || selectedCaixinha.pace.onPace ? "ok" : "warn"}`}>
                <PiggyBank size={18} />
                <div>
                  <strong>
                    {selectedCaixinha.pace.remainingCents === 0
                      ? "Meta alcançada!"
                      : `Guarde ${money(selectedCaixinha.pace.requiredMonthlyCents)}/mês para atingir até ${fmtDate(selectedCaixinha.raw.desired_on)}`}
                  </strong>
                  <small>
                    Guardado nesta caixinha: {money(selectedCaixinha.pace.currentCapitalCents)} ({selectedCaixinha.pace.progressPct}%) de{" "}
                    {money(selectedCaixinha.pace.targetCents)}. Faltam {money(selectedCaixinha.pace.remainingCents)}.
                  </small>
                </div>
              </div>
              <div className="budget-bar" role="progressbar" aria-valuenow={selectedCaixinha.pace.progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="budget-fill" style={{ width: `${selectedCaixinha.pace.progressPct}%` }} />
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="dark-button"
                  onClick={() => {
                    const target = selectedCaixinha.raw;
                    setSelectedCaixinha(null);
                    openReserveCaixinha(target);
                  }}
                >
                  <PiggyBank size={16} /> Reservar ou resgatar valor
                </button>
                <button
                  type="button"
                  className="pill pill-outline-orange"
                  style={{ justifyContent: "center" }}
                  onClick={() => {
                    const targetGoal = selectedCaixinha.raw;
                    const savedCents = Math.max(0, selectedCaixinha.saved || 0);
                    setSelectedCaixinha(null);
                    setForm({
                      ...defaultForm("expense"),
                      goalId: null,
                      goalPlanType: "purchase",
                      goalWizardStep: 2,
                      goalActiveQuoteIdx: 0,
                      goalQuotes: null,
                      description: targetGoal.title,
                      goalTarget: centsToMask(Math.max(cents(targetGoal.target_cents), savedCents)),
                      goalDownPayment: centsToMask(savedCents),
                      goalInstallments: "12",
                      goalDesiredOn: isoDate(targetGoal.desired_on) >= TODAY ? isoDate(targetGoal.desired_on) : TODAY,
                      downPaymentSource: "caixinha",
                      sourceGoalId: targetGoal.id,
                      goalPaymentMethod: creditCards.length > 0 ? "credit_card" : "standard",
                      goalCreditCardId: creditCards[0]?.id || "",
                      idempotencyKey: crypto.randomUUID(),
                    });
                    setSelectedTitle(null);
                    setError("");
                    setDrawer("goal_sim");
                  }}
                >
                  <CreditCard size={16} /> Planejar compra com esta caixinha
                </button>
                <button
                  type="button"
                  className="light-button"
                  disabled={busy}
                  onClick={async () => {
                    const id = selectedCaixinha.raw.id;
                    setSelectedCaixinha(null);
                    await cancelGoal(id, true);
                  }}
                >
                  <Trash2 size={15} /> Excluir caixinha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedWallet && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedWallet(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="walletActionTitle">
            <div className="dialog-head">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BankIcon name={selectedWallet.name} size={42} />
                <div>
                  <div className="eyebrow">
                    {(selectedWallet.is_reserved || selectedWallet.wallet_kind === "reserve" || selectedWallet.wallet_kind === "investment")
                      ? "CONTA DE RESERVA / CAIXINHA"
                      : "CONTA DE USO DIÁRIO"}
                  </div>
                  <h2 id="walletActionTitle">{selectedWallet.name}</h2>
                </div>
              </div>
              <button type="button" className="dialog-close" onClick={() => setSelectedWallet(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div className="invoice-limit-box">
                <span className="hint">Saldo realizado atual</span>
                <strong style={{ fontSize: 24, color: "var(--kc-ink)" }}>{display(walletBalance(selectedWallet))}</strong>
                <span className="hint">
                  Abertura registrada em {selectedWallet.opening_at ? fmtDate(selectedWallet.opening_at) : "data não informada"}
                </span>
              </div>
              <div className="action-menu">
                <button
                  type="button"
                  onClick={() => {
                    const w = selectedWallet;
                    setSelectedWallet(null);
                    setForm({
                      ...defaultForm("expense"),
                      intent: "bill",
                      walletId: w.id,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    setSelectedTitle(null);
                    setError("");
                    setDrawer("title");
                  }}
                >
                  <span>
                    Novo lançamento nesta conta
                    <small>Registrar conta a pagar ou valor a receber em {selectedWallet.name}</small>
                  </span>
                  <span>›</span>
                </button>
                {checkingWallets.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const w = selectedWallet;
                      const other = checkingWallets.find((x) => x.id !== w.id) || checkingWallets[0];
                      setSelectedWallet(null);
                      setForm({
                        ...defaultForm("expense"),
                        intent: "transfer",
                        fromWalletId: w.id,
                        toWalletId: other?.id || "",
                        transferredOn: TODAY,
                        settlementState: "paid",
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setSelectedTitle(null);
                      setError("");
                      setDrawer("title");
                    }}
                  >
                    <span>
                      Transferir para outro banco
                      <small>Mover saldo de uso diário entre suas contas bancárias</small>
                    </span>
                    <span>›</span>
                  </button>
                )}
                {capitalGoals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const w = selectedWallet;
                      const match = capitalGoals.find((g) => g.parent_wallet_id === w.id) || capitalGoals[0];
                      setSelectedWallet(null);
                      setForm({
                        ...defaultForm("expense"),
                        caixinhaId: match?.id || "",
                        fromWalletId: w.id,
                        reserveBankFilter: "",
                        reserveDirection: "deposit",
                        transferredOn: TODAY,
                        amount: "",
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setSelectedTitle(null);
                      setError("");
                      setDrawer("reserve_caixinha");
                    }}
                  >
                    <span>
                      Reservar em uma Caixinha
                      <small>Separar dinheiro desta conta para seus objetivos ou reserva</small>
                    </span>
                    <span>›</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWallet(null);
                    setManageWalletsOpen(true);
                  }}
                >
                  <span>
                    Arquivar ou gerenciar contas
                    <small>Abrir painel de contas ativas, arquivadas e cadastrar nova conta</small>
                  </span>
                  <span>›</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setConfirmDialog(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
            <div className="dialog-head">
              <h2 id="confirmDialogTitle">{confirmDialog.title}</h2>
              <button type="button" className="dialog-close" onClick={() => setConfirmDialog(null)} aria-label="Fechar" disabled={busy}>
                <X size={17} />
              </button>
            </div>
            <p className="hint" style={{ margin: "0 0 18px" }}>{confirmDialog.body}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setConfirmDialog(null)} disabled={busy}>
                Voltar
              </button>
              <button type="button" className="pill pill-primary pill-compact" onClick={confirmDialog.onConfirm} disabled={busy}>
                {busy ? "Processando..." : confirmDialog.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {drawer && (
        <EntryDrawer
          key={`${drawer}:${String(selectedTitle || "new")}:${form.intent || ""}`}
          drawer={drawer}
          form={form}
          setForm={setForm}
          selectedTitleObj={selectedTitleObj}
          settlements={data?.settlements || []}
          walletBalances={walletBalanceMap}
          caixinhas={capitalGoals}
          wallets={checkingWallets.length ? checkingWallets : wallets}
          categories={data?.categories || []}
          budgets={budgetItems}
          selectedMonth={selectedMonth}
          monthlyIncomeCents={monthlyIncomeCents}
          rawData={data}
          rules={data?.recurringRules || []}
          spendingPlans={data?.spendingPlans || []}
          spendingPlanApplications={data?.spendingPlanApplications || []}
          busy={busy}
          error={error}
          onSave={submit}
          onClose={() => setDrawer(null)}
          onAction={handleAction}
          onAddCategory={addCategory}
          people={data?.people || []}
          onAddPerson={addPerson}
          creditCards={creditCards}
          safeContribution={safeContribution}
          cancellations={data?.cancellations || []}
          isMobilePhone={isMobilePhone}
        />
      )}

      {cancelTarget && (
        <CancelScopeDialog
          key={cancelTarget.id}
          title={cancelTarget}
          busy={busy}
          error={cancelError}
          onCancel={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}

      <CreditCardInvoiceModal
        key={invoiceModal ? `${invoiceModal.cardId}:${invoiceModal.month}` : "closed"}
        open={Boolean(invoiceModal)}
        card={invoiceModal ? creditCards.find((c) => c.id === invoiceModal.cardId) || null : null}
        initialMonth={invoiceModal?.month || TODAY.slice(0, 7)}
        titles={expanded?.titles || []}
        wallets={checkingWallets.length ? checkingWallets : wallets}
        today={TODAY}
        busy={busy}
        onClose={() => setInvoiceModal(null)}
        onPayInvoice={payCreditCardInvoice}
        onNewPurchase={(cardId) => {
          const card = creditCards.find((c) => c.id === cardId);
          setForm({
            ...defaultForm("expense"),
            intent: "bill",
            direction: "expense",
            creditCardId: cardId,
            walletId: card?.default_wallet_id || wallets[0]?.id || "",
            settlementState: "pending",
            occurredOn: TODAY,
            dueOn: TODAY,
          });
          setSelectedTitle(null);
          setError("");
          setDrawer("title");
        }}
        onSelectTitle={(titleId) => open("detail", titleId)}
      />

      <ManageWalletsModal
        open={manageWalletsOpen}
        allWallets={allWallets.filter((w) => !w.parent_wallet_id && !w.caixinha_purpose)}
        walletBalance={walletBalance}
        busy={busy}
        onClose={() => setManageWalletsOpen(false)}
        onNewWallet={() => open("wallet")}
        onArchiveWallet={archiveWallet}
        onUnarchiveWallet={unarchiveWallet}
      />

      <GuidedTour
        open={tourOpen}
        onSelectTab={setTab}
        onClose={() => {
          setTourOpen(false);
          const tourKey = `kc_tour_done_${user?.email || "user"}`;
          if (typeof window !== "undefined") window.localStorage.setItem(tourKey, "done");
        }}
      />
    </div>
  );
}
