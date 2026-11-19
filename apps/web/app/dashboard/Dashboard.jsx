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
} from "lucide-react";
import { authClient } from "../../lib/auth/client";
import { money, cents, brDay, isoDate } from "../../lib/finance";
import { computeRange, lastDayOfMonth, firstDayOfMonth, moveMonth, inRange } from "../../lib/period";
import { computeMonthlyIncomeCeilingCents, computeProjectedBalanceWithBudgetsCents, computeTotalDebtCents } from "../../lib/budgets";
import { buildNotifications } from "../../lib/notifications";
import { simulateGoalPurchase } from "../../lib/goal-planner";
import { computeCapitalPace } from "../../lib/capital-pace";
import { analyzeConsumptionHabits } from "../../lib/habit-analyzer";
import { maskToDecimal, centsToMask } from "../../lib/money-input";
import { expandRecurring } from "../../lib/recurring";
import { buildFinancialHealthPlan } from "../../lib/financial-health";
import EntryDrawer from "./EntryDrawer";
import MovementList from "./MovementList";
import BudgetList from "./BudgetList";
import CancelScopeDialog from "./CancelScopeDialog";
import FinanceChart from "./FinanceChart";
import HealthDiagnosisCard from "./HealthDiagnosisCard";
import PlanningGoalsPanel from "./PlanningGoalsPanel";

const TABS = [
  ["overview", "Visão geral"],
  ["movements", "Movimentos"],
  ["planning", "Planejamento"],
  ["patrimony", "Meu Capital"],
  ["health", "Saúde financeira"],
  ["profile", "Perfil"],
];

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
  goalTarget: "2.500,00",
  goalDownPayment: "0,00",
  goalInstallments: "1",
  goalDesiredOn: TODAY,
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
  overview: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), showPlanned: true, showRealized: true, showCategories: true },
  movements: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), direction: "all", status: "all" },
  planning: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), onlyFeasible: false },
  patrimony: { rangeStart: TODAY, date: lastDayOfMonth(TODAY), walletKind: "all" },
  health: { rangeStart: TODAY, date: lastDayOfMonth(TODAY) },
});

