"use client";
import { useMemo, useState } from "react";
import {
  Award,
  Check,
  Compass,
  CreditCard,
  ExternalLink,
  ListChecks,
  PiggyBank,
  Plane,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import MoneyInput from "./MoneyInput";
import { brDay, cents, isoDate, money } from "../../lib/finance";
import { centsToMask, maskToCents } from "../../lib/money-input";
import { computeCardUsage } from "../../lib/credit-cards";
import { comparePlanningQuotes } from "../../lib/goal-planner";

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
    label: idx === 0 ? "Opção principal" : `Opção ${idx + 1}`,
    url: "",
    target: defaults.target || "2.500,00",
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
      target: form.goalTarget || "2.500,00",
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
      sourceGoalId: form.sourceGoalId || "",
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
}) {
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemPayMode, setItemPayMode] = useState("standard");
  const [itemCardId, setItemCardId] = useState(creditCards[0]?.id || "");
  const [itemInst, setItemInst] = useState("1");

  const checkingWallets = wallets;
  const step = Math.min(3, Math.max(1, Number(form.goalWizardStep || 1)));
  const planType = ["purchase", "trip", "shopping_list"].includes(form.goalPlanType)
    ? form.goalPlanType
    : "purchase";

  const quotes = useMemo(
    () => normalizeFormQuotes(form, checkingWallets, creditCards),
    [form, checkingWallets, creditCards]
  );
  const activeIdx = Math.min(quotes.length - 1, Math.max(0, Number(form.goalActiveQuoteIdx || 0)));
  const activeQuote = quotes[activeIdx] || quotes[0];

  const field = (name, value) => setForm((old) => ({ ...old, [name]: value }));

  const updateActiveQuote = (patch) => {
    setForm((old) => {
      const current = normalizeFormQuotes(old, checkingWallets, creditCards);
      const next = current.map((q, idx) => (idx === activeIdx ? { ...q, ...patch } : q));
      const primary = next[0] || next[activeIdx];
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

  const caixinhaBalanceOf = (g) => {
    if (!g) return 0;
    if (g.wallet_id && walletBalances[g.wallet_id] !== undefined && walletBalances[g.wallet_id] !== null) {
      return walletBalances[g.wallet_id];
    }
    return 0;
  };

  const addItemToActiveQuote = (presetTitle = null) => {
    const title = (presetTitle || itemDesc).trim();
    const amtCents = safeCents(itemAmount);
    if (!title || amtCents <= 0) return;
    const isCard = itemPayMode === "credit_card" && Boolean(itemCardId || creditCards[0]?.id);
    const nextItem = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: title.slice(0, 120),
      amountCents: amtCents,
      paymentMethod: isCard ? "credit_card" : "standard",
      creditCardId: isCard ? itemCardId || creditCards[0]?.id : null,
      installmentCount: Math.max(1, Math.min(60, Number(itemInst || 1))),
    };
    const nextItems = [...(activeQuote.items || []), nextItem];
    const nextTotal = nextItems.reduce((s, it) => s + cents(it.amountCents), 0);
    updateActiveQuote({
      items: nextItems,
      target: centsToMask(nextTotal),
    });
    setItemDesc("");
    setItemAmount("");
    setItemInst("1");
  };

  const removeItem = (itemId) => {
    const nextItems = (activeQuote.items || []).filter((it) => it.id !== itemId);
    const nextTotal = nextItems.reduce((s, it) => s + cents(it.amountCents), 0);
    updateActiveQuote({
      items: nextItems,
      target: nextTotal > 0 ? centsToMask(nextTotal) : activeQuote.target,
    });
  };

  const addComparisonQuote = () => {
    const cloned = {
      ...activeQuote,
      id: `q-${quotes.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      label: `Opção ${quotes.length + 1}`,
      url: "",
      isChosen: false,
    };
    setForm((old) => ({
      ...old,
      goalQuotes: [...quotes, cloned],
      goalActiveQuoteIdx: quotes.length,
    }));
  };

  const removeActiveQuote = () => {
    if (quotes.length <= 1) return;
    const next = quotes.filter((_, i) => i !== activeIdx);
    setForm((old) => ({
      ...old,
      goalQuotes: next,
      goalActiveQuoteIdx: Math.max(0, activeIdx - 1),
    }));
  };

  const selectChosenQuote = (quoteId) => {
    setForm((old) => ({
      ...old,
      goalQuotes: quotes.map((q) => ({ ...q, isChosen: q.id === quoteId })),
    }));
  };

  const serializedForCompare = useMemo(() => {
    return quotes.map((q) => {
      const itemsSum = (q.items || []).reduce((s, it) => s + cents(it.amountCents), 0);
      const targetCents = itemsSum > 0 ? itemsSum : safeCents(q.target);
      const downPaymentCents =
        q.paymentStructure === "hybrid" ? Math.min(targetCents, safeCents(q.downPayment)) : 0;
      const instCount =
        q.paymentStructure === "upfront" ? 1 : Math.max(1, Math.min(120, Number(q.installmentCount || 1)));
      const interestBps = Math.min(
        10000,
        Math.max(0, Math.round(Number(String(q.interestPct || "0").replace(",", ".")) * 100) || 0)
      );
      return {
        ...q,
        targetCents,
        downPaymentCents,
        installmentCount: instCount,
        interestBps,
        sourceGoalId: q.downPaymentSource === "caixinha" ? q.sourceGoalId || null : null,
        createLinkedCaixinha: q.downPaymentSource === "create_caixinha",
      };
    });
  }, [quotes]);

  const comparison = useMemo(() => {
    if (!rawData) return null;
    return comparePlanningQuotes(
      rawData,
      {
        title: form.description || "Planejamento",
        planType,
        desiredOn: form.goalDesiredOn || brDay(),
        budgetCategoryId: form.goalBudgetCategoryId || null,
        quotes: serializedForCompare,
      },
      { today: brDay() }
    );
  }, [rawData, form.description, planType, form.goalDesiredOn, form.goalBudgetCategoryId, serializedForCompare]);

  const expenseCategories = categories.filter((c) => c.direction === "expense" && c.parent_id === null);
  const pStruct = activeQuote.paymentStructure || "upfront";
  const isTripOrList = planType === "trip" || planType === "shopping_list";
  const hasItems = (activeQuote.items || []).length > 0;
  const activeCompared =
    comparison?.quotes?.find((q) => q.id === activeQuote.id) || comparison?.winner || null;

  return (
    <div className="wizard-root">
      {/* Navegação por Passos */}
      <div className="wizard-steps" role="tablist" aria-label="Etapas do planejamento">
        {[
          [1, "1. Objetivo"],
          [2, "2. Opções e pagamento"],
          [3, "3. Comparação e contas"],
        ].map(([num, lbl]) => (
          <button
            key={num}
            type="button"
            role="tab"
            aria-selected={step === num}
            className={`wizard-step-pill${step === num ? " active" : step > num ? " done" : ""}`}
            onClick={() => field("goalWizardStep", num)}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* PASSO 1: TIPO E OBJETIVO */}
      {step === 1 && (
        <div className="wizard-pane">
          <div className="direction-cards three" role="group" aria-label="Tipo de planejamento">
            {[
              ["purchase", "Compra / Cotação", "Comparar produtos, carros ou bens", ShoppingBag],
              ["trip", "Viagem / Roteiro", "Passagens, hotel, gastos e cenários", Plane],
              ["shopping_list", "Lista de compras", "Mercado ou casa ligado ao orçamento", ListChecks],
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

          <label>
            {planType === "trip"
              ? "Para onde ou qual evento quer planejar?"
              : planType === "shopping_list"
                ? "Nome da lista de compras"
                : "O que deseja comprar ou cotar?"}
            <input
              required
              maxLength={120}
              placeholder={
                planType === "trip"
                  ? "Ex.: Viagem Paraná dia 19, Férias em família"
                  : planType === "shopping_list"
                    ? "Ex.: Mercado de Dezembro, Reforma banheiro"
                    : "Ex.: Trocar de carro, Notebook, Celular"
              }
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>

          <div className="form-grid">
            <label>
              Data desejada
              <input
                required
                type="date"
                min={brDay()}
                value={form.goalDesiredOn || brDay()}
                onChange={(e) => field("goalDesiredOn", e.target.value)}
              />
            </label>
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
          </div>

          <div className="wizard-nav">
            <span className="hint">No próximo passo você monta valores, itens, cotações e forma de pagamento.</span>
            <button type="button" className="dark-button" onClick={() => field("goalWizardStep", 2)}>
              Avançar: opções e pagamento ›
            </button>
          </div>
        </div>
      )}

      {/* PASSO 2: OPÇÕES / COTAÇÕES, ITENS E FORMA DE PAGAMENTO */}
      {step === 2 && (
        <div className="wizard-pane">
          <div className="quote-tabs" role="tablist" aria-label="Cotações para comparar">
            {quotes.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                className={`quote-tab${idx === activeIdx ? " active" : ""}`}
                onClick={() => field("goalActiveQuoteIdx", idx)}
              >
                <span>{q.label || `Opção ${idx + 1}`}</span>
                <small>{money(safeCents(q.target))}</small>
              </button>
            ))}
            <button type="button" className="quote-tab quote-tab-add" onClick={addComparisonQuote}>
              <Plus size={14} /> Comparar outra opção
            </button>
          </div>

          <div className="repeat-config" style={{ gap: 12 }}>
            <div className="form-grid">
              <label>
                Nome desta {planType === "trip" ? "alternativa de roteiro" : "cotação / opção"}
                <input
                  required
                  maxLength={120}
                  placeholder={
                    planType === "trip"
                      ? "Ex.: De avião + Hotel, De carro + Airbnb"
                      : "Ex.: Gol 2020 Completo, Cruze LTZ"
                  }
                  value={activeQuote.label}
                  onChange={(e) => updateActiveQuote({ label: e.target.value })}
                />
              </label>
              <label>
                Link do anúncio ou referência (opcional)
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://..."
                  value={activeQuote.url || ""}
                  onChange={(e) => updateActiveQuote({ url: e.target.value })}
                />
              </label>
            </div>

            {isTripOrList && (
              <div className="wizard-items-box">
                <div className="section-header" style={{ marginBottom: 6 }}>
                  <span className="field-caption" style={{ fontWeight: 600 }}>
                    {planType === "trip" ? "Custos previstos da viagem" : "Itens planejados da lista"}
                  </span>
                  <span className="hint">{(activeQuote.items || []).length} item(ns)</span>
                </div>
                <div className="bank-picker-row">
                  {(planType === "trip"
                    ? ["Passagens", "Hospedagem", "Alimentação", "Passeios e Uber", "Reserva imprevistos"]
                    : ["Mercado básico", "Carnes e proteínas", "Hortifruti", "Limpeza e higiene"]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="bank-pick-chip"
                      onClick={() => setItemDesc(preset)}
                    >
                      <span>+ {preset}</span>
                    </button>
                  ))}
                </div>
                <div className="wizard-item-entry">
                  <input
                    placeholder={planType === "trip" ? "Ex.: Passagem aérea ida/volta" : "Ex.: Arroz, Café"}
                    value={itemDesc}
                    maxLength={100}
                    onChange={(e) => setItemDesc(e.target.value)}
                  />
                  <div style={{ minWidth: 115 }}>
                    <MoneyInput value={itemAmount} onChange={setItemAmount} ariaLabel="Valor do item" />
                  </div>
                  {planType === "trip" && creditCards.length > 0 && (
                    <>
                      <select value={itemPayMode} onChange={(e) => setItemPayMode(e.target.value)}>
                        <option value="standard">À vista / Conta</option>
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
                    onClick={() => addItemToActiveQuote()}
                  >
                    <Plus size={15} /> Incluir
                  </button>
                </div>
                {hasItems && (
                  <ul className="wizard-items-list">
                    {(activeQuote.items || []).map((it) => (
                      <li key={it.id}>
                        <span>
                          <strong>{it.title}</strong>
                          <small className="hint" style={{ marginLeft: 6 }}>
                            {it.paymentMethod === "credit_card"
                              ? `${it.installmentCount || 1}x no cartão`
                              : "À vista / Conta"}
                          </small>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <strong>{money(it.amountCents)}</strong>
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <label>
              {hasItems ? "Valor total calculado pelos itens (R$)" : "Valor total desta opção (R$)"}
              <MoneyInput
                value={activeQuote.target || "0,00"}
                onChange={(v) => updateActiveQuote({ target: v })}
                ariaLabel="Valor total da cotação"
              />
            </label>
          </div>

          {/* ESTRUTURA DE PAGAMENTO SEM REDUNDÂNCIA */}
          <div className="repeat-config" style={{ gap: 12 }}>
            <span className="field-caption" style={{ fontWeight: 600 }}>
              Como pretende pagar esta opção?
            </span>
            <div className="direction-cards three" role="group" aria-label="Estrutura de pagamento">
              {[
                ["upfront", "À vista", "100% na data ou 1x cartão"],
                ["installments", "Parcelado", "Sem entrada em Nx"],
                ["hybrid", "Entrada + Parcelas", "Sinal + restante financiado"],
              ].map(([k, lbl, sub]) => (
                <button
                  key={k}
                  type="button"
                  className={`direction-card ${pStruct === k ? "expense active" : "neutral"}`}
                  onClick={() =>
                    updateActiveQuote({
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

            {pStruct === "upfront" && (
              <>
                <label>
                  De onde vai sair ou como vai pagar?
                  <select
                    value={
                      activeQuote.paymentMethod === "credit_card"
                        ? "credit_card"
                        : activeQuote.downPaymentSource || "checking"
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "credit_card") {
                        updateActiveQuote({
                          paymentMethod: "credit_card",
                          creditCardId: activeQuote.creditCardId || creditCards[0]?.id || "",
                          downPaymentSource: "checking",
                        });
                      } else {
                        updateActiveQuote({
                          paymentMethod: "standard",
                          downPaymentSource: val,
                        });
                      }
                    }}
                  >
                    <option value="checking">Saldo da conta bancária (uso diário)</option>
                    {creditCards.length > 0 && <option value="credit_card">💳 Cartão de crédito (1x na fatura)</option>}
                    {caixinhas.length > 0 && <option value="caixinha">Usar dinheiro já guardado em uma Caixinha</option>}
                    {checkingWallets.length > 0 && (
                      <option value="create_caixinha">Criar uma Caixinha para juntar 100% até a data</option>
                    )}
                  </select>
                </label>
                {activeQuote.paymentMethod === "credit_card" && creditCards.length > 0 && (
                  <label>
                    Qual cartão usar?
                    <select
                      value={activeQuote.creditCardId || creditCards[0]?.id || ""}
                      onChange={(e) => updateActiveQuote({ creditCardId: e.target.value })}
                    >
                      {creditCards.map((c) => {
                        const usage = computeCardUsage(c, rawData?.titles || []);
                        return (
                          <option key={c.id} value={c.id}>
                            💳 {c.name} (Livre hoje: {money(usage.availableLimitCents)} · Vence dia {c.due_day})
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}
              </>
            )}

            {pStruct !== "upfront" && (
              <>
                <div className="form-grid">
                  {pStruct === "hybrid" && (
                    <label>
                      Valor da entrada (R$)
                      <MoneyInput
                        value={activeQuote.downPayment || "0,00"}
                        onChange={(v) => updateActiveQuote({ downPayment: v })}
                        ariaLabel="Valor da entrada"
                      />
                    </label>
                  )}
                  <label>
                    Número de parcelas
                    <input
                      type="number"
                      min="2"
                      max="120"
                      value={activeQuote.installmentCount || "12"}
                      onChange={(e) => updateActiveQuote({ installmentCount: e.target.value })}
                    />
                  </label>
                  <label>
                    Juros (% a.m. · opcional)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 1,80"
                      value={activeQuote.interestPct || ""}
                      onChange={(e) => updateActiveQuote({ interestPct: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  Como pagar as parcelas {pStruct === "hybrid" ? "do restante" : ""}?
                  <select
                    value={activeQuote.paymentMethod || "standard"}
                    onChange={(e) =>
                      updateActiveQuote({
                        paymentMethod: e.target.value,
                        creditCardId:
                          e.target.value === "credit_card"
                            ? activeQuote.creditCardId || creditCards[0]?.id || ""
                            : "",
                      })
                    }
                  >
                    <option value="standard">Conta bancária / Financiamento ou Carnê</option>
                    {creditCards.length > 0 && <option value="credit_card">💳 Cartão de crédito</option>}
                  </select>
                </label>

                {activeQuote.paymentMethod === "credit_card" && creditCards.length > 0 && (
                  <label>
                    Qual cartão vai parcelar?
                    <select
                      value={activeQuote.creditCardId || creditCards[0]?.id || ""}
                      onChange={(e) => updateActiveQuote({ creditCardId: e.target.value })}
                    >
                      {creditCards.map((c) => {
                        const usage = computeCardUsage(c, rawData?.titles || []);
                        return (
                          <option key={c.id} value={c.id}>
                            💳 {c.name} (Livre hoje: {money(usage.availableLimitCents)} · Vence dia {c.due_day})
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}

                <label>
                  {pStruct === "hybrid"
                    ? "De onde sai a entrada?"
                    : "Quer vincular ou criar uma Caixinha para juntar reserva para esta compra?"}
                  <select
                    value={activeQuote.downPaymentSource || "checking"}
                    onChange={(e) => updateActiveQuote({ downPaymentSource: e.target.value })}
                  >
                    <option value="checking">
                      {pStruct === "hybrid" ? "Do saldo livre em conta" : "Não vincular Caixinha (pagar no fluxo mensal)"}
                    </option>
                    {caixinhas.length > 0 && <option value="caixinha">Usar uma Caixinha existente</option>}
                    {checkingWallets.length > 0 && (
                      <option value="create_caixinha">
                        {pStruct === "hybrid"
                          ? "Criar uma Caixinha para juntar a entrada"
                          : "Criar uma Caixinha para juntar o valor antes"}
                      </option>
                    )}
                  </select>
                </label>
              </>
            )}

            {/* Subseleção dinâmica: Caixinha existente / Banco para nova Caixinha / Conta de pagamento */}
            {activeQuote.paymentMethod !== "credit_card" &&
              (activeQuote.downPaymentSource || "checking") === "checking" &&
              checkingWallets.length > 0 && (
                <label>
                  Conta principal prevista para este pagamento
                  <select
                    value={activeQuote.selectedWalletId || checkingWallets[0]?.id || ""}
                    onChange={(e) => updateActiveQuote({ selectedWalletId: e.target.value })}
                  >
                    {checkingWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {walletBalances[w.id] != null ? ` (Livre hoje: ${money(walletBalances[w.id])})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

            {activeQuote.downPaymentSource === "caixinha" && caixinhas.length > 0 && (
              <label>
                Escolha a Caixinha
                <select
                  required
                  value={activeQuote.sourceGoalId || caixinhas[0]?.id || ""}
                  onChange={(e) => updateActiveQuote({ sourceGoalId: e.target.value })}
                >
                  <option value="">Selecione a caixinha</option>
                  {caixinhas.map((c) => {
                    const bankName = checkingWallets.find((w) => w.id === c.parent_wallet_id)?.name || "Sem banco";
                    return (
                      <option key={c.id} value={c.id}>
                        {c.title} ({bankName} · Guardado: {money(caixinhaBalanceOf(c))})
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            {activeQuote.downPaymentSource === "create_caixinha" && checkingWallets.length > 0 && (
              <label>
                Em qual banco ficará a nova Caixinha?
                <select
                  required
                  value={activeQuote.parentWalletId || checkingWallets[0]?.id || ""}
                  onChange={(e) => updateActiveQuote({ parentWalletId: e.target.value })}
                >
                  {checkingWallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {quotes.length > 1 && (
              <button type="button" className="text-button" style={{ color: "var(--kc-red)" }} onClick={removeActiveQuote}>
                <Trash2 size={14} /> Remover esta opção da comparação
              </button>
            )}
          </div>

          <div className="wizard-nav">
            <button type="button" className="light-button" onClick={() => field("goalWizardStep", 1)}>
              ‹ Voltar
            </button>
            <button type="button" className="dark-button" onClick={() => field("goalWizardStep", 3)}>
              Ver comparação e posição ›
            </button>
          </div>
        </div>
      )}

      {/* PASSO 3: COMPARAÇÃO DE COTAÇÕES & POSIÇÃO PROJETADA (ANTES -> DEPOIS) */}
      {step === 3 && (
        <div className="wizard-pane">
          {comparison?.winner && (
            <div className={`goal-verdict ${comparison.winner.sim.isFeasible ? "ok" : "warn"}`}>
              <Award size={20} />
              <div>
                <strong>
                  {comparison.hasComparison
                    ? `Melhor para o seu bolso: ${comparison.winner.label}`
                    : comparison.winner.sim.isFeasible
                      ? `Cabe no plano na data desejada (${fdate(form.goalDesiredOn || brDay())})`
                      : comparison.winner.sim.firstFeasibleDate
                        ? `Melhor momento: a partir de ${fdate(comparison.winner.sim.firstFeasibleDate)}`
                        : "Ainda não cabe no horizonte"}
                </strong>
                <small>
                  {comparison.winnerReasonText}
                  {comparison.totalSavedVsWorstCents > 0
                    ? ` · Economia de ${money(comparison.totalSavedVsWorstCents)} frente à opção mais cara.`
                    : ""}
                </small>
              </div>
            </div>
          )}

          {comparison?.hasComparison && (
            <div className="compare-quotes-grid">
              {comparison.quotes.map((q) => (
                <div key={q.id} className={`quote-compare-card${q.isWinner ? " winner" : ""}`}>
                  <div className="quote-compare-head">
                    <strong>{q.label}</strong>
                    <span className={`status ${q.sim.isFeasible ? "done" : q.sim.firstFeasibleDate ? "partial" : "late"}`}>
                      {q.isWinner ? "🏆 Vencedora" : q.sim.isFeasible ? "Viável" : "Aperta caixa"}
                    </span>
                  </div>
                  <div className="quote-compare-nums">
                    <span>Custo final: <strong>{money(q.sim.totalCostCents)}</strong></span>
                    <span>
                      {q.sim.perInstallmentCents > 0
                        ? `${q.sim.installmentCountVerified}x de ${money(q.sim.perInstallmentCents)}`
                        : "À vista"}
                    </span>
                    {q.sim.twoStepVerdict?.downPaymentCents > 0 && (
                      <span>Entrada: {money(q.sim.twoStepVerdict.downPaymentCents)}</span>
                    )}
                    <span>
                      Menor saldo futuro:{" "}
                      <strong className={(q.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0) < 0 ? "red" : ""}>
                        {money(q.sim.projectedPositions?.walletPosition?.minFutureBalanceAfterCents ?? 0)}
                      </strong>
                    </span>
                  </div>
                  <div className="quote-compare-actions">
                    {q.url && (
                      <a href={q.url} target="_blank" rel="noopener noreferrer" className="pill pill-secondary pill-compact">
                        Abrir link <ExternalLink size={13} />
                      </a>
                    )}
                    <button
                      type="button"
                      className={`pill pill-compact ${q.isChosen ? "pill-primary" : "pill-outline-orange"}`}
                      style={{ minWidth: "auto" }}
                      onClick={() => selectChosenQuote(q.id)}
                    >
                      {q.isChosen ? <><Check size={13} /> Escolhida</> : "Escolher esta"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeCompared?.sim?.projectedPositions && (
            <div className="repeat-config" style={{ gap: 10 }}>
              <span className="field-caption" style={{ fontWeight: 600 }}>
                Como ficam suas contas se você efetivar ({activeCompared.label})
              </span>
              <div className="positions-grid">
                <div className="position-box">
                  <div className="position-box-head">
                    <Wallet size={15} /> <strong>Conta / Uso diário</strong>
                  </div>
                  <small>
                    Na data ({fdate(form.goalDesiredOn || brDay())}):{" "}
                    <strong>{money(activeCompared.sim.projectedPositions.walletPosition.balanceOnDateBeforeCents)}</strong> →{" "}
                    <strong className={activeCompared.sim.projectedPositions.walletPosition.balanceOnDateAfterCents < 0 ? "red" : ""}>
                      {money(activeCompared.sim.projectedPositions.walletPosition.balanceOnDateAfterCents)}
                    </strong>
                  </small>
                  <small>
                    Menor saldo futuro:{" "}
                    <strong>{money(activeCompared.sim.projectedPositions.walletPosition.minFutureBalanceBeforeCents)}</strong> →{" "}
                    <strong className={activeCompared.sim.projectedPositions.walletPosition.minFutureBalanceAfterCents < 0 ? "red" : ""}>
                      {money(activeCompared.sim.projectedPositions.walletPosition.minFutureBalanceAfterCents)}
                    </strong>
                  </small>
                </div>

                {activeCompared.sim.projectedPositions.caixinhaPosition && (
                  <div className="position-box">
                    <div className="position-box-head">
                      <PiggyBank size={15} />{" "}
                      <strong>{activeCompared.sim.projectedPositions.caixinhaPosition.caixinhaTitle}</strong>
                    </div>
                    <small>
                      Guardado hoje:{" "}
                      <strong>{money(activeCompared.sim.projectedPositions.caixinhaPosition.currentBalanceCents)}</strong> de{" "}
                      <strong>{money(activeCompared.sim.projectedPositions.caixinhaPosition.targetForPlanCents)}</strong>
                    </small>
                    <small>
                      {activeCompared.sim.projectedPositions.caixinhaPosition.stillNeededCents === 0
                        ? "Meta já 100% acumulada na Caixinha!"
                        : `Faltam ${money(activeCompared.sim.projectedPositions.caixinhaPosition.stillNeededCents)} (${money(activeCompared.sim.projectedPositions.caixinhaPosition.requiredMonthlySavingCents)}/mês)`}
                    </small>
                  </div>
                )}

                {activeCompared.sim.projectedPositions.cardPosition && (
                  <div className="position-box">
                    <div className="position-box-head">
                      <CreditCard size={15} />{" "}
                      <strong>{activeCompared.sim.projectedPositions.cardPosition.cardName}</strong>
                    </div>
                    <small>
                      Limite na data:{" "}
                      <strong>{money(activeCompared.sim.projectedPositions.cardPosition.availableLimitBeforeCents)}</strong> →{" "}
                      <strong>{money(activeCompared.sim.projectedPositions.cardPosition.availableLimitAfterCents)}</strong>
                    </small>
                    <small>
                      1ª fatura: <strong>{activeCompared.sim.projectedPositions.cardPosition.firstInvoiceMonth}</strong> (venc.{" "}
                      {fdate(activeCompared.sim.projectedPositions.cardPosition.firstInvoiceDueDate)})
                    </small>
                  </div>
                )}

                {activeCompared.sim.projectedPositions.budgetPosition && (
                  <div className="position-box">
                    <div className="position-box-head">
                      <Compass size={15} />{" "}
                      <strong>Orçamento {activeCompared.sim.projectedPositions.budgetPosition.categoryName}</strong>
                    </div>
                    <small>
                      Restante no mês:{" "}
                      <strong>
                        {activeCompared.sim.projectedPositions.budgetPosition.remainingBeforeCents !== null
                          ? money(activeCompared.sim.projectedPositions.budgetPosition.remainingBeforeCents)
                          : "Sem teto"}
                      </strong>{" "}
                      →{" "}
                      <strong
                        className={
                          activeCompared.sim.projectedPositions.budgetPosition.remainingAfterCents !== null &&
                          activeCompared.sim.projectedPositions.budgetPosition.remainingAfterCents < 0
                            ? "red"
                            : ""
                        }
                      >
                        {activeCompared.sim.projectedPositions.budgetPosition.remainingAfterCents !== null
                          ? money(activeCompared.sim.projectedPositions.budgetPosition.remainingAfterCents)
                          : money(activeCompared.sim.projectedPositions.budgetPosition.planAmountCents)}
                      </strong>
                    </small>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="wizard-nav">
            <button type="button" className="light-button" onClick={() => field("goalWizardStep", 2)}>
              ‹ Ajustar opções
            </button>
            <button type="submit" className="dark-button" style={{ background: "var(--kc-orange)" }}>
              Salvar planejamento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
