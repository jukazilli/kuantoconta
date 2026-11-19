"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal, AlertTriangle, ShoppingCart, CalendarClock, X } from "lucide-react";
import { money, isoDate } from "../../lib/finance";

const fmtDate = d => {
  const s = isoDate(d).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : "—";
};

export default function BudgetList({
  items = [],
  monthLabel = "",
  insufficientCash = false,
  compact = false,
  onEditBudget,
  onFulfillPlan,
  onEditPlan,
  onCancelPlan
}) {
  const [detailItem, setDetailItem] = useState(null);

  const visible = compact ? items.slice(0, 5) : items;
  const activeDetail = detailItem ? items.find((i) => i.categoryId === detailItem.categoryId) || detailItem : null;

  if (!visible.length) {
    return (
      <div className="empty-movements">
        Nenhum limite configurado para {monthLabel || "este mês"}. Defina um teto mensal ao criar ou editar uma categoria de despesa.
      </div>
    );
  }

  return (
    <div className={"budget-list" + (compact ? " compact" : "")}>
      {insufficientCash && (
        <div className="alert budget-cash-alert" role="status">
          <AlertTriangle size={15} />
          <span>Caixa projetado negativo no período; restante do limite não garante margem livre.</span>
        </div>
      )}
      {visible.map(item => {
        const hasLimit = item.limitCents !== null;
        const realized = item.realizedCents ?? item.usedCents ?? 0;
        const committed = item.committedUnrealizedCents ?? 0;
        const planned = item.plannedRemainingCents ?? 0;
        const remainingLimit = item.remainingLimitCents ?? item.remainingCents;
        const unallocated = item.unallocatedCents ?? remainingLimit;
        const hasForwardItems = planned > 0 || committed > 0;

        const isOverReal = hasLimit && realized > item.limitCents;
        const isOverPlan = hasLimit && !isOverReal && unallocated !== null && unallocated < 0;
        const isWarn = hasLimit && !isOverReal && !isOverPlan && item.utilizationPct >= 80;
        const pct = hasLimit && item.limitCents > 0 ? Math.min(100, Math.max(0, Math.round((realized / item.limitCents) * 100))) : 0;

        return (
          <article className={"budget-card" + (isOverReal ? " over" : "")} key={item.categoryId}>
            <div className="budget-row-top">
              <button
                type="button"
                className="budget-expand"
                onClick={() => setDetailItem(item)}
              >
                <strong>{item.categoryName}</strong>
                {isOverReal && <span className="status late">Excedido</span>}
                {isOverPlan && <span className="status review">Acima do previsto</span>}
              </button>
              <div className="budget-right">
                {hasLimit ? (
                  <span className={"budget-remaining" + ((hasForwardItems ? unallocated : remainingLimit) < 0 ? " red" : "")}>
                    {hasForwardItems ? "Livre: " : "Restam "}
                    <strong>{money(hasForwardItems ? unallocated : remainingLimit)}</strong>
                  </span>
                ) : (
                  <span className="budget-remaining">Sem teto</span>
                )}
                {onEditBudget && (
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    aria-label={"Configurar limite de " + item.categoryName}
                    title={"Configurar limite de " + item.categoryName}
                    onClick={() => onEditBudget(item)}
                  >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {hasLimit && (
              <div className="budget-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={"budget-fill" + (isOverReal ? " over" : (isOverPlan || isWarn) ? " warn" : "")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            <button type="button" className="budget-meta budget-meta-btn" onClick={() => setDetailItem(item)}>
              <span>Gasto: <strong>{money(realized)}</strong></span>
              <span>{hasLimit ? `Limite: ${money(item.limitCents)}` : "Toque para ver detalhes"}</span>
            </button>
          </article>
        );
      })}

      {activeDetail && (() => {
        const hasLimit = activeDetail.limitCents !== null;
        const realized = activeDetail.realizedCents ?? activeDetail.usedCents ?? 0;
        const committed = activeDetail.committedUnrealizedCents ?? 0;
        const planned = activeDetail.plannedRemainingCents ?? 0;
        const remainingLimit = activeDetail.remainingLimitCents ?? activeDetail.remainingCents;
        const unallocated = activeDetail.unallocatedCents ?? remainingLimit;
        const hasForwardItems = planned > 0 || committed > 0;
        return (
          <div
            className="action-overlay open"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDetailItem(null);
            }}
          >
            <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="budgetDetailTitle">
              <div className="dialog-head">
                <div>
                  <div className="eyebrow">DETALHE DO LIMITE · {monthLabel || "MÊS"}</div>
                  <h2 id="budgetDetailTitle">{activeDetail.categoryName}</h2>
                </div>
                <button type="button" className="dialog-close" onClick={() => setDetailItem(null)} aria-label="Fechar">
                  <X size={17} />
                </button>
              </div>
              <div className="budget-drilldown" style={{ borderTop: 0, paddingTop: 0 }}>
                <div className="budget-breakdown">
                  <div><span>Gasto até agora</span><strong>{money(realized)}</strong></div>
                  {committed > 0 && <div><span>Contas comprometidas</span><strong>{money(committed)}</strong></div>}
                  {planned > 0 && <div><span>Já planejado</span><strong>{money(planned)}</strong></div>}
                  {hasLimit && <div><span>Restante do limite</span><strong className={remainingLimit < 0 ? "red" : ""}>{money(remainingLimit)}</strong></div>}
                  {hasLimit && hasForwardItems && <div><span>Ainda sem destino</span><strong className={unallocated < 0 ? "red" : ""}>{money(unallocated)}</strong></div>}
                </div>

                {activeDetail.plans?.length > 0 && (
                  <div className="budget-plans-block">
                    <small className="eyebrow">INTENÇÕES PLANEJADAS</small>
                    <ul className="budget-events">
                      {activeDetail.plans.map(plan => (
                        <li className="budget-plan-row" key={plan.id}>
                          <div>
                            <strong>{plan.description}</strong>
                            <span>
                              {plan.planned_for
                                ? `Previsto para ${fmtDate(plan.planned_for)}`
                                : `Previsto em ${plan.planned_month}`}
                              {" · "}
                              {money(plan.remainingCents)}
                            </span>
                            {plan.needsReview && <span className="status review">Precisa revisar</span>}
                          </div>
                          <div className="plan-actions">
                            {onFulfillPlan && (
                              <button type="button" className="tiny-btn" onClick={() => { setDetailItem(null); onFulfillPlan(plan, activeDetail.categoryName); }}>
                                <ShoppingCart size={12} /> Registrar
                              </button>
                            )}
                            {onEditPlan && (
                              <button type="button" className="tiny-btn" onClick={() => { setDetailItem(null); onEditPlan(plan); }}>
                                <CalendarClock size={12} /> Adiar
                              </button>
                            )}
                            {onCancelPlan && (
                              <button type="button" className="icon-ghost-btn" aria-label={`Cancelar previsão ${plan.description}`} onClick={() => onCancelPlan(plan.id)}>
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeDetail.events?.length > 0 ? (
                  <ul className="budget-events">
                    {activeDetail.events.map(ev => (
                      <li key={ev.id}>
                        <span>{fmtDate(ev.occurredOn)} · {ev.description}</span>
                        <strong>{money(ev.amountCents)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !activeDetail.plans?.length && <p className="hint">Nenhum gasto registrado nesta categoria no mês.</p>
                )}

                {onEditBudget && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      type="button"
                      className="pill pill-outline-orange pill-compact"
                      onClick={() => {
                        const target = activeDetail;
                        setDetailItem(null);
                        onEditBudget(target);
                      }}
                    >
                      <SlidersHorizontal size={15} /> Configurar limite
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
