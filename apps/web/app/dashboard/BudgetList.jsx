"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal, AlertTriangle } from "lucide-react";
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
  onEditBudget
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
        const isOver = hasLimit && item.overLimitCents > 0;
        const isWarn = hasLimit && !isOver && item.utilizationPct >= 80;
        const pct = hasLimit ? Math.min(100, Math.max(0, item.utilizationPct)) : 0;
        const isOpen = expanded === item.categoryId;

        return (
          <article className={"budget-card" + (isOver ? " over" : "")} key={item.categoryId}>
            <div className="budget-row-top">
              <button
                type="button"
                className="budget-expand"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : item.categoryId)}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <strong>{item.categoryName}</strong>
                {isOver && <span className="status late">Ultrapassado</span>}
              </button>
              <div className="budget-right">
                {hasLimit ? (
                  <span className={"budget-remaining" + (isOver ? " red" : "")}>
                    Restante do limite: <strong>{money(item.remainingCents)}</strong>
                  </span>
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
                  className={"budget-fill" + (isOver ? " over" : isWarn ? " warn" : "")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            <div className="budget-meta">
              <span>Consumido: {money(item.usedCents)}</span>
              {hasLimit && <span>Limite: {money(item.limitCents)}</span>}
            </div>

            {isOpen && (
              <div className="budget-drilldown">
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
                  <p className="hint">Nenhum gasto registrado nesta categoria no mês.</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
