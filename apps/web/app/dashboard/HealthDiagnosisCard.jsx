"use client";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, TrendingUp, ArrowRight } from "lucide-react";
import { money } from "../../lib/finance";

const STATE_META = {
  red: { label: "Contas em risco", Icon: ShieldAlert, tone: "red" },
  orange: { label: "Reorganizando", Icon: AlertTriangle, tone: "orange" },
  blue: { label: "Em equilíbrio", Icon: TrendingUp, tone: "blue" },
  green: { label: "Protegido e acumulando", Icon: CheckCircle2, tone: "green" },
  unknown: { label: "Dados para completar", Icon: HelpCircle, tone: "unknown" },
};

const REASON_LABELS = {
  ESSENTIAL_OVERDUE: "Há obrigação essencial vencida em aberto.",
  DUE_DATE_GAP: "Falta cobertura de caixa em vencimentos futuros.",
  NEGATIVE_LIVE_CASH: "Saldo consolidado abaixo do piso de proteção.",
  EXPENSIVE_DEBT: "Existe dívida ativa com taxa mensal elevada.",
  HIGH_DEBT_COMMITMENT: "Comprometimento da renda recorrente acima do limite da política.",
  MARGIN_UNSTABLE: "Margem mensal atual insuficiente ou negativa.",
  LOW_INITIAL_RESERVE: "Sua reserva de emergência ainda está abaixo do mínimo recomendado.",
  RESERVE_BUILDING: "Reserva em construção rumo à meta completa.",
  BALANCED_BUILDING: "Compromissos cobertos e capacidade de avanço gradual.",
  SUSTAINED_PROTECTION: "Cobertura, margem e reserva sustentadas no horizonte.",
  INCOMPLETE_DATA: "Complete saldo inicial e renda recorrente para diagnóstico integral.",
  HYSTERESIS_HOLD_FOR_K_MONTHS: "Promoção aguardando meses consecutivos de estabilidade.",
};

function fmtMonth(ym) {
  if (!ym) return null;
  return new Date(ym + "-15T12:00:00Z").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function HealthDiagnosisCard({ healthPlan }) {
  if (!healthPlan) return null;
  const { diagnosis, allocation, dataQuality } = healthPlan;
  const meta = STATE_META[diagnosis.state] || STATE_META.unknown;
  const { Icon } = meta;

  const allReasons = (diagnosis.reasonCodes || []).map((code) => REASON_LABELS[code] || code);
  const topProposal = allocation?.proposals?.[0] || null;

  return (
    <section className="panel health-card" aria-label="Diagnóstico de saúde financeira">
      <div className="health-card-head">
        <div className={`health-badge health-badge--${meta.tone}`}>
          <Icon size={17} aria-hidden="true" />
          <strong>{meta.label}</strong>
        </div>
      </div>

      {allReasons.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">POR QUE VOCÊ ESTÁ NESTE ESTADO</span>
          <ul className="health-reasons">
            {allReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Nenhum fator crítico identificado no momento. Continue acompanhando seus vencimentos e sua reserva.
        </p>
      )}

      {topProposal && (
        <div className="repeat-config" style={{ marginTop: 8 }}>
          <span className="eyebrow">PRÓXIMA AÇÃO RECOMENDADA</span>
          <strong style={{ display: "block", marginTop: 4 }}>{topProposal.title}</strong>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {topProposal.rationale}
            {topProposal.recommendedCents > 0 ? ` (Valor sugerido: ${money(topProposal.recommendedCents)})` : ""}
          </p>
        </div>
      )}

      {dataQuality.status !== "complete" && (
        <div className="health-footnote">
          <span>Faltam dados para diagnóstico completo: {dataQuality.missingFields.join(", ")}.</span>
        </div>
      )}
    </section>
  );
}
