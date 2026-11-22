"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  GripVertical,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  PiggyBank,
  Plane,
  Plus,
  ReceiptText,
  RotateCcw,
  Scissors,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import BudgetList from "./BudgetList";
import FinanceChart from "./FinanceChart";
import BankIcon from "./BankIcon";
import {
  DEFAULT_DESKTOP_COLUMNS,
  WORKSPACE_COLUMN_META,
} from "../../lib/workspace-columns";
import { computeCardUsage, computeInvoiceCycleForPurchase } from "../../lib/credit-cards";
import { computeCapitalPace } from "../../lib/capital-pace";
import { comparePlanningQuotes } from "../../lib/goal-planner";

const COLUMN_ICONS = {
  overview: LayoutGrid,
  movements: ReceiptText,
  budgets: SlidersHorizontal,
  planning: Compass,
  patrimony: Wallet,
  health: Activity,
};

const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role='button'], .clickable-card, .clickable-row, .budget-card, .goal-bento-card, canvas, [data-no-drag]";

export default function DesktopWorkspace({
  columns = DEFAULT_DESKTOP_COLUMNS,
  columnSettings = {},
  onChangeColumns,
  onChangeColumnSettings,
  addPopoverOpen = false,
  onToggleAddPopover,
  focusColumnKey = null,
  onFocusHandled,
  // Financial data & handlers from Dashboard
  today,
  date,
  monthLong,
  monthOnly,
  summary,
  display,
  money,
  cents,
  isoDate,
  fmtDate,
  projectedBalanceCents,
  checkingBalanceCents,
  capitalBalanceCents,
  caixinhaBalance,
  debtDisplay,
  titlesTable,
  budgetItems,
  monthlyIncomeCents,
  allocatedBudgetCents,
  remainingAllocableCents,
  months,
  expenses,
  charts,
  showCategories,
  filter,
  setFilter,
  query,
  setQuery,
  checkingWallets,
  wallets,
  walletBalance,
  bankCaixinhasTotal,
  creditCards,
  expandedTitles,
  capitalGoals,
  purchaseGoals,
  reserveCaixinhasCents,
  goalCaixinhasCents,
  reservedThisMonthCents,
  safeContribution,
  capitalBudget,
  capitalProjectedAtDateCents,
  netWorthAtDateCents,
  peopleLoans,
  healthPlan,
  habits,
  data,
  screenFilters,
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
  onOpenEvolutionModal,
  Empty,
}) {
  const viewportRef = useRef(null);
  const colRefs = useRef({});
  const dragState = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const [customizingKey, setCustomizingKey] = useState(null);
  const [dragColKey, setDragColKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const updateScrollEdges = () => {
    const el = viewportRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 12);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12);
  };

  useEffect(() => {
    updateScrollEdges();
    const onResize = () => updateScrollEdges();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [columns.length]);

  // Smoothly scroll to requested column (e.g. newly added or focused from KPI)
  useEffect(() => {
    if (!focusColumnKey) return;
    const target = colRefs.current[focusColumnKey];
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
    onFocusHandled?.();
  }, [focusColumnKey, columns.length]);

  // Close menus on outside click / Escape
  useEffect(() => {
    if (!openMenuKey) return;
    const onDown = (e) => {
      if (!e.target.closest?.("[data-col-menu]")) setOpenMenuKey(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenuKey(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuKey]);

  const scrollByAmount = (delta) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  const handleWheel = (e) => {
    const el = viewportRef.current;
    if (!el) return;
    // Support Shift+Scroll horizontal navigation without interfering with normal vertical scroll inside columns
    if (e.shiftKey && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.(INTERACTIVE_SELECTOR)) return;
    const el = viewportRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
    };
  };

  const handleMouseMove = (e) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    if (!dragState.current.moved && Math.abs(dx) < 6) return;
    dragState.current.moved = true;
    setIsDraggingPan(true);
    const el = viewportRef.current;
    if (el) el.scrollLeft = dragState.current.startScroll - dx;
  };

  const handleMouseUp = () => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    setIsDraggingPan(false);
  };

  const handleClickCapture = (e) => {
    if (dragState.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragState.current.moved = false;
    }
  };

  const focusOrOpenColumn = (key) => {
    if (!columns.includes(key)) {
      onChangeColumns([...columns, key], key);
    } else {
      const target = colRefs.current[key];
      target?.scrollIntoView?.({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  };

  const toggleColumnSetting = (colKey, settingKey) => {
    const cur = columnSettings[colKey] || { showCharts: true, compact: false };
    onChangeColumnSettings({
      ...columnSettings,
      [colKey]: { ...cur, [settingKey]: !cur[settingKey] },
    });
  };

  const renderColumnContent = (colKey) => {
    const cfg = columnSettings[colKey] || { showCharts: true, compact: false };

    if (colKey === "overview") {
      return (
        <div className="col-stack">
          <div className="col-kpi-grid">
            <button type="button" className="card col-kpi-card clickable-card" onClick={() => { setFilter("expense"); focusOrOpenColumn("movements"); }}>
              <span className="col-kpi-head">
                <span className="metric-icon sm"><ArrowDown size={16} aria-hidden="true" /></span>
                <span className="metric-label">A pagar</span>
              </span>
              <strong className="col-kpi-val">{display(summary.payable.total)}</strong>
            </button>
            <button type="button" className="card col-kpi-card clickable-card" onClick={() => { setFilter("income"); focusOrOpenColumn("movements"); }}>
              <span className="col-kpi-head">
                <span className="metric-icon sm"><ArrowUp size={16} aria-hidden="true" /></span>
                <span className="metric-label">A receber</span>
              </span>
              <strong className="col-kpi-val">{display(summary.receivable.total)}</strong>
            </button>
            <button type="button" className="card col-kpi-card clickable-card" onClick={() => focusOrOpenColumn("budgets")}>
              <span className="col-kpi-head">
                <span className="metric-icon sm"><TrendingUp size={16} aria-hidden="true" /></span>
                <span className="metric-label">Saldo previsto</span>
              </span>
              <strong className={`col-kpi-val ${projectedBalanceCents < 0 ? "red" : ""}`}>{display(projectedBalanceCents)}</strong>
              {summary.knownCash && capitalBalanceCents > 0 && (
                <span className="metric-sub-mini">Uso: {money(checkingBalanceCents)} · Reserva: {money(capitalBalanceCents)}</span>
              )}
            </button>
            <button type="button" className="card col-kpi-card clickable-card" onClick={() => focusOrOpenColumn("patrimony")}>
              <span className="col-kpi-head">
                <span className="metric-icon sm"><Coins size={16} aria-hidden="true" /></span>
                <span className="metric-label">Endividamento</span>
              </span>
              <strong className="col-kpi-val">{debtDisplay}</strong>
            </button>
          </div>

          <div className="col-section-card">
            <div className="card-heading">
              <h3 className="col-section-title">Próximos compromissos</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => focusOrOpenColumn("movements")}>
                Ver todos <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="commitments-body">{titlesTable(true)}</div>
          </div>

          {cfg.showCharts !== false && (
            <>
              <div className="col-section-card" data-no-drag>
                <div className="eyebrow">PERÍODO SELECIONADO</div>
                <h3 className="col-section-title" style={{ marginBottom: 8 }}>Receitas e despesas</h3>
                {months.length && months.some((m) => m.income || m.expense) ? (
                  <FinanceChart type="bar" data={months} height={190} />
                ) : (
                  <Empty>Sem movimentos no período.</Empty>
                )}
              </div>
              {showCategories && (
                <div className="col-section-card" data-no-drag>
                  <div className="eyebrow">DISTRIBUIÇÃO</div>
                  <h3 className="col-section-title" style={{ marginBottom: 8 }}>Despesas por categoria</h3>
                  {expenses.length ? (
                    <FinanceChart type="donut" data={expenses} height={195} />
                  ) : (
                    <Empty>Sem despesas no período.</Empty>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (colKey === "movements") {
      return (
        <div className="col-stack">
          <div className="col-mini-stats">
            <div className="col-mini-stat">
              <span>A receber</span>
              <strong>{display(summary.receivable.total)}</strong>
            </div>
            <div className="col-mini-stat">
              <span>A pagar</span>
              <strong>{display(summary.payable.total)}</strong>
            </div>
            <div className="col-mini-stat">
              <span>Resultado</span>
              <strong className={summary.periodResult < 0 ? "red" : ""}>{display(summary.periodResult)}</strong>
            </div>
          </div>

          <div className="col-filters-bar">
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
            <label className="search-input" style={{ width: "100%" }}>
              <Search size={15} />
              <input
                placeholder="Buscar lançamento ou categoria"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="col-section-card">
            {titlesTable(false)}
          </div>
        </div>
      );
    }

    if (colKey === "budgets") {
      return (
        <div className="col-stack">
          <div className="col-section-card col-section-tint">
            <div className="card-heading">
              <div>
                <div className="eyebrow">ORÇAMENTOS DO MÊS</div>
                <div className="month-heading" style={{ fontSize: 18 }}>{monthLong}</div>
              </div>
              <button type="button" className="pill pill-outline-orange pill-compact" onClick={() => setActionMenu("budget_pick")}>
                Definir limite
              </button>
            </div>
            <div className="col-mini-stats" style={{ marginTop: 12 }}>
              <div className="col-mini-stat">
                <span>Renda prevista</span>
                <strong>{money(monthlyIncomeCents)}</strong>
              </div>
              <div className="col-mini-stat">
                <span>Orçado</span>
                <strong>{money(allocatedBudgetCents)}</strong>
              </div>
              <div className="col-mini-stat">
                <span>Livre</span>
                <strong>{money(remainingAllocableCents)}</strong>
              </div>
            </div>
          </div>

          <div className="col-section-card">
            <BudgetList
              items={budgetItems}
              monthLabel={monthLong}
              insufficientCash={summary.minCash !== null && summary.minCash < 0}
              compact={Boolean(cfg.compact)}
              onEditBudget={openBudget}
              onFulfillPlan={fulfillPlan}
              onEditPlan={editPlan}
              onCancelPlan={cancelPlan}
            />
          </div>

          <button type="button" className="pill pill-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={onOpenEvolutionModal}>
            Ver evolução mês a mês <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      );
    }

    if (colKey === "planning") {
      return (
        <div className="col-stack">
          <div className="col-kpi-grid">
            <div className="card col-kpi-card">
              <span className="metric-label">Em Caixinhas</span>
              <strong className="col-kpi-val">{summary.knownCash ? money(capitalBalanceCents) : "A calcular"}</strong>
              <span className="metric-sub-mini">Reserva: {money(reserveCaixinhasCents)}</span>
            </div>
            <div className="card col-kpi-card">
              <span className="metric-label">Em {monthOnly}</span>
              <strong className="col-kpi-val">{money(reservedThisMonthCents)}</strong>
              <span className="metric-sub-mini">
                {safeContribution.canContribute
                  ? `Aporte seguro: ${money(safeContribution.safeContributionCents)}`
                  : "Priorize compromissos"}
              </span>
            </div>
          </div>

          <div className="col-action-row">
            <button type="button" className="pill pill-secondary pill-compact" onClick={() => openReserveCaixinha()}>
              <PiggyBank size={14} aria-hidden="true" /> Reservar
            </button>
            <button type="button" className="pill pill-secondary pill-compact" onClick={() => open("capital_goal")}>
              <Plus size={14} aria-hidden="true" /> Caixinha
            </button>
            <button type="button" className="pill pill-primary pill-compact" onClick={() => open("goal_sim")}>
              <Compass size={14} aria-hidden="true" /> Planejar
            </button>
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Caixinhas</h3>
              <span className="small-flag">{capitalGoals.length} ativa(s)</span>
            </div>
            {capitalGoals.length ? (
              <div className="budget-list">
                {capitalGoals.map((g) => {
                  const saved = caixinhaBalance(g);
                  const bankWallet = checkingWallets.find((w) => w.id === g.parent_wallet_id) || wallets.find((w) => w.id === g.parent_wallet_id);
                  const pace = computeCapitalPace({
                    targetCents: cents(g.target_cents),
                    targetDate: isoDate(g.desired_on) || date,
                    currentCapitalCents: saved,
                    monthlyContributionCents: capitalBudget?.limitCents || 0,
                    today,
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <BankIcon name={bankWallet?.name || g.title} size={30} />
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
                      <div className="budget-bar" role="progressbar" aria-valuenow={pace.progressPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="budget-fill" style={{ width: `${pace.progressPct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty>Crie uma caixinha para separar dinheiro por objetivo.</Empty>
            )}
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Planejamentos</h3>
              <span className="small-flag">{purchaseGoals.length} ativo(s)</span>
            </div>
            {purchaseGoals.length ? (
              <div className="budget-list">
                {purchaseGoals
                  .map((g, idx) => {
                    const comparison = comparePlanningQuotes(data || {}, g, { today });
                    const chosenQ = comparison.quotes.find((q) => q.isChosen) || comparison.winner;
                    const sim = chosenQ?.sim || comparison.winner?.sim;
                    return { g, idx, comparison, sim };
                  })
                  .filter(({ sim }) => !screenFilters.planning.onlyFeasible || sim?.isFeasible || Boolean(sim?.firstFeasibleDate))
                  .map(({ g, idx, comparison, sim }) => {
                    const pType = g.plan_type || "purchase";
                    const TypeIcon = pType === "trip" ? Plane : pType === "shopping_list" ? ListChecks : Compass;
                    return (
                      <button
                        type="button"
                        key={g.id || idx}
                        className="goal-bento-card"
                        style={{ width: "100%" }}
                        onClick={() => setSelectedGoal({ raw: g, sim, comparison })}
                      >
                        <div className="goal-bento-top">
                          <span className="goal-bento-icon"><TypeIcon size={16} /></span>
                          <span className={`status ${sim.isFeasible ? "done" : sim.firstFeasibleDate ? "partial" : "late"}`}>
                            {sim.isFeasible ? "Viável" : sim.firstFeasibleDate ? `Em ${fmtDate(sim.firstFeasibleDate)}` : "Não cabe"}
                          </span>
                        </div>
                        <strong>{g.title}</strong>
                        <div className="goal-bento-meta">
                          <span>{money(cents(g.target_cents))}</span>
                          <small>{comparison.hasComparison ? `${comparison.quotes.length} cotações` : g.installment_count > 1 ? `${g.installment_count}x` : "À vista"}</small>
                        </div>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <Empty>Use Planejar para simular compras, viagens ou listas.</Empty>
            )}
          </div>
        </div>
      );
    }

    if (colKey === "patrimony") {
      return (
        <div className="col-stack">
          <div className="col-mini-stats">
            <div className="col-mini-stat">
              <span>Capital hoje</span>
              <strong>{summary.knownCash ? money(capitalBalanceCents) : "—"}</strong>
            </div>
            <div className="col-mini-stat">
              <span>Projetado</span>
              <strong>{summary.knownCash ? money(capitalProjectedAtDateCents) : "—"}</strong>
            </div>
            <div className="col-mini-stat">
              <span>Patrimônio</span>
              <strong>{display(netWorthAtDateCents)}</strong>
            </div>
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Contas bancárias</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setManageWalletsOpen(true)}>
                Gerenciar
              </button>
            </div>
            {checkingWallets.length ? (
              <div className="wallet-list">
                {checkingWallets.map((w) => {
                  const caixinhaSum = bankCaixinhasTotal(w.id);
                  return (
                    <button
                      type="button"
                      className="account-panel-row clickable-row"
                      key={w.id}
                      onClick={() => setSelectedWallet(w)}
                    >
                      <BankIcon name={w.name} size={34} />
                      <div className="account-info">
                        <h3>{w.name}</h3>
                        <p>{caixinhaSum > 0 ? `+ ${money(caixinhaSum)} em caixinhas` : "Uso diário"}</p>
                      </div>
                      <strong>{display(walletBalance(w))} ›</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty>Nenhuma conta cadastrada.</Empty>
            )}
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Cartões de crédito</h3>
              <button type="button" className="pill pill-outline-orange pill-compact" onClick={() => open("credit_card")}>
                <Plus size={13} aria-hidden="true" /> Novo
              </button>
            </div>
            {creditCards.length ? (
              <div className="budget-list">
                {creditCards.map((c) => {
                  const usage = computeCardUsage(c, expandedTitles || []);
                  const cyc = computeInvoiceCycleForPurchase({ purchaseDate: today, closingDay: c.closing_day, dueDay: c.due_day });
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className="budget-card clickable-card"
                      style={{ width: "100%" }}
                      onClick={() => setInvoiceModal({ cardId: c.id, month: cyc.invoiceMonth })}
                    >
                      <div className="budget-row-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <BankIcon name={c.name} size={30} />
                          <div>
                            <strong>{c.name}</strong>
                            <div className="hint">Vence dia {c.due_day}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>{money(usage.usedLimitCents)}</strong>
                          <div className="hint">Disp.: {money(usage.availableLimitCents)}</div>
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
              <Empty>Nenhum cartão cadastrado.</Empty>
            )}
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Carteira de pessoas</h3>
              <button type="button" className="pill pill-outline-orange pill-compact" onClick={() => open("title", null, "lend")}>
                <Plus size={13} aria-hidden="true" /> Emprestar
              </button>
            </div>
            {peopleLoans.length ? (
              <div className="budget-list">
                {peopleLoans.map(({ person, totalLentCents, openBalanceCents, openRepaymentTitles }) => (
                  <div className="budget-card" key={person.id}>
                    <div className="budget-row-top">
                      <div>
                        <strong>{person.name}</strong>
                        <div className="hint">
                          Emprestado: {money(totalLentCents)}
                          {openRepaymentTitles[0] && ` · Próx.: ${fmtDate(openRepaymentTitles[0].dueOn)}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ color: openBalanceCents > 0 ? "var(--kc-orange)" : "#067647" }}>
                          {openBalanceCents > 0 ? money(openBalanceCents) : "Quitado"}
                        </strong>
                        {openRepaymentTitles[0] && (
                          <button type="button" className="pill pill-outline-orange pill-compact" onClick={() => handleAction("settle", openRepaymentTitles[0].id)}>
                            Receber
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nenhum empréstimo registrado.</Empty>
            )}
          </div>

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 8 }}>
              <h3 className="col-section-title">Bens e imóveis</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => open("asset")}>
                <Plus size={13} aria-hidden="true" /> Adicionar
              </button>
            </div>
            <strong style={{ fontSize: 18 }}>{money(summary.assets)}</strong>
          </div>

          {cfg.showCharts !== false && summary.knownCash && charts.length > 0 && (
            <div className="col-section-card" data-no-drag>
              <div className="eyebrow">EVOLUÇÃO ATÉ {fmtDate(date)}</div>
              <h3 className="col-section-title" style={{ marginBottom: 8 }}>Projeção de caixa</h3>
              <FinanceChart type="line" data={charts} height={190} />
            </div>
          )}
        </div>
      );
    }

    if (colKey === "health") {
      if (!healthPlan) return <Empty>Carregando diagnóstico...</Empty>;
      const diag = healthPlan.diagnosis;
      const ind = diag.indicators;
      const miles = healthPlan.milestones;
      const STATE_LABELS = {
        red: ["Contas em risco", "late"],
        orange: ["Reorganizando", "review"],
        blue: ["Em equilíbrio", "pending"],
        green: ["Protegido", "done"],
        unknown: ["Dados pendentes", "pending"],
      };
      const [stateLabel, stateCls] = STATE_LABELS[diag.state] || STATE_LABELS.unknown;
      const reserveMonths = ind.emergencyCoverageMonths ?? 0;
      const reservePct = Math.min(100, Math.round((reserveMonths / 6) * 100));
      const commitPct = ind.incomeCommitmentRatio === null ? 0 : Math.round(ind.incomeCommitmentRatio * 100);
      const fmtM = (ym) =>
        ym ? new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "") : "A definir";

      return (
        <div className="col-stack">
          <div className="col-kpi-grid">
            <button type="button" className="card col-kpi-card clickable-card" onClick={() => setHealthModal("diagnosis")}>
              <div className="card-heading" style={{ width: "100%" }}>
                <span className="metric-label">Estado</span>
                <span className={`status ${stateCls}`}>{stateLabel}</span>
              </div>
              <strong className="col-kpi-val">{money(ind.outstandingDebtCents)}</strong>
              <span className="metric-sub-mini">Dívida · Diagnóstico ›</span>
            </button>
            <div className="card col-kpi-card">
              <span className="metric-label">Reserva líquida</span>
              <strong className="col-kpi-val">{ind.emergencyCoverageMonths === null ? "—" : `${reserveMonths.toFixed(1)} m`}</strong>
              <div className="budget-bar" role="progressbar" aria-valuenow={reservePct} aria-valuemin={0} aria-valuemax={100}>
                <div className="budget-fill" style={{ width: `${reservePct}%` }} />
              </div>
            </div>
          </div>

          {cfg.showCharts !== false && (
            <div className="col-section-card" data-no-drag>
              <div className="eyebrow">COMPROMETIMENTO DA RENDA</div>
              <FinanceChart type="gauge" data={[{ value: commitPct, name: "Comprometido" }]} height={140} />
            </div>
          )}

          <div className="col-section-card">
            <div className="card-heading" style={{ marginBottom: 10 }}>
              <h3 className="col-section-title">Marcos de recuperação</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setHealthModal("milestones")}>
                Detalhes <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="col-milestones-list">
              {[
                ["1. Contas cobertas", fmtM(miles.firstCoveredMonth)],
                ["2. Início dos aportes", fmtM(miles.firstSavingMonth)],
                ["3. Estabilidade", fmtM(miles.firstStableMonth)],
              ].map(([label, dt]) => (
                <div key={label} className="col-milestone-row">
                  <span>{label}</span>
                  <strong>{dt}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="col-section-card" data-no-drag>
            <div className="card-heading" style={{ marginBottom: 8 }}>
              <h3 className="col-section-title">Onde o dinheiro escoa</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setHealthModal("dedoduro")}>
                Detalhes
              </button>
            </div>
            {habits.topLeaks.length > 0 ? (
              <FinanceChart
                type="hbar"
                data={habits.topLeaks.map((l) => ({ name: l.category, value: l.amountCents, sharePct: l.sharePct }))}
                height={155}
              />
            ) : (
              <Empty>Sem despesas no período para mapear.</Empty>
            )}
          </div>

          <div className="col-section-card" data-no-drag>
            <div className="card-heading" style={{ marginBottom: 8 }}>
              <h3 className="col-section-title">Potencial de corte</h3>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setHealthModal("tesouraco")}>
                <Scissors size={13} aria-hidden="true" /> Cortes
              </button>
            </div>
            {habits.tesouraco.potentialMonthlySavingsCents > 0 ? (
              <span className="status done">
                Libera +{money(habits.tesouraco.potentialMonthlySavingsCents)}/mês ({money(habits.tesouraco.potentialAnnualSavingsCents)}/ano)
              </span>
            ) : (
              <Empty>Consumo enxuto neste período.</Empty>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="desktop-workspace-shell" data-tour="workspace">
      {canScrollLeft && (
        <button
          type="button"
          className="workspace-edge-nav left"
          aria-label="Rolar colunas para a esquerda"
          onClick={() => scrollByAmount(-420)}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          className="workspace-edge-nav right"
          aria-label="Rolar colunas para a direita"
          onClick={() => scrollByAmount(420)}
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div
        ref={viewportRef}
        className={`workspace-deck-viewport${isDraggingPan ? " is-dragging" : ""}`}
        onScroll={updateScrollEdges}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClickCapture={handleClickCapture}
        role="region"
        aria-label="Workspace financeiro em colunas"
      >
        {columns.map((colKey, idx) => {
          const meta = WORKSPACE_COLUMN_META[colKey];
          if (!meta) return null;
          const ColIcon = COLUMN_ICONS[colKey] || LayoutGrid;
          const isMenuOpen = openMenuKey === colKey;
          const isCustomizing = customizingKey === colKey;
          const cfg = columnSettings[colKey] || { showCharts: true, compact: false };

          return (
            <section
              key={colKey}
              ref={(el) => {
                if (el) colRefs.current[colKey] = el;
              }}
              className={`card workspace-column${dragOverKey === colKey ? " is-drag-over" : ""}`}
              aria-label={`Coluna ${meta.label}`}
              onDragOver={(e) => {
                if (dragColKey && dragColKey !== colKey) {
                  e.preventDefault();
                  setDragOverKey(colKey);
                }
              }}
              onDragLeave={() => {
                if (dragOverKey === colKey) setDragOverKey(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragColKey && dragColKey !== colKey) {
                  const next = [...columns];
                  const fromIdx = next.indexOf(dragColKey);
                  const toIdx = next.indexOf(colKey);
                  if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(toIdx, 0, moved);
                    onChangeColumns(next);
                  }
                }
                setDragColKey(null);
                setDragOverKey(null);
              }}
            >
              <header className="workspace-col-head">
                <div className="workspace-col-title-wrap">
                  <button
                    type="button"
                    className="workspace-drag-handle"
                    draggable
                    title="Arrastar para reordenar coluna"
                    aria-label={`Reordenar coluna ${meta.label}`}
                    onDragStart={(e) => {
                      setDragColKey(colKey);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", colKey);
                    }}
                    onDragEnd={() => {
                      setDragColKey(null);
                      setDragOverKey(null);
                    }}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                  </button>
                  <span className="workspace-col-icon"><ColIcon size={16} aria-hidden="true" /></span>
                  <h2 className="workspace-col-title">{meta.label}</h2>
                </div>

                <div className="workspace-col-menu-wrap" data-col-menu>
                  <button
                    type="button"
                    className="workspace-col-more"
                    aria-label={`Opções da coluna ${meta.label}`}
                    aria-expanded={isMenuOpen}
                    onClick={() => setOpenMenuKey(isMenuOpen ? null : colKey)}
                  >
                    <MoreHorizontal size={17} aria-hidden="true" />
                  </button>

                  {isMenuOpen && (
                    <div className="workspace-col-dropdown" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...columns];
                          [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                          onChangeColumns(next);
                          setOpenMenuKey(null);
                        }}
                      >
                        <ArrowLeft size={14} /> Mover para esquerda
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={idx === columns.length - 1}
                        onClick={() => {
                          const next = [...columns];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          onChangeColumns(next);
                          setOpenMenuKey(null);
                        }}
                      >
                        <ArrowRight size={14} /> Mover para direita
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCustomizingKey(isCustomizing ? null : colKey);
                          setOpenMenuKey(null);
                        }}
                      >
                        <SlidersHorizontal size={14} /> Personalizar conteúdo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        onClick={() => {
                          onChangeColumns(columns.filter((k) => k !== colKey));
                          setOpenMenuKey(null);
                        }}
                      >
                        <Trash2 size={14} /> Remover coluna
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {isCustomizing && (
                <div className="workspace-col-customize" data-no-drag>
                  <div className="card-heading" style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: 12 }}>Personalizar {meta.label}</strong>
                    <button type="button" className="dialog-close" onClick={() => setCustomizingKey(null)} aria-label="Fechar">
                      <X size={14} />
                    </button>
                  </div>
                  {(colKey === "overview" || colKey === "patrimony" || colKey === "health") && (
                    <label className="kc-check" style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={cfg.showCharts !== false} onChange={() => toggleColumnSetting(colKey, "showCharts")} />
                      <span className="kc-check-box" aria-hidden="true" />
                      <span>Exibir gráficos nesta coluna</span>
                    </label>
                  )}
                  {colKey === "budgets" && (
                    <label className="kc-check" style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={Boolean(cfg.compact)} onChange={() => toggleColumnSetting(colKey, "compact")} />
                      <span className="kc-check-box" aria-hidden="true" />
                      <span>Modo compacto nos limites</span>
                    </label>
                  )}
                </div>
              )}

              <div className="workspace-col-body">
                {renderColumnContent(colKey)}
              </div>
            </section>
          );
        })}

        <button
          type="button"
          className="workspace-add-rail"
          onClick={() => onToggleAddPopover(!addPopoverOpen)}
          aria-label="Adicionar ou gerenciar colunas do workspace"
        >
          <span className="workspace-add-rail-btn"><Plus size={20} /></span>
          <span>Adicionar coluna</span>
          <small>{columns.length}/6 ativas</small>
        </button>
      </div>

      {addPopoverOpen && (
        <div
          className="action-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onToggleAddPopover(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="addColTitle">
            <div className="dialog-head">
              <div>
                <h2 id="addColTitle">Personalizar workspace</h2>
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  Escolha quais áreas financeiras aparecem como colunas no desktop.
                </p>
              </div>
              <button type="button" className="dialog-close" onClick={() => onToggleAddPopover(false)} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="workspace-picker-list">
              {Object.values(WORKSPACE_COLUMN_META).map((item) => {
                const Icon = COLUMN_ICONS[item.key] || LayoutGrid;
                const isActive = columns.includes(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`workspace-picker-item${isActive ? " active" : ""}`}
                    onClick={() => {
                      if (isActive) {
                        onChangeColumns(columns.filter((k) => k !== item.key));
                      } else {
                        onChangeColumns([...columns, item.key], item.key);
                      }
                    }}
                  >
                    <span className="workspace-col-icon"><Icon size={17} aria-hidden="true" /></span>
                    <div className="workspace-picker-meta">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </div>
                    <span className={`status ${isActive ? "done" : "pending"}`}>
                      {isActive ? "Ativa" : "Adicionar"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="pill pill-secondary"
                onClick={() => {
                  onChangeColumns([...DEFAULT_DESKTOP_COLUMNS]);
                  onToggleAddPopover(false);
                }}
              >
                <RotateCcw size={14} aria-hidden="true" /> Restaurar padrão
              </button>
              <button type="button" className="pill pill-primary" onClick={() => onToggleAddPopover(false)}>
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