export default function Dashboard({ user }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState("overview");
  const [screenFilters, setScreenFilters] = useState(defaultScreenFilters);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [query, setQuery] = useState("");
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState("");
  const [actionMenu, setActionMenu] = useState(null); // "add" | "create" | "budget_pick" | null
  const [filterOpen, setFilterOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [healthModal, setHealthModal] = useState(null); // "diagnosis" | "dedoduro" | "tesouraco" | "milestones" | null
  const [planningView, setPlanningView] = useState("goals"); // "goals" | "budgets"
  const filterRef = useRef(null);

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

  async function refresh() {
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

  const expanded = useMemo(
    () => expandRecurring(data || {}, rangeStart < TODAY ? rangeStart : TODAY, date < TODAY ? TODAY : date),
    [data, rangeStart, date]
  );
  const summary = useMemo(() => computeRange(expanded, rangeStart, date, TODAY), [expanded, rangeStart, date]);
  const healthPlan = useMemo(
    () => (data ? buildFinancialHealthPlan(data, { today: TODAY, previousSnapshot: data.latestHealthSnapshot || null }) : null),
    [data]
  );

  const wallets = data?.wallets || [];
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
          .filter((x) => !x.reversed_at && x.wallet_id === w.id && w.opening_at && new Date(x.created_at) > new Date(w.opening_at))
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
  const checkingBalanceCents = useMemo(
    () =>
      wallets
        .filter((w) => !w.is_reserved && w.wallet_kind !== "reserve" && w.wallet_kind !== "investment")
        .reduce((sum, w) => sum + (walletBalance(w) ?? 0), 0),
    [wallets, data]
  );
  const capitalBalanceCents = useMemo(
    () =>
      wallets
        .filter((w) => w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment")
        .reduce((sum, w) => sum + (walletBalance(w) ?? 0), 0),
    [wallets, data]
  );
  const projectedBalanceCents = useMemo(
    () =>
      computeProjectedBalanceWithBudgetsCents({
        openingOperationalCents: summary.knownCash ? checkingBalanceCents : 0,
        rows,
        budgetSummary: budgetItems,
      }),
    [summary.knownCash, checkingBalanceCents, rows, budgetItems]
  );
  const totalDebtCents = useMemo(
    () =>
      computeTotalDebtCents({
        titles: expanded?.titles || [],
        liabilities: data?.liabilities || [],
        knownCash: summary.knownCash,
      }),
    [expanded, data, summary.knownCash]
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

  function open(kind, id, intentOverride = null) {
    const t = titles.find((item) => item.id === id);
    const dir = kind === "income" ? "income" : t?.direction || "expense";
    const nextIntent = intentOverride || (kind === "income" ? "bill" : "spent");
    setForm({
      ...defaultForm(dir),
      intent: nextIntent,
      settlementState: nextIntent === "spent" ? "paid" : "pending",
      walletId: t?.wallet_id || wallets[0]?.id || "",
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
    setDrawer(kind);
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

  function openCapitalTransfer() {
    const checking = wallets.find((w) => !w.is_reserved && w.wallet_kind !== "reserve" && w.wallet_kind !== "investment") || wallets[0];
    const capital = wallets.find((w) => w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment") || wallets[1] || wallets[0];
    const suggested = capitalBudget?.limitCents > 0 ? centsToMask(capitalBudget.limitCents) : "";
    setForm({
      ...defaultForm("expense"),
      fromWalletId: checking?.id || "",
      toWalletId: capital?.id || "",
      amount: suggested,
      transferredOn: TODAY,
    });
    setSelectedTitle(null);
    setError("");
    setDrawer("transfer_capital");
  }

  async function suggestBudgets() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("POST", { action: "suggest_budgets", month: selectedMonth });
      await refresh();
      setNotice("Orçamentos 50-30-20 e Carteira de Capital gerados a partir da sua renda do mês.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
      dueOn: isoDate(t.due_on),
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

  async function cancelGoal(goalId) {
    setBusy(true);
    setError("");
    try {
      await request("PATCH", { action: "cancel_goal", goalId });
      await refresh();
      setNotice("Simulação removida.");
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

  async function cancelPlan(planId) {
    if (!window.confirm("Cancelar esta previsão de gasto? Nenhuma compra já realizada será alterada.")) return;
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
    }
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
        const walletKind = form.walletKind || "checking";
        await request("POST", {
          action: "wallet",
          name: form.name,
          balance: maskToDecimal(form.balance, { allowNegative: true }),
          walletKind,
          liquidityKind: walletKind === "investment" ? "d_plus" : "immediate",
          isReserved: walletKind === "reserve" || walletKind === "investment",
        });
      } else if (drawer === "transfer_capital") {
        await request("POST", {
          action: "transfer_capital",
          fromWalletId: form.fromWalletId,
          toWalletId: form.toWalletId,
          amount: maskToDecimal(form.amount),
          transferredOn: form.transferredOn || TODAY,
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
        const interestBps = Math.min(
          10000,
          Math.max(0, Math.round(Number(String(form.goalInterestPct || "0").replace(",", ".")) * 100) || 0)
        );
        await request("POST", {
          action: "goal",
          title: form.description || "Compra planejada",
          target: maskToDecimal(form.goalTarget || "0,00"),
          downPayment: maskToDecimal(form.goalDownPayment || "0,00"),
          installmentCount: Number(form.goalInstallments || 1),
          interestBps,
          desiredOn: form.goalDesiredOn || TODAY,
        });
      } else if (drawer === "capital_goal") {
        await request("POST", {
          action: "goal",
          category: "capital_goal",
          title: form.description || "Meta de capital",
          target: maskToDecimal(form.goalTarget || "0,00"),
          downPayment: "0.00",
          installmentCount: 1,
          desiredOn: form.goalDesiredOn || TODAY,
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
      } else if (drawer === "asset" || drawer === "liability") {
        await request("POST", { action: drawer, label: form.label, amount: maskToDecimal(form.amount) });
      } else if (drawer === "title" && form.direction === "expense" && form.intent === "plan") {
        await request("POST", {
          action: "spending_plan",
          description: form.description,
          category: form.category,
          amount: maskToDecimal(form.amount),
          plannedMonth: form.plannedMonth || TODAY.slice(0, 7),
          plannedFor: form.plannedFor || null,
          idempotencyKey: form.idempotencyKey || crypto.randomUUID(),
        });
      } else {
        const isBill = drawer === "title" && form.intent === "bill";
        const effectiveState = isBill
          ? form.direction === "income" && form.mode === "single"
            ? form.settlementState
            : "pending"
          : form.mode === "single"
            ? form.settlementState
            : "pending";
        const payload = {
          walletId: form.walletId,
          direction: form.direction,
          description: form.description,
          category: form.category,
          amount: maskToDecimal(form.amount),
          occurredOn: form.occurredOn || form.dueOn,
          dueOn: effectiveState === "paid" ? form.settledOn || TODAY : form.dueOn,
        };
        if (drawer === "edit") {
          const titleId = await materializeIfVirtual(selectedTitle);
          await request("PATCH", { action: "edit", titleId, ...payload });
        } else {
          await request("POST", {
            action: "title",
            ...payload,
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
      setNotice("Operação salva. Os valores e as projeções foram atualizados.");
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
      setNotice(`Exclusão confirmada. Obrigações pendentes canceladas: ${result.affected || 0}.${suffix}`);
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reverseSettlement(id) {
    if (!window.confirm("Desfazer esta baixa? O histórico será preservado e o valor voltará a ficar pendente.")) return;
    setBusy(true);
    setError("");
    try {
      await request("PATCH", { action: "reverse", settlementId: id });
      await refresh();
      setNotice("Baixa revertida. O histórico foi preservado.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopRecurring(id) {
    const t = titles.find((item) => item.id === id);
    if (!t?.series_id || !window.confirm("Encerrar a repetição a partir desta ocorrência? Meses anteriores serão mantidos."))
      return;
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
    const source = compact ? overviewRows.filter((x) => cents(x.amount_cents) > cents(x.settled_cents)).slice(0, 5) : rows;
    return (
      <MovementList
        items={source}
        compact={compact}
        today={TODAY}
        walletName={walletName}
        onDetails={(id) => open("detail", id)}
        onAction={handleAction}
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

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setTab("overview")} aria-label="kuantoconta, Visão geral">
          <span className="brand-mark">k</span>
          <span className="brand-name">kuantoconta</span>
        </button>
        <div className="topbar-right">
          <span className="preview-pill">V1 · Preview</span>
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
            className="avatar"
            title={user.email}
            aria-label="Abrir Perfil"
            onClick={() => setTab("profile")}
          >
            {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      {active !== "profile" && (
        <section className="toolbar" aria-label="Ações e período">
          <div className="toolbar-left">
            <button type="button" className="pill pill-primary" onClick={() => setActionMenu("add")}>
              <Plus size={17} aria-hidden="true" />
              Lançamento
            </button>
            <button type="button" className="pill pill-secondary" onClick={() => setActionMenu("create")}>
              Criar
            </button>
            {active === "planning" && (
              <div className="toolbar-segmented" role="tablist" aria-label="Visão de planejamento">
                <button
                  type="button"
                  role="tab"
                  aria-selected={planningView === "goals"}
                  className={planningView === "goals" ? "active" : ""}
                  onClick={() => setPlanningView("goals")}
                >
                  Compras planejadas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={planningView === "budgets"}
                  className={planningView === "budgets" ? "active" : ""}
                  onClick={() => setPlanningView("budgets")}
                >
                  Orçamentos 50-30-20
                </button>
              </div>
            )}
          </div>
          <div className="toolbar-right">
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
          </div>
        </section>
      )}

      {error && (
        <div className="notice error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice success" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="dashboard" aria-label="Conteúdo principal">
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
              <button type="button" className="card metric-card clickable" onClick={() => setTab("planning")}>
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
                      Uso: {money(checkingBalanceCents)} · Capital: {money(capitalBalanceCents)}
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
                  <button type="button" className="mini-pill" onClick={() => setTab("movements")}>
                    Carteira <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="commitments-body">{titlesTable(true)}</div>
              </article>

              <article className="card limits">
                <div className="limits-heading">
                  <div>
                    <div className="eyebrow">LIMITES MENSAIS</div>
                    <div className="month-heading">{monthLong}</div>
                  </div>
                  <button type="button" className="mini-pill" onClick={() => setTab("planning")}>
                    Gerenciar <ChevronRight size={15} aria-hidden="true" />
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
                  <button type="button" className="mini-pill" onClick={() => open("wallet")}>
                    <Plus size={14} aria-hidden="true" /> Nova conta
                  </button>
                </div>
                <div className="bank-box">
                  <div className="bank-box-header">
                    <strong>Suas contas</strong>
                    <span>{wallets.length} cadastradas</span>
                    <strong className="bank-total">{display(summary.liveCash)}</strong>
                  </div>
                  {wallets.length ? (
                    <div className="bank-rows">
                      {wallets.slice(0, 3).map((w) => (
                        <div className="account-row" key={w.id}>
                          {/nubank/i.test(w.name) ? (
                            <span className="nubank-symbol" aria-label={w.name}>
                              nu
                            </span>
                          ) : (
                            <span className="account-badge" aria-hidden="true">
                              <Wallet size={18} />
                            </span>
                          )}
                          <span className="account-name">{w.name}</span>
                          <span className="account-balance">
                            <strong>{display(walletBalance(w))}</strong>
                            <span>Saldo realizado</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty>Nenhuma conta cadastrada.</Empty>
                  )}
                </div>
              </article>
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
                    placeholder="Buscar título ou categoria"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="movements-period-nav">
                <button type="button" onClick={() => selectMonth(-1)} aria-label="Mês anterior">
                  ‹
                </button>
                <strong>{monthLong}</strong>
                <button type="button" onClick={() => selectMonth(1)} aria-label="Próximo mês">
                  ›
                </button>
              </div>
              {titlesTable()}
            </section>
          </div>
        )}

        {active === "planning" && (
          <div className="workspace">
            <div className="planning-stats">
              <div className="card kpi-panel">
                <span className="metric-label">Saldos em contas</span>
                <strong className="kpi-value">{display(summary.liveCash)}</strong>
                <span className="metric-sub">
                  Uso diário: {money(checkingBalanceCents)} · Capital: {money(capitalBalanceCents)}
                </span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">Limites do mês</span>
                <strong className="kpi-value">{money(allocatedBudgetCents)}</strong>
                <span className="metric-sub">
                  {monthlyIncomeCents > 0 ? `De ${money(monthlyIncomeCents)} a receber` : "Cadastre seus a receber"}
                </span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">Endividamento total</span>
                <strong className="kpi-value">{debtDisplay}</strong>
                <span className="metric-sub">Soma até a última parcela</span>
              </div>
            </div>

            {planningView === "goals" ? (
              <section className="card panel">
                <div className="card-heading" style={{ marginBottom: 16 }}>
                  <div>
                    <div className="eyebrow">COMPRAS E OBJETIVOS</div>
                    <h2 className="card-title">Planejamentos salvos</h2>
                  </div>
                  <button type="button" className="mini-pill" onClick={() => open("goal_sim")}>
                    <Plus size={14} /> Simular compra
                  </button>
                </div>
                {purchaseGoals.length ? (
                  <div className="goals-bento-grid">
                    {purchaseGoals
                      .map((g, idx) => ({
                        g,
                        idx,
                        sim: simulateGoalPurchase(
                          data || {},
                          {
                            title: g.title,
                            targetCents: cents(g.target_cents),
                            downPaymentCents: cents(g.down_payment_cents),
                            installmentCount: Number(g.installment_count || 1),
                            installmentCents: cents(g.installment_cents),
                            interestBps: Number(g.interest_bps || 0),
                            desiredOn: isoDate(g.desired_on) || TODAY,
                          },
                          { today: TODAY }
                        ),
                      }))
                      .filter(({ sim }) => !screenFilters.planning.onlyFeasible || sim.isFeasible || Boolean(sim.firstFeasibleDate))
                      .map(({ g, idx, sim }) => (
                        <button
                          type="button"
                          key={g.id || idx}
                          className="goal-bento-card"
                          onClick={() => setSelectedGoal({ raw: g, sim })}
                        >
                          <div className="goal-bento-top">
                            <span className="goal-bento-icon">
                              <Compass size={18} />
                            </span>
                            <span className={`status ${sim.isFeasible ? "done" : sim.firstFeasibleDate ? "partial" : "late"}`}>
                              {sim.isFeasible ? "Viável na data" : sim.firstFeasibleDate ? `A partir de ${fmtDate(sim.firstFeasibleDate)}` : "Ainda não cabe"}
                            </span>
                          </div>
                          <strong>{g.title}</strong>
                          <div className="goal-bento-meta">
                            <span>{money(cents(g.target_cents))}</span>
                            <small>{g.installment_count > 1 ? `${g.installment_count}x de ${money(cents(g.installment_cents))}` : "À vista"}</small>
                          </div>
                        </button>
                      ))}
                  </div>
                ) : (
                  <Empty>
                    Nenhum planejamento de compra salvo. Clique em &ldquo;+ Novo planejamento&rdquo; para descobrir o melhor momento para comprar.
                  </Empty>
                )}
              </section>
            ) : (
              <>
                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 14 }}>
                    <div>
                      <div className="eyebrow">TETO PELA RENDA · 50-30-20</div>
                      <h2 className="card-title">Distribuição dos orçamentos</h2>
                    </div>
                    <div className="toolbar-buttons">
                      {monthlyIncomeCents > 0 ? (
                        <>
                          <button type="button" className="mini-pill" disabled={busy} onClick={suggestBudgets}>
                            Gerar 50-30-20
                          </button>
                          {wallets.length >= 2 && (
                            <button type="button" className="mini-pill" onClick={openCapitalTransfer}>
                              Efetivar aporte Capital
                            </button>
                          )}
                          <button type="button" className="mini-pill" onClick={() => setActionMenu("budget_pick")}>
                            Configurar limite
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="pill pill-primary"
                          onClick={() => open("income", null, "bill")}
                        >
                          <Plus size={15} /> Cadastrar a receber
                        </button>
                      )}
                    </div>
                  </div>
                  {monthlyIncomeCents <= 0 ? (
                    <div className="alert">
                      <AlertTriangle size={16} />
                      <span>
                        Cadastre seus valores a receber de {monthLong} primeiro para liberar a criação e sugestão automática de orçamentos.
                      </span>
                    </div>
                  ) : (
                    <div className="allocation-summary" style={{ marginBottom: 0 }}>
                      <div>
                        <span>A receber no mês</span>
                        <strong>{money(monthlyIncomeCents)}</strong>
                      </div>
                      <div>
                        <span>Alocado nos orçamentos · Disponível: {money(remainingAllocableCents)}</span>
                        <strong>{money(allocatedBudgetCents)}</strong>
                      </div>
                    </div>
                  )}
                </section>

                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="eyebrow">ORÇAMENTOS DO MÊS</div>
                      <h2 className="card-title">Limites de {monthLong}</h2>
                    </div>
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

                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 16 }}>
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
              </>
            )}
          </div>
        )}

        {active === "patrimony" && (
          <div className="workspace">
            <div className="planning-stats">
              <div className="card kpi-panel">
                <span className="metric-label">Capital formado hoje</span>
                <strong className="kpi-value">{summary.knownCash ? money(capitalBalanceCents) : "A calcular"}</strong>
                <span className="metric-sub">Carteiras de Capital e Reserva</span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">Capital projetado em {fmtDate(date)}</span>
                <strong className="kpi-value">{summary.knownCash ? money(capitalProjectedAtDateCents) : "A calcular"}</strong>
                <span className="metric-sub">Considerando aportes previstos no período</span>
              </div>
              <div className="card kpi-panel">
                <span className="metric-label">Endividamento total</span>
                <strong className="kpi-value">{debtDisplay}</strong>
                <span className="metric-sub">Soma até a última parcela</span>
              </div>
            </div>

            <section className="card panel">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">RITMO DE FORMAÇÃO DE CAPITAL</div>
                  <h2 className="card-title">Metas de capital</h2>
                </div>
                <button type="button" className="mini-pill" onClick={() => open("capital_goal")}>
                  <Target size={14} /> Nova meta de capital
                </button>
              </div>
              {capitalGoals.length ? (
                <div className="budget-list">
                  {capitalGoals.map((g) => {
                    const pace = computeCapitalPace({
                      targetCents: cents(g.target_cents),
                      targetDate: isoDate(g.desired_on) || END,
                      currentCapitalCents: capitalBalanceCents,
                      monthlyContributionCents: capitalBudget?.limitCents || 0,
                      today: TODAY,
                    });
                    return (
                      <article className="budget-card" key={g.id}>
                        <div className="budget-row-top">
                          <div className="budget-expand">
                            <strong>{g.title}</strong>
                            <span className={`status ${pace.onPace ? "done" : "late"}`}>
                              {pace.onPace ? "No ritmo" : "Abaixo do ritmo"}
                            </span>
                          </div>
                          <div className="budget-right">
                            <span className="budget-remaining">
                              Meta: <strong>{money(pace.targetCents)}</strong> até {fmtDate(g.desired_on)}
                            </span>
                            <button
                              type="button"
                              className="tiny-btn"
                              aria-label={`Remover meta ${g.title}`}
                              onClick={() => cancelGoal(g.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="budget-bar" role="progressbar" aria-valuenow={pace.progressPct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="budget-fill" style={{ width: `${pace.progressPct}%` }} />
                        </div>
                        <div className="budget-meta">
                          <span>
                            Acumulado: <strong>{money(pace.currentCapitalCents)}</strong> ({pace.progressPct}%) ·{" "}
                            {pace.onPace
                              ? `Aporte atual (${money(pace.monthlyContributionCents)}/mês) bate a meta`
                              : `Precisa de ${money(pace.requiredMonthlyCents)}/mês (faltam +${money(pace.monthlyGapCents)}/mês)`}
                          </span>
                          <span>Faltam: {money(pace.remainingCents)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty>
                  Defina uma meta de capital (ex.: R$ 5.000 até dezembro) para acompanhar se seus aportes estão no ritmo certo.
                </Empty>
              )}
            </section>

            <section className="card panel">
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

            <section className="card panel">
              <div className="card-heading" style={{ marginBottom: 14 }}>
                <h2 className="card-title">Contas bancárias e carteiras</h2>
                <div className="toolbar-buttons">
                  {wallets.length >= 2 && (
                    <button type="button" className="mini-pill" onClick={openCapitalTransfer}>
                      Efetivar aporte
                    </button>
                  )}
                  <button type="button" className="mini-pill" onClick={() => open("wallet")}>
                    <Plus size={14} /> Nova conta
                  </button>
                </div>
              </div>
              <div className="wallet-list">
                {wallets.length ? (
                  wallets
                    .filter((w) => {
                      const wf = screenFilters.patrimony.walletKind || "all";
                      const isCap = w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment";
                      if (wf === "checking") return !isCap;
                      if (wf === "capital") return isCap;
                      return true;
                    })
                    .map((w) => {
                      const isCap = w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment";
                      return (
                        <article className="account-panel-row" key={w.id}>
                          <div className="account-icon">
                            <Wallet size={20} />
                          </div>
                          <div className="account-info">
                            <h3>
                              {w.name}{" "}
                              <span className="small-flag" style={{ marginLeft: 6, fontSize: 10 }}>
                                {isCap ? "Capital / Reserva" : "Uso diário"}
                              </span>
                            </h3>
                            <p>Saldo inicial em {w.opening_at ? fmtDate(w.opening_at) : "data não informada"}</p>
                          </div>
                          <strong>{display(walletBalance(w))}</strong>
                        </article>
                      );
                    })
                ) : (
                  <Empty>Nenhuma conta cadastrada.</Empty>
                )}
              </div>
            </section>

            <div className="register-grid">
              <section className="card panel" style={{ opacity: 0.92 }}>
                <div className="card-heading">
                  <div>
                    <div className="eyebrow">VISÃO COMPLEMENTAR</div>
                    <h2 className="card-title">Patrimônio líquido em {fmtDate(date)}</h2>
                  </div>
                </div>
                <div className="large-line">{display(netWorthAtDateCents)}</div>
                <p className="hint">Caixa total projetado + bens declarados − endividamento restante.</p>
              </section>
              <section className="card panel" style={{ opacity: 0.92 }}>
                <div className="card-heading">
                  <h2 className="card-title">Bens e imóveis (secundário)</h2>
                  <button type="button" className="tiny-btn" onClick={() => open("asset")}>
                    <Plus size={15} /> Adicionar
                  </button>
                </div>
                <div className="large-line">{money(summary.assets)}</div>
                <p className="hint">Bens imobilizados fora do capital líquido.</p>
              </section>
            </div>
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
                  <strong className="kpi-value">{money(ind.outstandingDebtCents)}</strong>
                  <span className="metric-sub">Dívida restante · Ver diagnóstico ›</span>
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
                  <FinanceChart type="gauge" data={[{ value: commitPct, name: "Comprometido" }]} height={115} />
                </div>
              </div>

              {/* Linha 2: Dedo Duro & Tesouraço com Gráficos */}
              <div className="register-grid">
                <section className="card panel">
                  <div className="card-heading" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="eyebrow">DEDO DURO · PADRÕES DE CONSUMO</div>
                      <h2 className="card-title">Onde o dinheiro escoa</h2>
                    </div>
                    <button type="button" className="mini-pill" onClick={() => setHealthModal("dedoduro")}>
                      Detalhes <ChevronRight size={14} />
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
                      <div className="eyebrow">TESOURAÇO · REEDUCAÇÃO</div>
                      <h2 className="card-title">Potencial de corte</h2>
                    </div>
                    <button type="button" className="mini-pill" onClick={() => setHealthModal("tesouraco")}>
                      Onde cortar <ChevronRight size={14} />
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

              {/* Linha 3: Stepper Horizontal de Recuperação */}
              <section className="card panel">
                <div className="card-heading" style={{ marginBottom: 16 }}>
                  <div>
                    <div className="eyebrow">LINHA DO TEMPO · HORIZONTE 12 MESES</div>
                    <h2 className="card-title">Marcos de recuperação</h2>
                  </div>
                  <button type="button" className="mini-pill" onClick={() => setHealthModal("milestones")}>
                    Capacidade alocável <ChevronRight size={14} />
                  </button>
                </div>
                <div className="health-stepper">
                  {[
                    ["1. Contas cobertas", fmtM(miles.firstCoveredMonth), Boolean(miles.firstCoveredMonth)],
                    ["2. Início dos aportes", fmtM(miles.firstSavingMonth), Boolean(miles.firstSavingMonth)],
                    ["3. Estabilidade", fmtM(miles.firstStableMonth), Boolean(miles.firstStableMonth)],
                  ].map(([title, when, reached]) => (
                    <div className={`health-step${reached ? " reached" : ""}`} key={title}>
                      <span className="health-step-dot" aria-hidden="true" />
                      <div>
                        <span>{title}</span>
                        <strong>{when}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
        })()}

        {active === "profile" && (
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
                  Prévia restrita. Dados financeiros protegidos por autenticação. Não informe dados reais até a homologação legal.
                </p>
                <button
                  type="button"
                  className="pill pill-primary"
                  style={{ marginTop: 14 }}
                  onClick={async () => {
                    await authClient.signOut();
                    window.location.replace("/auth/sign-in");
                  }}
                >
                  <LogOut size={16} /> Sair da conta
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <nav className="bottom-dock" aria-label="Navegação principal">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`dock-item${active === key ? " active" : ""}${key === "profile" ? " profile" : ""}`}
            aria-current={active === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

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
                {actionMenu === "add"
                  ? "Adicionar"
                  : actionMenu === "create"
                    ? "Criar"
                    : "Definir limite mensal"}
              </h2>
              <button type="button" className="dialog-close" onClick={() => setActionMenu(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>

            {actionMenu === "add" && (
              <div className="action-menu">
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("title", null, "spent");
                  }}
                >
                  <span>
                    Gastei
                    <small>Registrar uma despesa realizada ou no crédito</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("title", null, "bill");
                  }}
                >
                  <span>
                    Tenho uma conta
                    <small>Registrar um compromisso a pagar ou a receber</small>
                  </span>
                  <span>›</span>
                </button>
              </div>
            )}

            {actionMenu === "create" && (
              <div className="action-menu">
                <button
                  type="button"
                  onClick={() => {
                    setActionMenu(null);
                    open("wallet");
                  }}
                >
                  <span>
                    Nova conta
                    <small>Cadastrar uma conta bancária ou carteira</small>
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionMenu("budget_pick")}
                >
                  <span>
                    Novo limite
                    <small>Definir limite mensal para uma categoria</small>
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
                    Novo planejamento de compra
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
                    Nova meta de capital
                    <small>Definir quanto quer acumular até uma data e acompanhar o ritmo</small>
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
                    Novo ativo
                    <small>Registrar bem ou investimento fora das contas</small>
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
                    Novo empréstimo / financiamento
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
                  <span className="field-caption">Tipo de conta</span>
                  <div className="filter-pills">
                    {[
                      ["all", "Todas"],
                      ["checking", "Uso diário"],
                      ["capital", "Capital / Reserva"],
                    ].map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        className={(screenFilters.patrimony.walletKind || "all") === k ? "active" : ""}
                        onClick={() => setScreenFilter("patrimony", { walletKind: k })}
                      >
                        {l}
                      </button>
                    ))}
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
                      if (n.action === "transfer_capital") openCapitalTransfer();
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
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="healthModalTitle" style={{ maxWidth: 560 }}>
            <div className="dialog-head">
              <h2 id="healthModalTitle">
                {healthModal === "diagnosis"
                  ? "Diagnóstico financeiro"
                  : healthModal === "dedoduro"
                    ? "Dedo Duro · Detalhes de consumo"
                    : healthModal === "tesouraco"
                      ? "Tesouraço · Onde cortar"
                      : "Capacidade alocável e prioridades"}
              </h2>
              <button type="button" className="dialog-close" onClick={() => setHealthModal(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div style={{ maxHeight: "65vh", overflowY: "auto", display: "grid", gap: 14 }}>
              {healthModal === "diagnosis" && (
                <HealthDiagnosisCard healthPlan={healthPlan} onOpenPlanning={() => { setHealthModal(null); setTab("planning"); }} />
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
                <PlanningGoalsPanel rawData={data} healthPlan={healthPlan} busy={busy} section="health" />
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGoal && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedGoal(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="goalDetailTitle">
            <div className="dialog-head">
              <h2 id="goalDetailTitle">{selectedGoal.raw.title}</h2>
              <button type="button" className="dialog-close" onClick={() => setSelectedGoal(null)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
            <div className="detail-layout" style={{ padding: 0 }}>
              <div className={`goal-verdict ${selectedGoal.sim.isFeasible ? "ok" : "warn"}`}>
                <Compass size={18} />
                <div>
                  <strong>
                    {selectedGoal.sim.isFeasible
                      ? `Cabe no plano na data desejada (${fmtDate(selectedGoal.raw.desired_on)})`
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

              {selectedGoal.sim.twoStepVerdict && (
                <div className="repeat-config">
                  <div className="repeat-preview" style={{ borderTop: 0, paddingTop: 0 }}>
                    <span>
                      <strong>1. Entrada ({money(selectedGoal.sim.twoStepVerdict.downPaymentCents)}):</strong>{" "}
                      {selectedGoal.sim.twoStepVerdict.hasDownPaymentNow
                        ? "Disponível hoje"
                        : selectedGoal.sim.twoStepVerdict.downPaymentReadyDate
                          ? `Pronta em ${fmtDate(selectedGoal.sim.twoStepVerdict.downPaymentReadyDate)}`
                          : "Insuficiente no horizonte"}
                    </span>
                    <span>
                      <strong>2. Parcela ({money(selectedGoal.sim.twoStepVerdict.perInstallmentCents)}/mês):</strong>{" "}
                      {selectedGoal.sim.twoStepVerdict.installmentFitsMonthly
                        ? `Cabe na sobra mensal (${money(selectedGoal.sim.twoStepVerdict.monthlyFreeSurplusCents)}/mês)`
                        : `Não cabe (${money(selectedGoal.sim.twoStepVerdict.monthlyFreeSurplusCents)}/mês · faltam ${money(selectedGoal.sim.twoStepVerdict.monthlyGapCents)}/mês)`}
                    </span>
                    {selectedGoal.sim.totalInterestCents > 0 && (
                      <span>
                        <strong>Juros totais:</strong> {money(selectedGoal.sim.totalInterestCents)} · Custo final:{" "}
                        {money(selectedGoal.sim.totalCostCents)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {selectedGoal.sim.scenarios?.length > 0 && (
                <div className="goal-scenarios">
                  <strong>Comparação de cenários</strong>
                  <ul>
                    {selectedGoal.sim.scenarios.map((s) => (
                      <li key={s.id}>
                        <span>{s.label}</span>
                        <strong className={s.feasible ? "" : "red"}>
                          {s.feasible ? `Viável (${fmtDate(s.startDate)})` : "Inviável"}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="light-button"
                disabled={busy}
                onClick={async () => {
                  const id = selectedGoal.raw.id;
                  setSelectedGoal(null);
                  await cancelGoal(id);
                }}
              >
                <Trash2 size={15} /> Remover planejamento
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
          wallets={wallets}
          categories={data?.categories || []}
          budgets={budgetItems}
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
          cancellations={data?.cancellations || []}
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
    </div>
  );
}
