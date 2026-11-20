"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Plus, Search, X, CheckCircle2 } from "lucide-react";
import BankIcon from "./BankIcon";
import MoneyInput from "./MoneyInput";
import { brDay, cents, isoDate, money } from "../../lib/finance";
import { centsToMask, maskToDecimal } from "../../lib/money-input";
import { addMonthsYm, buildCardInvoices, computeCardUsage, getInvoiceCycleDates, computeInvoiceStatus } from "../../lib/credit-cards";

const STATUS_META = {
  open: ["Aberta", "pending"],
  closed: ["Fechada", "review"],
  paid: ["Paga", "done"],
  overdue: ["Atrasada", "late"],
};

function fmtDate(d) {
  const s = isoDate(d).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : "—";
}

function fmtYm(ym) {
  if (!ym) return "";
  return new Date(`${ym}-15T12:00:00Z`)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function CreditCardInvoiceModal({
  open,
  card,
  initialMonth,
  titles = [],
  wallets = [],
  today,
  busy,
  onClose,
  onPayInvoice,
  onNewPurchase,
  onSelectTitle,
}) {
  const [month, setMonth] = useState(initialMonth || today.slice(0, 7));
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState(false);
  const [payWalletId, setPayWalletId] = useState(card?.default_wallet_id || wallets[0]?.id || "");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [err, setErr] = useState("");

  const activeMonth = month || initialMonth || today.slice(0, 7);

  const usage = useMemo(() => (card ? computeCardUsage(card, titles) : null), [card, titles]);
  const invoices = useMemo(() => (card ? buildCardInvoices(card, titles, today) : []), [card, titles, today]);

  const currentInvoice = useMemo(() => {
    if (!card) return null;
    const found = invoices.find((i) => i.month === activeMonth);
    if (found) return found;
    const { closingDate, dueDate } = getInvoiceCycleDates(card, activeMonth);
    return {
      cardId: card.id,
      cardName: card.name,
      month: activeMonth,
      closingDate,
      dueDate,
      totalCents: 0,
      paidCents: 0,
      remainingCents: 0,
      status: computeInvoiceStatus({ totalCents: 0, remainingCents: 0, closingDate, dueDate, today }),
      items: [],
    };
  }, [card, invoices, activeMonth, today]);

  const filteredItems = useMemo(() => {
    if (!currentInvoice) return [];
    const q = query.trim().toLowerCase();
    if (!q) return currentInvoice.items;
    return currentInvoice.items.filter((t) =>
      `${t.description} ${t.category || ""} ${t.subcategory || ""}`.toLowerCase().includes(q)
    );
  }, [currentInvoice, query]);

  if (!open || !card || !currentInvoice || !usage) return null;

  const [statusLabel, statusCls] = STATUS_META[currentInvoice.status] || STATUS_META.open;

  function openPayForm() {
    setErr("");
    setPayWalletId(card.default_wallet_id || wallets[0]?.id || "");
    setPayAmount(centsToMask(currentInvoice.remainingCents));
    setPayDate(today);
    setPaying(true);
  }

  async function submitPay(e) {
    e.preventDefault();
    setErr("");
    try {
      await onPayInvoice({
        creditCardId: card.id,
        invoiceMonth: activeMonth,
        walletId: payWalletId,
        amount: maskToDecimal(payAmount),
        paidOn: payDate,
      });
      setPaying(false);
    } catch (ex) {
      setErr(ex?.message || "Não foi possível registrar o pagamento da fatura.");
    }
  }

  return (
    <div
      className="action-overlay open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog dialog-wide invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="invoiceModalTitle">
        <div className="dialog-head" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BankIcon name={card.name} size={42} />
            <div>
              <div className="eyebrow">FATURA DO CARTÃO · FECHA DIA {card.closing_day} · VENCE DIA {card.due_day}</div>
              <h2 id="invoiceModalTitle" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {card.name}
                <span className={`status ${statusCls}`} style={{ fontSize: 11 }}>{statusLabel}</span>
              </h2>
            </div>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Fechar">
            <X size={17} />
          </button>
        </div>

        {/* Barra de limite do cartão */}
        <div className="invoice-limit-box">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--kc-muted-dark)" }}>
            <span>Limite usado: <strong>{money(usage.usedLimitCents)}</strong></span>
            <span>Disponível: <strong style={{ color: "#067647" }}>{money(usage.availableLimitCents)}</strong> de {money(usage.limitCents)}</span>
          </div>
          <div className="budget-bar" role="progressbar" aria-valuenow={usage.utilizationPct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`budget-fill${usage.utilizationPct >= 90 ? " over" : usage.utilizationPct >= 75 ? " warn" : ""}`} style={{ width: `${usage.utilizationPct}%` }} />
          </div>
        </div>

        {/* Navegador de meses da fatura */}
        <div className="invoice-month-bar">
          <button type="button" className="icon-ghost-btn" aria-label="Fatura anterior" onClick={() => { setPaying(false); setMonth(addMonthsYm(activeMonth, -1)); }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: "center" }}>
            <strong style={{ textTransform: "capitalize", fontSize: 15 }}>{fmtYm(activeMonth)}</strong>
            <div className="hint" style={{ margin: 0 }}>
              Fecha {fmtDate(currentInvoice.closingDate)} · Vence {fmtDate(currentInvoice.dueDate)}
            </div>
          </div>
          <button type="button" className="icon-ghost-btn" aria-label="Próxima fatura" onClick={() => { setPaying(false); setMonth(addMonthsYm(activeMonth, 1)); }}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Total + Ações */}
        <div className="invoice-summary-bar">
          <div>
            <span className="hint" style={{ display: "block" }}>Total da fatura</span>
            <strong style={{ fontSize: 22, color: "var(--kc-ink)" }}>{money(currentInvoice.totalCents)}</strong>
            {currentInvoice.paidCents > 0 && currentInvoice.remainingCents > 0 && (
              <div className="hint">Pago: {money(currentInvoice.paidCents)} · Restam: <strong>{money(currentInvoice.remainingCents)}</strong></div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="pill pill-outline-orange pill-compact"
              onClick={() => {
                onClose();
                onNewPurchase?.(card.id);
              }}
            >
              <Plus size={15} /> Nova compra
            </button>
            {currentInvoice.remainingCents > 0 && !paying && (
              <button type="button" className="pill pill-primary pill-compact" onClick={openPayForm}>
                <CheckCircle2 size={15} /> Pagar fatura
              </button>
            )}
          </div>
        </div>

        {err && <div className="onboarding-error" role="alert">{err}</div>}

        {/* Formulário inline de pagamento (total ou parcial) */}
        {paying && (
          <form onSubmit={submitPay} className="repeat-config" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Pagar fatura ({fmtYm(activeMonth)})</strong>
              <button type="button" className="icon-ghost-btn" aria-label="Cancelar pagamento" onClick={() => setPaying(false)}><X size={16} /></button>
            </div>
            <div className="form-grid">
              <label>
                Sair de qual conta?
                <select required value={payWalletId} onChange={(e) => setPayWalletId(e.target.value)}>
                  <option value="">Selecione a conta</option>
                  {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label>
                Valor a pagar (total ou parcial)
                <MoneyInput value={payAmount} onChange={setPayAmount} ariaLabel="Valor a pagar da fatura em reais" />
              </label>
            </div>
            <label>
              Data do pagamento
              <input required type="date" max={brDay()} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="pill pill-secondary pill-compact" onClick={() => setPaying(false)} disabled={busy}>Cancelar</button>
              <button type="submit" className="pill pill-primary pill-compact" disabled={busy}>
                {busy ? "Registrando..." : "Confirmar pagamento"}
              </button>
            </div>
          </form>
        )}

        {/* Busca + Lista de compras da fatura */}
        <div className="field-row" style={{ padding: "6px 10px" }}>
          <Search size={16} />
          <input
            aria-label="Buscar compras nesta fatura"
            placeholder="Buscar estabelecimento ou categoria nesta fatura..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="invoice-items-list">
          {filteredItems.length ? (
            filteredItems.map((t) => {
              const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
              return (
                <button
                  type="button"
                  key={t.id}
                  className="invoice-item-row"
                  onClick={() => {
                    onClose();
                    onSelectTitle?.(t.id);
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <strong style={{ display: "block", fontSize: 14, color: "var(--kc-ink)" }}>
                      {t.description}
                      {t.installment_total > 1 && (
                        <span className="small-flag" style={{ marginLeft: 6, fontSize: 10 }}>
                          {t.installment_index}/{t.installment_total}
                        </span>
                      )}
                    </strong>
                    <span className="hint" style={{ fontSize: 12 }}>
                      {t.category || "Outros"} · {rem === 0 ? "Pago" : "Na fatura"}
                    </span>
                  </div>
                  <strong style={{ fontSize: 14, color: rem === 0 ? "#067647" : "var(--kc-ink)" }}>
                    {money(cents(t.amount_cents))}
                  </strong>
                </button>
              );
            })
          ) : (
            <div className="empty-movements" style={{ margin: 0 }}>
              <CreditCard size={18} style={{ opacity: 0.5, marginBottom: 4 }} />
              <div>Nenhuma compra nesta fatura.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
