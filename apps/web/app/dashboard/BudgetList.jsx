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
  const [expanded, setExpanded] = useState(null);

  const visible = compact ? items.slice(0, 5) : items;

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
        const isOpen = expanded === item.categoryId;

        return (
          <article className={"budget-card" + (isOverReal ? " over" : "")} key={item.categoryId}>
            <div className="budget-row-top">
              <button
                type="button"
                className="budget-expand"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : item.categoryId)}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <strong>{item.categoryName}</strong>
                {isOverReal && <span className="status late">Limite excedido</span>}
                {isOverPlan && <span className="status review">Acima do limite previsto</span>}
              </button>
              <div className="budget-right">
                {hasLimit ? (
                  hasForwardItems ? (
                    <span className={"budget-remaining" + (unallocated < 0 ? " red" : "")}>
                      Ainda sem destino: <strong>{money(unallocated)}</strong>
                    </span>
                  ) : (
                    <span className={"budget-remaining" + (remainingLimit < 0 ? " red" : "")}>
                      Restante do limite: <strong>{money(remainingLimit)}</strong>
                    </span>
                  )
                ) : (
                  <span className="budget-remaining">Sem limite definido</span>
                )}
                {onEditBudget && (
                  <button
                    type="button"
                    className="tiny-btn"
                    aria-label={"Configurar limite de " + item.categoryName}
                    onClick={() => onEditBudget(item)}
                  >
                    <SlidersHorizontal size={13} />
                    {hasLimit ? "Limite" : "Definir"}
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

            <div className="budget-meta">
              <span>
                Gasto até agora: <strong>{money(realized)}</strong>
                {planned > 0 && <> · <em>{money(planned)} já planejado</em></>}
                {committed > 0 && <> · <em>{money(committed)} comprometido</em></>}
              </span>
              {hasLimit && <span>Limite: {money(item.limitCents)}</span>}
            </div>

            {isOpen && (
              <div className="budget-drilldown">
                <div className="budget-breakdown">
                  <div><span>Gasto até agora</span><strong>{money(realized)}</strong></div>
                  {committed > 0 && <div><span>Contas comprometidas</span><strong>{money(committed)}</strong></div>}
                  {planned > 0 && <div><span>Já planejado</span><strong>{money(planned)}</strong></div>}
                  {hasLimit && <div><span>Restante do limite</span><strong className={remainingLimit < 0 ? "red" : ""}>{money(remainingLimit)}</strong></div>}
                  {hasLimit && hasForwardItems && <div><span>Ainda sem destino</span><strong className={unallocated < 0 ? "red" : ""}>{money(unallocated)}</strong></div>}
                </div>

                {item.plans?.length > 0 && (
                  <div className="budget-plans-block">
                    <small className="eyebrow">INTENÇÕES PLANEJADAS</small>
                    <ul className="budget-events">
                      {item.plans.map(plan => (
                        <li className="budget-plan-row" key={plan.id}>
                          <div>
                            <strong>{plan.description}</strong>
                            <span>
                              {plan.planned_for
                                ? `Previsto para ${fmtDate(plan.planned_for)}`
                                : `Previsto em ${plan.planned_month} (sem dia exato · protegido no início do mês)`}
                              {" · "}
                              {money(plan.remainingCents)}
                            </span>
                            {plan.needsReview && <span className="status review">Previsto · precisa revisar</span>}
                          </div>
                          <div className="plan-actions">
                            {onFulfillPlan && (
                              <button type="button" className="tiny-btn" onClick={() => onFulfillPlan(plan, item.categoryName)}>
                                <ShoppingCart size={12} /> Registrar compra
                              </button>
                            )}
                            {onEditPlan && (
                              <button type="button" className="tiny-btn" onClick={() => onEditPlan(plan)}>
                                <CalendarClock size={12} /> Adiar
                              </button>
                            )}
                            {onCancelPlan && (
                              <button type="button" className="tiny-btn" aria-label={`Cancelar previsão ${plan.description}`} onClick={() => onCancelPlan(plan.id)}>
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.subcategories?.length > 0 && (
                  <div className="budget-subs">
                    {item.subcategories.map(sub => (
                      <span className="movement-tag secondary" key={sub.name}>
                        {sub.name}: {money(sub.usedCents)}
                      </span>
                    ))}
                  </div>
                )}

                {item.events?.length > 0 ? (
                  <ul className="budget-events">
                    {item.events.map(ev => (
                      <li key={ev.id}>
                        <span>{fmtDate(ev.occurredOn)} · {ev.description}</span>
                        <strong>{money(ev.amountCents)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !item.plans?.length && <p className="hint">Nenhum gasto registrado nesta categoria no mês.</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
