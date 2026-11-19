"use client";
import { useMemo, useState } from "react";
import { CalendarCheck2, Compass, Layers, ShoppingBag, Trash2 } from "lucide-react";
import { brDay, money } from "../../lib/finance";
import { maskToDecimal, centsToMask } from "../../lib/money-input";
import { simulateGoalPurchase } from "../../lib/goal-planner";

function fmtMonth(ym) {
  if (!ym) return "Ainda não fecha";
  return new Date(ym + "-15T12:00:00Z").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDate(d) {
  if (!d) return "—";
  const parts = String(d).slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "—";
}

function toCents(mask) {
  const num = Number(maskToDecimal(mask || "0"));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

const HUMAN_PROPOSALS = {
  preserve_cash: (p) => ({
    title: "Segure esse dinheiro para as próximas contas",
    copy: "O saldo que você tem hoje na conta precisa ficar livre para pagar os boletos e despesas dos próximos dias, sem depender do que ainda vai receber.",
  }),
  cover_overdue: (p) => ({
    title: "Coloque as contas atrasadas em dia primeiro",
    copy: `Você tem contas pendentes ou sem cobertura nos próximos dias. Use até ${money(p.recommendedCents)} para regularizar antes de guardar.`,
  }),
  compare_debt_vs_cushion: (p) => ({
    title: "Escolha: abater dívida cara ou montar reserva",
    copy: `Você tem ${money(p.recommendedCents)} livres hoje. Pode usar para diminuir sua dívida com juros altos ou começar sua reserva de emergência.`,
  }),
  amortize_debt: (p) => ({
    title: "Abater dívida com juros altos",
    copy: `Sua reserva inicial já está garantida. Use ${money(p.recommendedCents)} para reduzir a dívida mais cara e pagar menos juros.`,
  }),
  build_reserve: (p) => ({
    title: "Guardar na sua reserva de emergência",
    copy: `Suas contas estão em dia. Direcione ${money(p.recommendedCents)} para completar seu colchão de segurança.`,
  }),
  capital_or_goals: (p) => ({
    title: "Livre para suas metas e investimentos",
    copy: `Contas em dia e reserva protegida. Você pode aplicar ${money(p.recommendedCents)} no seu capital ou nas suas metas.`,
  }),
};

export default function PlanningGoalsPanel({ rawData, healthPlan, onSaveGoal, onCancelGoal, busy, section = "all" }) {
  const today = brDay();
  const [goalForm, setGoalForm] = useState({
    title: "Notebook",
    target: "2.500,00",
    downPayment: "500,00",
    installmentCount: "10",
    desiredOn: today,
  });

  const liveSimulation = useMemo(() => {
    const targetCents = toCents(goalForm.target);
    const downPaymentCents = Math.min(targetCents, toCents(goalForm.downPayment));
    const count = Math.max(1, Math.min(120, Number(goalForm.installmentCount || 1)));
    const installmentCents = Math.ceil(Math.max(0, targetCents - downPaymentCents) / count);
    return simulateGoalPurchase(
      rawData || {},
      {
        title: goalForm.title || "Compra planejada",
        targetCents,
        downPaymentCents,
        installmentCount: count,
        installmentCents,
        desiredOn: goalForm.desiredOn || today,
      },
      { today }
    );
  }, [rawData, goalForm, today]);

  if (!healthPlan) return null;
  const { milestones, allocation, goals } = healthPlan;
  const showHealth = section === "all" || section === "health";
  const showGoals = section === "all" || section === "goals";

  return (
    <div className="planning-fh-stack">
      {/* 1. Recovery Milestones */}
      {showHealth && <section className="panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">QUANDO VOCÊ SAI DO APERTO</div>
            <h2>Etapas para ficar no azul</h2>
          </div>
          <span className="badge">Próximos 12 meses</span>
        </div>
        <div className="milestones-grid">
          <article className="milestone-box">
            <span>1. Contas em dia</span>
            <strong>{fmtMonth(milestones.firstCoveredMonth)}</strong>
            <small>Suas contas essenciais cabem no que você ganha, sem atrasar vencimentos.</small>
          </article>
          <article className="milestone-box">
            <span>2. Começar a guardar</span>
            <strong>{fmtMonth(milestones.firstSavingMonth)}</strong>
            <small>Primeiro mês em que vai sobrar dinheiro livre para você guardar.</small>
          </article>
          <article className="milestone-box">
            <span>3. Vida tranquila</span>
            <strong>{fmtMonth(milestones.firstStableMonth)}</strong>
            <small>
              {milestones.firstStableMonth
                ? "Reserva formada e dinheiro sobrando todo mês com segurança."
                : "Ainda não fecha em 12 meses. Reduza gastos variáveis ou aumente sua sobra mensal."}
            </small>
          </article>
        </div>
      </section>}

      {/* 2. Allocable Capacity & Priorities */}
      {showHealth && <section className="panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">O QUE FAZER AGORA</div>
            <h2>Quanto você pode usar e para onde vai</h2>
          </div>
          <Layers size={18} />
        </div>
        <div className="allocation-summary">
          <div>
            <span>Livre para usar hoje</span>
            <strong>
              {allocation.eligibleTodayCents === null ? "A calcular" : money(allocation.eligibleTodayCents)}
            </strong>
            <small className="hint" style={{ marginTop: 2 }}>Dinheiro já na conta que não está preso em contas próximas.</small>
          </div>
          <div>
            <span>Sobra prevista por mês</span>
            <strong>
              {allocation.projectedMonthlyCents === null ? "A calcular" : money(allocation.projectedMonthlyCents)}
            </strong>
            <small className="hint" style={{ marginTop: 2 }}>Quanto deve sobrar todo mês depois de pagar suas contas.</small>
          </div>
        </div>
        <div className="priority-list">
          {(allocation.proposals || []).map((p, idx) => {
            const human = HUMAN_PROPOSALS[p.kind]?.(p);
            return (
              <article className="priority-item" key={`${p.kind}-${idx}`}>
                <div className="priority-item-head">
                  <strong>{human?.title || p.title}</strong>
                  <span>{money(p.recommendedCents)}</span>
                </div>
                <p>{human?.copy || p.rationale}</p>
                {p.options && (
                  <div className="priority-options">
                    {p.options.map((opt) => (
                      <div className="priority-option" key={opt.id}>
                        <strong>{opt.label} ({money(opt.amountCents)})</strong>
                        <small>{opt.rationale}</small>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>}

      {/* 3. Smart Purchase / Goal Planner (PCP/MRP) */}
      {showGoals && <section className="panel" id="goal-planner-section">
        <div className="section-header">
          <div>
            <div className="eyebrow">PLANEJADOR INTELIGENTE (SIMULAÇÃO)</div>
            <h2>Simular compra ou objetivo</h2>
          </div>
          <ShoppingBag size={18} />
        </div>
        <div className="goal-planner-grid">
          <form
            className="goal-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!onSaveGoal || busy) return;
              onSaveGoal({
                title: goalForm.title,
                target: maskToDecimal(goalForm.target),
                downPayment: maskToDecimal(goalForm.downPayment),
                installmentCount: Number(goalForm.installmentCount || 1),
                desiredOn: goalForm.desiredOn,
              });
            }}
          >
            <label>
              Produto ou objetivo
              <input
                value={goalForm.title}
                onChange={(e) => setGoalForm((o) => ({ ...o, title: e.target.value }))}
                maxLength={120}
                required
              />
            </label>
            <div className="goal-form-row">
              <label>
                Valor total (R$)
                <input
                  value={goalForm.target}
                  onChange={(e) => setGoalForm((o) => ({ ...o, target: centsToMask(toCents(e.target.value)) }))}
                  required
                />
              </label>
              <label>
                Entrada (R$)
                <input
                  value={goalForm.downPayment}
                  onChange={(e) => setGoalForm((o) => ({ ...o, downPayment: centsToMask(toCents(e.target.value)) }))}
                />
              </label>
            </div>
            <div className="goal-form-row">
              <label>
                Parcelas
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={goalForm.installmentCount}
                  onChange={(e) => setGoalForm((o) => ({ ...o, installmentCount: e.target.value }))}
                />
              </label>
              <label>
                Data desejada
                <input
                  type="date"
                  min={today}
                  value={goalForm.desiredOn}
                  onChange={(e) => setGoalForm((o) => ({ ...o, desiredOn: e.target.value }))}
                />
              </label>
            </div>
            <button type="submit" className="dark-button" disabled={busy}>
              <CalendarCheck2 size={16} /> Salvar simulação (sem gerar cobrança)
            </button>
          </form>

          <div className="goal-result">
            <div className={`goal-verdict ${liveSimulation.isFeasible ? "ok" : "warn"}`}>
              <Compass size={18} />
              <div>
                <strong>
                  {liveSimulation.isFeasible
                    ? `Cabe no plano na data desejada (${fmtDate(goalForm.desiredOn)})`
                    : liveSimulation.firstFeasibleDate
                      ? `Cabe no plano a partir de ${fmtDate(liveSimulation.firstFeasibleDate)}`
                      : "Ainda não cabe no plano"}
                </strong>
                <small>
                  {liveSimulation.bottleneckDate
                    ? `Gargalo em ${fmtDate(liveSimulation.bottleneckDate)} (falta de ${money(liveSimulation.bottleneckShortfallCents)} considerando todas as parcelas).`
                    : `Todas as ${liveSimulation.installmentCountVerified || 1} parcela(s) foram verificadas sem comprometer o piso protegido.`}
                </small>
              </div>
            </div>

            {liveSimulation.scenarios?.length > 0 && (
              <div className="goal-scenarios">
                <strong>Comparação de cenários</strong>
                <ul>
                  {liveSimulation.scenarios.map((s) => (
                    <li key={s.id}>
                      <span>{s.label}</span>
                      <strong className={s.feasible ? "green" : "red"}>
                        {s.feasible ? `Viável (${fmtDate(s.startDate)})` : "Inviável"}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {goals?.items?.length > 0 && (
          <div className="saved-goals">
            <strong>Simulações salvas</strong>
            <ul>
              {goals.items.map((g, i) => {
                const rawGoal = (rawData?.goals || [])[i];
                return (
                  <li key={rawGoal?.id || `${g.title}-${i}`}>
                    <div>
                      <strong>{g.title}</strong>
                      <small>
                        {g.firstFeasibleDate
                          ? `Primeira data viável: ${fmtDate(g.firstFeasibleDate)}`
                          : "Ainda não cabe no plano"}
                      </small>
                    </div>
                    {rawGoal?.id && onCancelGoal && (
                      <button
                        type="button"
                        className="tiny-btn"
                        onClick={() => onCancelGoal(rawGoal.id)}
                        disabled={busy}
                        aria-label={`Remover simulação ${g.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>}
    </div>
  );
}
