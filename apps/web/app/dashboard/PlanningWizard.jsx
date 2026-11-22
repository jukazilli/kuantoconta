"use client";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Compass,
  CreditCard,
  ListChecks,
  PiggyBank,
  Plane,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import MoneyInput from "./MoneyInput";
import PaymentSplitEditor, { hydrateSplitRow, serializeSplitRow } from "./PaymentSplitEditor";
import { brDay, cents, isoDate, money } from "../../lib/finance";
import { centsToMask, maskToCents } from "../../lib/money-input";
import { computeCardUsage } from "../../lib/credit-cards";
import { simulateGoalPurchase, validatePaymentSplits } from "../../lib/goal-planner";

const fdate = (d) => {
  const s = isoDate(d).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : "—";
};

const safeCents = (v) => {
  try {
    return maskToCents(v || "0,00");
  } catch {
    return 0;
  }
};

export function createEmptyQuote(idx = 0, defaults = {}) {
  return {
    id: `q-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    label: idx === 0 ? "Plano principal" : `Opção ${idx + 1}`,
    url: "",
    target: defaults.target || "0,00",
    downPayment: defaults.downPayment || "0,00",
    installmentCount: defaults.installmentCount || "1",
    interestPct: defaults.interestPct || "",
    paymentStructure: defaults.paymentStructure || "upfront",
    paymentMethod: defaults.paymentMethod || "standard",
    creditCardId: defaults.creditCardId || "",
    selectedWalletId: defaults.selectedWalletId || "",
    downPaymentSource: defaults.downPaymentSource || "checking",
    sourceGoalId: defaults.sourceGoalId || "",
    parentWalletId: defaults.parentWalletId || "",
    items: Array.isArray(defaults.items) ? defaults.items : [],
    isChosen: idx === 0,
  };
}

export function normalizeFormQuotes(form, checkingWallets = [], creditCards = []) {
  const defaultWalletId = checkingWallets[0]?.id || "";
  if (Array.isArray(form.goalQuotes) && form.goalQuotes.length > 0) {
    return form.goalQuotes;
  }
  return [
    createEmptyQuote(0, {
      target: form.goalTarget || "0,00",
      downPayment: form.goalDownPayment || "0,00",
      installmentCount: form.goalInstallments || "1",
      interestPct: form.goalInterestPct || "",
      paymentStructure:
        Number(form.goalInstallments || 1) > 1 && safeCents(form.goalDownPayment) > 0
          ? "hybrid"
          : Number(form.goalInstallments || 1) > 1
            ? "installments"
            : "upfront",
      paymentMethod: form.goalPaymentMethod || "standard",
      creditCardId: form.goalCreditCardId || creditCards[0]?.id || "",
      selectedWalletId: defaultWalletId,
      downPaymentSource: form.downPaymentSource || "checking",
      sourceGoalId: form.downPaymentSource === "caixinha" ? (form.sourceGoalId || "") : "",
      parentWalletId: form.parentWalletId || defaultWalletId,
    }),
  ];
}

export default function PlanningWizard({
  form,
  setForm,
  wallets = [],
  walletBalances = {},
  caixinhas = [],
  categories = [],
  budgets = [],
  rawData = null,
  creditCards = [],
  busy = false,
}) {
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemPayMode, setItemPayMode] = useState("standard");
  const [itemCardId, setItemCardId] = useState(creditCards[0]?.id || "");
  const [itemInst, setItemInst] = useState("1");
  const [splitItemId, setSplitItemId] = useState(null);

  const checkingWallets = wallets;
  const planType = ["purchase", "trip", "shopping_list"].includes(form.goalPlanType)
    ? form.goalPlanType
    : "purchase";

  const quotes = useMemo(
    () => normalizeFormQuotes(form, checkingWallets, creditCards),
    [form, checkingWallets, creditCards]
  );
  const activeQuote = quotes[0];

  const field = (name, value) => setForm((old) => ({ ...old, [name]: value }));

  const updateQuote = (patch) => {
    setForm((old) => {
      const current = normalizeFormQuotes(old, checkingWallets, creditCards);
      const next = [{ ...current[0], ...patch }, ...current.slice(1)];
      const primary = next[0];
      return {
        ...old,
        goalQuotes: next,
        goalTarget: primary?.target || old.goalTarget,
        goalDownPayment: primary?.downPayment || old.goalDownPayment,
        goalInstallments: primary?.installmentCount || old.goalInstallments,
        goalInterestPct: primary?.interestPct || old.goalInterestPct,
        goalPaymentMethod: primary?.paymentMethod || old.goalPaymentMethod,
        goalCreditCardId: primary?.creditCardId || old.goalCreditCardId,
        downPaymentSource: primary?.downPaymentSource || old.downPaymentSource,
        sourceGoalId: primary?.sourceGoalId || old.sourceGoalId,
        parentWalletId: primary?.parentWalletId || old.parentWalletId,
      };
    });
  };

  const addItem = (presetTitle = null) => {
    const title = (presetTitle || itemDesc).trim();
    if (!title) return;
    const amtCents = safeCents(itemAmount);
    // In trip mode, items represent budgeted line items (price required if > 0; allow 0 in shopping_list!)
    if (planType === "trip" && amtCents <= 0) return;

    const isCard = planType === "trip" && itemPayMode === "credit_card" && Boolean(itemCardId || creditCards[0]?.id);
    const nextItem = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: title.slice(0, 120),
      amountCents: Math.max(0, amtCents),
      paymentMethod: isCard ? "credit_card" : "standard",
      creditCardId: isCard ? itemCardId || creditCards[0]?.id : null,
      installmentCount: planType === "trip" ? Math.max(1, Math.min(60, Number(itemInst || 1))) : 1,
      checked: false,
    };
    const nextItems = [...(activeQuote.items || []), nextItem];
    const nextSum = nextItems.reduce((s, it) => s + cents(it.amountCents), 0);
    updateQuote({
      items: nextItems,
      // In trip mode, auto-sum items into target; in shopping_list, keep user's ceiling unless target is 0
      target:
        planType === "trip"
          ? centsToMask(nextSum)
          : safeCents(activeQuote.target) <= 0 && nextSum > 0
            ? centsToMask(nextSum)
            : activeQuote.target,
    });
    setItemDesc("");
    setItemAmount("");
    setItemInst("1");
  };

  const removeItem = (itemId) => {
    const nextItems = (activeQuote.items || []).filter((it) => it.id !== itemId);
    const nextSum = nextItems.reduce((s, it) => s + cents(it.amountCents), 0);
    updateQuote({
      items: nextItems,
      target: planType === "trip" ? centsToMask(nextSum) : activeQuote.target,
    });
  };

  const items = activeQuote.items || [];
  const itemsSumCents = items.reduce((s, it) => s + cents(it.amountCents), 0);
  const effectiveTargetCents =
    planType === "trip" && itemsSumCents > 0 ? itemsSumCents : safeCents(activeQuote.target);
  const activeSplits = Array.isArray(activeQuote.paymentSplits) ? activeQuote.paymentSplits : [];
  const isSplitMode = planType === "purchase" && activeSplits.length > 0;
  const splitRows = useMemo(
    () => activeSplits.map((sp) => hydrateSplitRow(sp, checkingWallets[0]?.id || "")),
    [activeSplits, checkingWallets]
  );
  const splitCheck = useMemo(
    () =>
      isSplitMode
        ? validatePaymentSplits({ totalCents: effectiveTargetCents, splits: activeSplits })
        : { ok: true, remainingCents: 0, error: "" },
    [isSplitMode, effectiveTargetCents, activeSplits]
  );
  const pStruct = activeQuote.paymentStructure || "upfront";
  const downPaymentCents = pStruct === "hybrid" ? Math.min(effectiveTargetCents, safeCents(activeQuote.downPayment)) : 0;
  const instCount = pStruct === "upfront" ? 1 : Math.max(2, Math.min(120, Number(activeQuote.installmentCount || 12)));
  const interestBps = Math.min(
    10000,
    Math.max(0, Math.round(Number(String(activeQuote.interestPct || "0").replace(",", ".")) * 100) || 0)
  );

  const liveVerdict = useMemo(() => {
    if (!rawData || effectiveTargetCents <= 0) return null;
    return simulateGoalPurchase(
      rawData,
      {
        title: form.description || "Planejamento",
        targetCents: effectiveTargetCents,
        downPaymentCents,
        installmentCount: instCount,
        interestBps,
        desiredOn: form.goalDesiredOn || brDay(),
        paymentMethod: activeQuote.paymentMethod || "standard",
        creditCardId: activeQuote.paymentMethod === "credit_card" ? activeQuote.creditCardId || null : null,
        selectedWalletId: activeQuote.selectedWalletId || checkingWallets[0]?.id || null,
        budgetCategoryId: form.goalBudgetCategoryId || null,
        downPaymentSource: activeQuote.downPaymentSource || "checking",
        sourceGoalId: activeQuote.downPaymentSource === "caixinha" ? activeQuote.sourceGoalId || null : null,
        createLinkedCaixinha: activeQuote.downPaymentSource === "create_caixinha",
        paymentSplits: isSplitMode ? activeSplits : [],
        items: planType === "trip" ? items : [],
      },
      { today: brDay() }
    );
  }, [
    rawData,
    form.description,
    form.goalDesiredOn,
    form.goalBudgetCategoryId,
    effectiveTargetCents,
    downPaymentCents,
    instCount,
    interestBps,
    activeQuote.paymentMethod,
    activeQuote.creditCardId,
    activeQuote.selectedWalletId,
    activeQuote.downPaymentSource,
    activeQuote.sourceGoalId,
    isSplitMode,
    activeSplits,
    planType,
    items,
    checkingWallets,
  ]);

  const expenseCategories = categories.filter((c) => c.direction === "expense" && c.parent_id === null);
  const selectedBudget = form.goalBudgetCategoryId
    ? budgets.find((b) => String(b.categoryId) === String(form.goalBudgetCategoryId))
    : null;

  return (
    <div className="wizard-root">
      {/* Tipo de Planejamento */}
      <div className="direction-cards three" role="group" aria-label="Tipo de planejamento">
        {[
          ["purchase", "Compra / Objetivo", "Produto, carro ou bem", ShoppingBag],
          ["trip", "Viagem / Projeto", "Itens com cartão ou à vista", Plane],
          ["shopping_list", "Lista de compras", "Checklist de mercado", ListChecks],
        ].map(([k, lbl, sub, Icon]) => (
          <button
            key={k}
            type="button"
            className={`direction-card ${planType === k ? "expense active" : "neutral"}`}
            onClick={() => field("goalPlanType", k)}
          >
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong>{lbl}</strong>
              <small>{sub}</small>
            </div>
          </button>
        ))}
      </div>

      {/* Dados Principais */}
      <div className="wizard-pane">
        <label>
          {planType === "trip"
            ? "Nome da viagem ou projeto"
            : planType === "shopping_list"
              ? "Nome da lista"
              : "O que deseja comprar?"}
          <input
            required
            maxLength={120}
            placeholder={
              planType === "trip"
                ? "Ex.: Viagem Paraná, Férias em família"
                : planType === "shopping_list"
                  ? "Ex.: Mercado do mês, Lista da casa"
                  : "Ex.: Notebook, Trocar de carro, Celular"
            }
            value={form.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>

        <div className="form-grid">
          <label>
            {planType === "shopping_list" ? "Teto pretendido (R$)" : planType === "trip" ? "Total estimado (R$)" : "Valor total (R$)"}
            <MoneyInput
              value={planType === "trip" && itemsSumCents > 0 ? centsToMask(itemsSumCents) : activeQuote.target || "0,00"}
              onChange={(v) => updateQuote({ target: v })}
              ariaLabel="Valor do planejamento em reais"
            />
          </label>
          <label>
            Data prevista
            <input
              required
              type="date"
              min={brDay()}
              value={form.goalDesiredOn || brDay()}
              onChange={(e) => field("goalDesiredOn", e.target.value)}
            />
          </label>
        </div>

        <label>
          Orçamento relacionado {planType === "shopping_list" ? "(recomendado)" : "(opcional)"}
          <select
            value={form.goalBudgetCategoryId || ""}
            onChange={(e) => field("goalBudgetCategoryId", e.target.value)}
          >
            <option value="">Sem vínculo direto com orçamento</option>
            {expenseCategories.map((c) => {
              const b = budgets.find((x) => String(x.categoryId) === String(c.id));
              return (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {b?.limitCents !== null && b?.limitCents !== undefined
                    ? ` (Restam ${money(b.remainingCents ?? 0)})`
                    : ""}
                </option>
              );
            })}
          </select>
        </label>

        {planType === "shopping_list" && selectedBudget && selectedBudget.limitCents !== null && (
          <div className={`goal-verdict ${(selectedBudget.remainingCents ?? 0) >= effectiveTargetCents ? "ok" : "warn"}`} style={{ padding: "10px 12px" }}>
            <Compass size={16} />
            <div>
              <strong>
                {(selectedBudget.remainingCents ?? 0) >= effectiveTargetCents
                  ? `Cabe no orçamento de ${selectedBudget.categoryName}`
                  : `Passa do limite de ${selectedBudget.categoryName}`}
              </strong>
              <small>
                Restam {money(selectedBudget.remainingCents ?? 0)} no mês · Com este teto de {money(effectiveTargetCents)}, ficam{" "}
                {money((selectedBudget.remainingCents ?? 0) - effectiveTargetCents)}.
              </small>
            </div>
          </div>
        )}

        {/* ITENS: VIAGEM (com pagamento individual) OU LISTA DE COMPRAS (preço opcional estilo iPhone) */}
        {(planType === "trip" || planType === "shopping_list") && (
          <div className="wizard-items-box">
            <div className="section-header" style={{ marginBottom: 6 }}>
              <span className="field-caption" style={{ fontWeight: 600 }}>
                {planType === "trip" ? "Itens da viagem (lançamento individual)" : "Itens da lista (preço opcional)"}
              </span>
              <span className="hint">{items.length} item(ns)</span>
            </div>

            <div className="bank-picker-row">
              {(planType === "trip"
                ? ["Passagens", "Hospedagem", "Alimentação", "Passeios e Uber", "Reserva imprevistos"]
                : ["Arroz e Feijão", "Café", "Carnes", "Hortifruti", "Limpeza"]
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="bank-pick-chip"
                  onClick={() => (planType === "shopping_list" ? addItem(preset) : setItemDesc(preset))}
                >
                  <span>+ {preset}</span>
                </button>
              ))}
            </div>

            <div className="wizard-item-entry">
              <input
                placeholder={planType === "trip" ? "Ex.: Passagens, Hotel..." : "Adicionar item (Enter para incluir)"}
                value={itemDesc}
                maxLength={100}
                onChange={(e) => setItemDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
              />
              <div style={{ minWidth: 112 }}>
                <MoneyInput
                  value={itemAmount}
                  onChange={setItemAmount}
                  required={false}
                  placeholder={planType === "shopping_list" ? "Opc. R$" : "0,00"}
                  ariaLabel="Valor do item"
                />
              </div>
              {planType === "trip" && creditCards.length > 0 && (
                <>
                  <select value={itemPayMode} onChange={(e) => setItemPayMode(e.target.value)}>
                    <option value="standard">Conta / À vista</option>
                    <option value="credit_card">💳 Cartão</option>
                  </select>
                  {itemPayMode === "credit_card" && (
                    <>
                      <select
                        value={itemCardId || creditCards[0]?.id || ""}
                        onChange={(e) => setItemCardId(e.target.value)}
                      >
                        {creditCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        title="Parcelas"
                        value={itemInst}
                        onChange={(e) => setItemInst(e.target.value)}
                        style={{ width: 64 }}
                      />
                    </>
                  )}
                </>
              )}
              <button
                type="button"
                className="pill pill-primary pill-compact"
                style={{ minWidth: "auto", padding: "0 14px" }}
                onClick={() => addItem()}
              >
                <Plus size={15} /> Incluir
              </button>
            </div>

            {items.length > 0 && (
              <ul className="wizard-items-list">
                {items.map((it) => {
                  const itSplits = Array.isArray(it.paymentSplits) ? it.paymentSplits : [];
                  const isEditingSplit = planType === "trip" && splitItemId === it.id;
                  const itSplitRows = (itSplits.length > 0
                    ? itSplits
                    : [
                        {
                          id: `sp-${it.id}-1`,
                          paymentMethod: it.paymentMethod || "standard",
                          creditCardId: it.creditCardId || "",
                          walletId: checkingWallets[0]?.id || "",
                          amountCents: cents(it.amountCents),
                          installmentCount: it.installmentCount || 1,
                        },
                      ]
                  ).map((sp) => hydrateSplitRow(sp, checkingWallets[0]?.id || ""));
                  return (
                    <li key={it.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span>
                          <strong>{it.title}</strong>
                          {planType === "trip" && (
                            <small className="hint" style={{ marginLeft: 6 }}>
                              {itSplits.length > 1
                                ? `${itSplits.length} formas de pagamento`
                                : it.paymentMethod === "credit_card"
                                  ? `${it.installmentCount || 1}x no cartão`
                                  : "Conta / À vista"}
                            </small>
                          )}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {cents(it.amountCents) > 0 && <strong>{money(it.amountCents)}</strong>}
                          {planType === "trip" && cents(it.amountCents) > 0 && (
                            <button
                              type="button"
                              className="tiny-btn"
                              onClick={() => setSplitItemId(isEditingSplit ? null : it.id)}
                            >
                              {isEditingSplit ? "Fechar divisão" : "Dividir"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="plain-icon"
                            style={{ width: 26, height: 26 }}
                            aria-label={`Remover ${it.title}`}
                            onClick={() => removeItem(it.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </div>
                      {isEditingSplit && (
                        <PaymentSplitEditor
                          totalCents={cents(it.amountCents)}
                          splits={itSplitRows}
                          wallets={checkingWallets}
                          creditCards={creditCards}
                          caixinhas={caixinhas}
                          rawData={rawData}
                          allowCaixinha={false}
                          onChange={(nextRows) => {
                            const serialized = nextRows.map((r) => serializeSplitRow(r, checkingWallets[0]?.id || ""));
                            const nextItems = items.map((x) =>
                              x.id === it.id ? { ...x, paymentSplits: serialized } : x
                            );
                            updateQuote({ items: nextItems });
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* PAGAMENTO (Foco limpo para Compra / Objetivo; com suporte a múltiplos cartões/meios) */}
        {planType === "purchase" && (
          <div className="repeat-config" style={{ gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span className="field-caption" style={{ fontWeight: 600 }}>
                Como pretende pagar?
              </span>
              <button
                type="button"
                className={`tiny-btn${isSplitMode ? " active" : ""}`}
                onClick={() => {
                  if (isSplitMode) {
                    updateQuote({ paymentSplits: [] });
                  } else {
                    const seedSplit = {
                      id: `sp-${Date.now()}-1`,
                      paymentMethod: activeQuote.paymentMethod === "credit_card" ? "credit_card" : "standard",
                      creditCardId: activeQuote.creditCardId || creditCards[0]?.id || "",
                      walletId: activeQuote.selectedWalletId || checkingWallets[0]?.id || "",
                      sourceGoalId: activeQuote.downPaymentSource === "caixinha" ? activeQuote.sourceGoalId || "" : "",
                      amountCents: Math.max(0, effectiveTargetCents),
                      installmentCount: pStruct === "upfront" ? 1 : Number(activeQuote.installmentCount || 1),
                      interestBps,
                    };
                    updateQuote({ paymentSplits: [seedSplit] });
                  }
                }}
              >
                {isSplitMode ? "Usar pagamento único" : "+ Dividir pagamento (2+ cartões / Pix)"}
              </button>
            </div>

            {isSplitMode ? (
              <PaymentSplitEditor
                totalCents={effectiveTargetCents}
                splits={splitRows}
                wallets={checkingWallets}
                creditCards={creditCards}
                caixinhas={caixinhas}
                rawData={rawData}
                onSyncTotal={(newMask) => updateQuote({ target: newMask })}
                onChange={(nextRows) => {
                  const serialized = nextRows.map((r) => serializeSplitRow(r, checkingWallets[0]?.id || ""));
                  updateQuote({ paymentSplits: serialized });
                }}
              />
            ) : (
              <>
                <div className="direction-cards three" role="group" aria-label="Estrutura de pagamento">
              {[
                ["upfront", "À vista", "Na data ou 1x cartão"],
                ["installments", "Parcelado", "Em Nx mensais"],
                ["hybrid", "Entrada + Nx", "Sinal + parcelas"],
              ].map(([k, lbl, sub]) => (
                <button
                  key={k}
                  type="button"
                  className={`direction-card ${pStruct === k ? "expense active" : "neutral"}`}
                  onClick={() =>
                    updateQuote({
                      paymentStructure: k,
                      installmentCount: k === "upfront" ? "1" : activeQuote.installmentCount === "1" ? "12" : activeQuote.installmentCount,
                      downPayment: k === "hybrid" ? activeQuote.downPayment : "0,00",
                    })
                  }
                >
                  <div>
                    <strong>{lbl}</strong>
                    <small>{sub}</small>
                  </div>
                </button>
              ))}
            </div>

            {pStruct !== "upfront" && (
              <div className="form-grid">
                {pStruct === "hybrid" && (
                  <label>
                    Entrada (R$)
                    <MoneyInput
                      value={activeQuote.downPayment || "0,00"}
                      onChange={(v) => updateQuote({ downPayment: v })}
                      ariaLabel="Valor da entrada"
                    />
                  </label>
                )}
                <label>
                  Parcelas
                  <input
                    type="number"
                    min="2"
                    max="120"
                    value={activeQuote.installmentCount || "12"}
                    onChange={(e) => updateQuote({ installmentCount: e.target.value })}
                  />
                </label>
                <label>
                  Juros (% a.m. · opc.)
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={activeQuote.interestPct || ""}
                    onChange={(e) => updateQuote({ interestPct: e.target.value })}
                  />
                </label>
              </div>
            )}

            <div className="form-grid">
              <label>
                Meio de pagamento
                <select
                  value={
                    activeQuote.paymentMethod === "credit_card"
                      ? `card:${activeQuote.creditCardId || creditCards[0]?.id || ""}`
                      : activeQuote.downPaymentSource === "caixinha"
                        ? "caixinha"
                        : activeQuote.downPaymentSource === "create_caixinha"
                          ? "create_caixinha"
                          : "checking"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("card:")) {
                      updateQuote({
                        paymentMethod: "credit_card",
                        creditCardId: v.slice(5),
                        downPaymentSource: "checking",
                        sourceGoalId: "",
                      });
                    } else if (v === "caixinha" || v === "create_caixinha") {
                      updateQuote({
                        paymentMethod: "standard",
                        downPaymentSource: v,
                        sourceGoalId: v === "caixinha" ? (activeQuote.sourceGoalId || caixinhas[0]?.id || "") : "",
                      });
                    } else {
                      updateQuote({
                        paymentMethod: "standard",
                        downPaymentSource: "checking",
                        sourceGoalId: "",
                      });
                    }
                  }}
                >
                  <option value="checking">Conta bancária (saldo livre)</option>
                  {creditCards.map((c) => {
                    const usage = computeCardUsage(c, rawData?.titles || []);
                    return (
                      <option key={c.id} value={`card:${c.id}`}>
                        💳 {c.name} (Livre: {money(usage.availableLimitCents)})
                      </option>
                    );
                  })}
                  {caixinhas.length > 0 && <option value="caixinha">Usar Caixinha existente</option>}
                  {checkingWallets.length > 0 && <option value="create_caixinha">Criar Caixinha para juntar antes</option>}
                </select>
              </label>

              {activeQuote.paymentMethod !== "credit_card" &&
                (activeQuote.downPaymentSource || "checking") === "checking" &&
                checkingWallets.length > 0 && (
                  <label>
                    Conta prevista
                    <select
                      value={activeQuote.selectedWalletId || checkingWallets[0]?.id || ""}
                      onChange={(e) => updateQuote({ selectedWalletId: e.target.value })}
                    >
                      {checkingWallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {walletBalances[w.id] != null ? ` (${money(walletBalances[w.id])})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

              {activeQuote.downPaymentSource === "caixinha" && caixinhas.length > 0 && (
                <label>
                  Qual Caixinha?
                  <select
                    value={activeQuote.sourceGoalId || caixinhas[0]?.id || ""}
                    onChange={(e) => updateQuote({ sourceGoalId: e.target.value })}
                  >
                    {caixinhas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {activeQuote.downPaymentSource === "create_caixinha" && checkingWallets.length > 0 && (
                <label>
                  Banco da nova Caixinha
                  <select
                    value={activeQuote.parentWalletId || checkingWallets[0]?.id || ""}
                    onChange={(e) => updateQuote({ parentWalletId: e.target.value })}
                  >
                    {checkingWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* Veredito ao vivo compacto */}
        {liveVerdict && (
          <div className={`goal-verdict ${liveVerdict.isFeasible ? "ok" : "warn"}`}>
            {liveVerdict.isFeasible ? <CheckCircle2 size={18} /> : <Compass size={18} />}
            <div>
              <strong>
                {liveVerdict.isFeasible
                  ? `Cabe no plano em ${fdate(form.goalDesiredOn || brDay())}`
                  : liveVerdict.firstFeasibleDate
                    ? `Melhor momento: a partir de ${fdate(liveVerdict.firstFeasibleDate)}`
                    : "Ainda não cabe no seu fluxo atual"}
              </strong>
              <small>
                {liveVerdict.bottleneckDate
                  ? `Gargalo em ${fdate(liveVerdict.bottleneckDate)} (faltam ${money(liveVerdict.bottleneckShortfallCents)}).`
                  : `Total: ${money(liveVerdict.totalCostCents || effectiveTargetCents)} · Menor saldo futuro: ${money(
                      liveVerdict.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0
                    )}.`}
                {(liveVerdict.projectedPositions?.cardPositions || []).length > 0 && (
                  <>
                    {" · "}
                    {(liveVerdict.projectedPositions.cardPositions || [])
                      .map((cp) => `${cp.cardName}: ${money(cp.availableLimitBeforeCents)} → ${money(cp.availableLimitAfterCents)}`)
                      .join(" · ")}
                  </>
                )}
              </small>
            </div>
          </div>
        )}

        {/* Único CTA principal (sem duplicidade com cabeçalho) */}
        <div className="wizard-nav" style={{ justifyContent: "flex-end", paddingTop: 4 }}>
          <button type="submit" className="pill pill-primary" disabled={busy || (isSplitMode && !splitCheck.ok)}>
            <CheckCircle2 size={16} aria-hidden="true" />
            {busy ? "Salvando..." : form.goalId ? "Salvar alterações" : "Salvar planejamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
