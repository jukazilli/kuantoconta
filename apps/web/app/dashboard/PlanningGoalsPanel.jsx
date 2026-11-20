"use client";
import { Layers } from "lucide-react";
import { money } from "../../lib/finance";

function fmtMonth(ym) {
  if (!ym) return "Ainda não fecha";
  return new Date(ym + "-15T12:00:00Z").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const HUMAN_PROPOSALS = {
  preserve_cash: () => ({
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
    title: "Livre para suas caixinhas e investimentos",
    copy: `Contas em dia e reserva protegida. Você pode transferir ${money(p.recommendedCents)} para suas caixinhas ou patrimônio.`,
  }),
};

export default function PlanningGoalsPanel({ healthPlan }) {
  if (!healthPlan) return null;
  const { milestones, allocation } = healthPlan;

  return (
    <div className="planning-fh-stack">
      {/* 1. Recovery Milestones */}
      <section className="panel">
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
      </section>

      {/* 2. Allocable Capacity & Priorities */}
      <section className="panel">
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
      </section>
    </div>
  );
}
