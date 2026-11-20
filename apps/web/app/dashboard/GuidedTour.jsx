"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";

const TOUR_STEPS = [
  {
    id: "actions",
    tab: "overview",
    target: '[data-tour="actions"]',
    eyebrow: "PASSO 1 DE 5 · ~15 SEG",
    title: "Registre lançamentos e crie estruturas em segundos",
    body: "Toque em + Lançamento para anotar contas, receitas ou transferências. Em Novo, você cadastra cartões, contas, orçamentos, caixinhas e planejamentos de compra.",
  },
  {
    id: "filters",
    tab: "overview",
    target: '[data-tour="filters"]',
    eyebrow: "PASSO 2 DE 5 · ~15 SEG",
    title: "Navegue pelos meses na barra única",
    body: "Use as setas no topo para alternar o mês ou toque no botão de filtro ao lado para escolher períodos específicos em cada tela.",
  },
  {
    id: "budgets",
    tab: "budgets",
    target: '[data-tour="dock"]',
    eyebrow: "PASSO 3 DE 5 · ~15 SEG",
    title: "Orçamentos separados de Planejamento",
    body: "Na aba Orçamentos você define seus limites mensais por categoria e acompanha quanto ainda pode gastar no mês.",
  },
  {
    id: "planning",
    tab: "planning",
    target: '[data-tour="workspace"]',
    eyebrow: "PASSO 4 DE 5 · ~20 SEG",
    title: "Caixinhas para guardar e compras planejadas",
    body: "Em Planejamento você cria Caixinhas para juntar dinheiro com meta e prazo, e simula compras parceladas para descobrir a melhor data sem apertar o caixa.",
  },
  {
    id: "health",
    tab: "health",
    target: '[data-tour="workspace"]',
    eyebrow: "PASSO 5 DE 5 · ~20 SEG",
    title: "Saúde financeira: onde cortar e quando fica no azul",
    body: "Veja onde o dinheiro escoa (Dedo Duro), quanto pode economizar (Tesouraço) e a Linha do Tempo com a data prevista para sua estabilidade.",
  },
];

export default function GuidedTour({ open, onSelectTab, onClose }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);

  const step = TOUR_STEPS[idx] || TOUR_STEPS[0];

  useEffect(() => {
    if (!open) return;
    setIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (step.tab && onSelectTab) onSelectTab(step.tab);
    const timer = setTimeout(() => {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({
            top: Math.max(4, r.top - 6),
            left: Math.max(4, r.left - 6),
            width: Math.min(window.innerWidth - 8, r.width + 12),
            height: r.height + 12,
          });
          return;
        }
      }
      setRect(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [open, idx, step.tab, step.target]);

  if (!open) return null;

  const isLast = idx === TOUR_STEPS.length - 1;

  function finish() {
    onSelectTab?.("overview");
    onClose?.();
  }

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
      <div className="tour-card">
        <div className="tour-card-head">
          <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Compass size={13} aria-hidden="true" /> {step.eyebrow}
          </span>
          <button type="button" className="dialog-close" onClick={finish} aria-label="Fechar tutorial">
            <X size={16} />
          </button>
        </div>

        <h3 id="tourTitle">{step.title}</h3>
        <p>{step.body}</p>

        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} className={i === idx ? "active" : i < idx ? "done" : ""} />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="tiny-btn" onClick={finish}>
            Pular
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {idx > 0 && (
              <button type="button" className="tiny-btn" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
                <ArrowLeft size={14} /> Anterior
              </button>
            )}
            {!isLast ? (
              <button type="button" className="pill pill-primary pill-compact" onClick={() => setIdx((i) => i + 1)}>
                Próximo <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="pill pill-primary pill-compact" onClick={finish}>
                <Check size={14} /> Começar a usar!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
