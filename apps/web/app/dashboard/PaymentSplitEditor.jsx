"use client";
import { Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import MoneyInput from "./MoneyInput";
import { cents, money } from "../../lib/finance";
import { centsToMask, maskToCents } from "../../lib/money-input";
import { computeCardUsage } from "../../lib/credit-cards";

const safeC = (v) => {
  try {
    return maskToCents(v || "0,00");
  } catch {
    return 0;
  }
};

export function serializeSplitRow(sp, defaultWalletId = "") {
  const amtCents = safeC(sp.amountMask);
  const inst = Math.max(1, Math.min(60, Number(sp.installmentCount || 1)));
  const bps = Math.min(
    10000,
    Math.max(0, Math.round(Number(String(sp.interestPct || "0").replace(",", ".")) * 100) || 0)
  );
  return {
    id: sp.id,
    paymentMethod: sp.paymentMethod || "standard",
    creditCardId: sp.paymentMethod === "credit_card" ? sp.creditCardId || null : null,
    walletId: sp.paymentMethod === "standard" ? sp.walletId || defaultWalletId || null : null,
    sourceGoalId: sp.paymentMethod === "caixinha" ? sp.sourceGoalId || null : null,
    amountCents: amtCents,
    installmentCount: sp.paymentMethod === "caixinha" ? 1 : inst,
    interestBps: bps,
  };
}

export function hydrateSplitRow(sp, defaultWalletId = "") {
  return {
    id: sp.id || `sp-${Math.random().toString(36).slice(2, 6)}`,
    paymentMethod: sp.paymentMethod || "standard",
    creditCardId: sp.creditCardId || "",
    walletId: sp.walletId || defaultWalletId || "",
    sourceGoalId: sp.sourceGoalId || "",
    amountMask: centsToMask(Math.max(0, cents(sp.amountCents))),
    installmentCount: String(sp.installmentCount || 1),
    interestPct: sp.interestBps ? String((Number(sp.interestBps) / 100).toFixed(2)).replace(".", ",") : "",
  };
}

export default function PaymentSplitEditor({
  totalCents = 0,
  splits = [],
  onChange,
  wallets = [],
  creditCards = [],
  caixinhas = [],
  rawData = null,
  allowCaixinha = true,
  allowInstallments = true,
  onSyncTotal = null,
}) {
  const allocatedCents = splits.reduce((s, sp) => s + Math.max(0, safeC(sp.amountMask)), 0);
  const remainingCents = totalCents - allocatedCents;

  const addSplit = () => {
    const autoAmt = Math.max(0, remainingCents);
    const usedCards = new Set(splits.filter((s) => s.paymentMethod === "credit_card").map((s) => s.creditCardId));
    const nextCard = creditCards.find((c) => !usedCards.has(c.id)) || creditCards[0] || null;
    const nextRow = {
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      paymentMethod: nextCard ? "credit_card" : "standard",
      creditCardId: nextCard?.id || "",
      walletId: wallets[0]?.id || "",
      sourceGoalId: "",
      amountMask: centsToMask(autoAmt),
      installmentCount: "1",
      interestPct: "",
    };
    onChange([...splits, nextRow]);
  };

  const updateRow = (idx, patch) => {
    onChange(splits.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx) => {
    if (splits.length <= 1) return;
    onChange(splits.filter((_, i) => i !== idx));
  };

  return (
    <div className="split-editor">
      <div className="split-editor-list">
        {splits.map((sp, idx) => {
          const selectVal =
            sp.paymentMethod === "credit_card"
              ? `card:${sp.creditCardId || creditCards[0]?.id || ""}`
              : sp.paymentMethod === "caixinha"
                ? `cx:${sp.sourceGoalId || caixinhas[0]?.id || ""}`
                : `wal:${sp.walletId || wallets[0]?.id || ""}`;

          return (
            <div className="split-row" key={sp.id || idx}>
              <div className="split-row-top">
                <select
                  aria-label={`Meio de pagamento ${idx + 1}`}
                  value={selectVal}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("card:")) {
                      updateRow(idx, { paymentMethod: "credit_card", creditCardId: v.slice(5), sourceGoalId: "" });
                    } else if (v.startsWith("cx:")) {
                      updateRow(idx, { paymentMethod: "caixinha", sourceGoalId: v.slice(3), creditCardId: "", installmentCount: "1" });
                    } else {
                      updateRow(idx, { paymentMethod: "standard", walletId: v.slice(4), creditCardId: "", sourceGoalId: "" });
                    }
                  }}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={`wal:${w.id}`}>
                      🏦 {w.name}
                    </option>
                  ))}
                  {creditCards.map((c) => {
                    const usage = computeCardUsage(c, rawData?.titles || []);
                    return (
                      <option key={c.id} value={`card:${c.id}`}>
                        💳 {c.name} (Livre: {money(usage.availableLimitCents)})
                      </option>
                    );
                  })}
                  {allowCaixinha &&
                    caixinhas.map((cx) => (
                      <option key={cx.id} value={`cx:${cx.id}`}>
                        🐷 Caixinha: {cx.title}
                      </option>
                    ))}
                </select>
                {splits.length > 1 && (
                  <button
                    type="button"
                    className="plain-icon"
                    style={{ width: 32, height: 32 }}
                    aria-label="Remover forma de pagamento"
                    onClick={() => removeRow(idx)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div className="split-row-nums">
                <div style={{ flex: 1, minWidth: 120 }}>
                  <MoneyInput
                    value={sp.amountMask}
                    onChange={(v) => updateRow(idx, { amountMask: v })}
                    ariaLabel={`Valor da parte ${idx + 1}`}
                  />
                </div>
                {allowInstallments && sp.paymentMethod !== "caixinha" && (
                  <>
                    <label className="split-mini-field">
                      <span>Parcelas</span>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sp.installmentCount || "1"}
                        onChange={(e) => updateRow(idx, { installmentCount: e.target.value })}
                      />
                    </label>
                    {Number(sp.installmentCount || 1) > 1 && (
                      <label className="split-mini-field">
                        <span>Juros %</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={sp.interestPct || ""}
                          onChange={(e) => updateRow(idx, { interestPct: e.target.value })}
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="split-editor-footer">
        <button type="button" className="pill pill-outline-orange pill-compact" onClick={addSplit}>
          <Plus size={14} /> Adicionar outra forma
        </button>

        {totalCents > 0 && (
          <div className={`split-balance-badge ${remainingCents === 0 ? "ok" : "warn"}`}>
            {remainingCents === 0 ? (
              <>
                <CheckCircle2 size={14} /> Total fechado ({money(totalCents)})
              </>
            ) : (
              <>
                <AlertTriangle size={14} />
                {remainingCents > 0
                  ? `Faltam ${money(remainingCents)}`
                  : `Passa ${money(Math.abs(remainingCents))}`}
                {onSyncTotal && (
                  <button
                    type="button"
                    className="split-sync-link"
                    onClick={() => onSyncTotal(centsToMask(allocatedCents))}
                  >
                    Ajustar total
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
