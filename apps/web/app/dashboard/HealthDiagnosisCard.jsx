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
  const { diagnosis, milestones, dataQuality } = healthPlan;
  const meta = STATE_META[diagnosis.state] || STATE_META.unknown;
  const { Icon } = meta;
  const ind = diagnosis.indicators;

  const mainReasons = (diagnosis.reasonCodes || [])
    .slice(0, 2)
    .map((code) => REASON_LABELS[code] || code);

  const fmtShort = (ym) =>
    ym
      ? new Date(ym + "-15T12:00:00Z")
          .toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" })
          .replace(".", "")
      : null;

  const nextMilestoneText = milestones.firstSavingMonth
    ? `Guardar em ${fmtShort(milestones.firstSavingMonth)}`
    : milestones.firstCoveredMonth
      ? `Contas em dia em ${fmtShort(milestones.firstCoveredMonth)}`
      : "Ainda não fecha no ano";

  return (
    <section className="panel health-card" aria-label="Diagnóstico de saúde financeira">
      <div className="health-card-head">
        <div className={`health-badge health-badge--${meta.tone}`}>
          <Icon size={17} aria-hidden="true" />
          <strong>{meta.label}</strong>
        </div>
      </div>

      {mainReasons.length > 0 && (
        <ul className="health-reasons">
          {mainReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="health-metrics-row">
        <div className="health-mini-stat">
          <span>Dívida restante</span>
          <strong>{money(ind.outstandingDebtCents)}</strong>
        </div>
        <div className="health-mini-stat">
          <span>Comprometimento</span>
          <strong>
            {ind.incomeCommitmentRatio === null
              ? "Indisponível"
              : `${Math.round(ind.incomeCommitmentRatio * 100)}%`}
          </strong>
        </div>
        <div className="health-mini-stat">
          <span>Reserva líquida</span>
          <strong>
            {ind.emergencyCoverageMonths === null
              ? "A calcular"
              : `${ind.emergencyCoverageMonths.toFixed(1)} mês(es)`}
          </strong>
        </div>
        <div className="health-mini-stat">
          <span>Próxima mudança</span>
          <strong>{nextMilestoneText}</strong>
        </div>
      </div>

      {dataQuality.status !== "complete" && (
        <div className="health-footnote">
          <span>Faltam dados para diagnóstico completo: {dataQuality.missingFields.join(", ")}.</span>
        </div>
      )}
    </section>
  );
}
