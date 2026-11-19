"use client";
import { useState } from "react";
import { ArrowDownCircle, ArrowRight, ArrowUpCircle, CheckCircle2, Sparkles, Wallet, X } from "lucide-react";
import MoneyInput from "./MoneyInput";
import { brDay } from "../../lib/finance";
import { maskToDecimal } from "../../lib/money-input";

const EXPENSE_CATS = ["Moradia", "Alimentação", "Transporte", "Saúde", "Assinaturas", "Lazer", "Educação", "Outros"];
const INCOME_CATS = ["Salário", "Renda extra", "Benefícios", "Rendimentos", "Reembolsos", "Outros"];

export default function OnboardingModal({
  open,
  wallets = [],
  onClose,
  onCompleted,
}) {
  const today = brDay();
  const hasWallet = wallets.length > 0;
  const [step, setStep] = useState(hasWallet ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [walletName, setWalletName] = useState("Conta principal");
  const [walletBalance, setWalletBalance] = useState("0,00");

  const [incDesc, setIncDesc] = useState("Salário");
  const [incAmount, setIncAmount] = useState("");
  const [incCategory, setIncCategory] = useState("Salário");
  const [incMode, setIncMode] = useState("monthly");
  const [incDate, setIncDate] = useState(today);
  const [incState, setIncState] = useState("pending");

  const [expDesc, setExpDesc] = useState("Aluguel");
  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState("Moradia");
  const [expMode, setExpMode] = useState("monthly");
  const [expDate, setExpDate] = useState(today);

  if (!open) return null;

  const parseNum = (mask) => Number(maskToDecimal(mask || "0"));

  async function postPortfolio(payload) {
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
    return json;
  }

  function nextFromStep1() {
    setErr("");
    if (!walletName.trim()) {
      setErr("Informe o nome da sua conta ou carteira.");
      return;
    }
    setStep(2);
  }

  function nextFromStep2() {
    setErr("");
    if (!incDesc.trim() || parseNum(incAmount) <= 0) {
      setErr("Informe a descrição e um valor maior que zero para sua 1ª receita.");
      return;
    }
    setStep(3);
  }

  async function finishOnboarding(e) {
    e.preventDefault();
    setErr("");
    if (!expDesc.trim() || parseNum(expAmount) <= 0) {
      setErr("Informe a descrição e um valor maior que zero para sua 1ª despesa.");
      return;
    }
    setSaving(true);
    try {
      let walletId = wallets[0]?.id || null;
      if (!walletId) {
        await postPortfolio({
          action: "wallet",
          name: walletName.trim(),
          balance: maskToDecimal(walletBalance || "0"),
          walletKind: "checking",
          liquidityKind: "immediate",
        });
        const listRes = await fetch("/api/portfolio");
        const listJson = await listRes.json().catch(() => ({}));
        walletId = listJson?.wallets?.[0]?.id || null;
      }
      if (!walletId) throw new Error("Conta criada, mas não foi possível localizar o identificador.");

      await postPortfolio({
        action: "title",
        walletId,
        direction: "income",
        description: incDesc.trim(),
        amount: maskToDecimal(incAmount),
        category: incCategory,
        mode: incMode,
        dueOn: incDate,
        occurredOn: incDate,
        settlementState: incMode === "single" ? incState : "pending",
        settledOn: incMode === "single" && incState === "paid" ? incDate : null,
      });

      await postPortfolio({
        action: "title",
        walletId,
        direction: "expense",
        description: expDesc.trim(),
        amount: maskToDecimal(expAmount),
        category: expCategory,
        mode: expMode,
        dueOn: expDate,
        occurredOn: expDate,
        settlementState: "pending",
      });

      await onCompleted?.();
    } catch (ex) {
      setErr(ex?.message || "Erro ao salvar configuração inicial.");
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = 3;

  return (
    <div className="action-overlay open" role="presentation">
      <div className="dialog dialog-wide onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
        <div className="dialog-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={13} aria-hidden="true" /> PRIMEIROS PASSOS · PASSO {step} DE {totalSteps}
            </div>
            <h2 id="onboardingTitle">
              {step === 1
                ? "Onde fica seu dinheiro hoje?"
                : step === 2
                  ? "Qual sua principal receita?"
                  : "Qual sua principal despesa?"}
            </h2>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Pular configuração">
            <X size={17} />
          </button>
        </div>

        <div className="onboarding-progress" aria-hidden="true">
          <div className="onboarding-progress-fill" style={{ width: `${Math.round((step / totalSteps) * 100)}%` }} />
        </div>

        {err && <div className="onboarding-error" role="alert">{err}</div>}

        {step === 1 && (
          <div className="onboarding-body">
            <p className="hint" style={{ margin: 0 }}>
              Vamos começar com sua conta principal para calcular seu saldo real desde o primeiro dia.
            </p>
            <div className="onboarding-chips">
              {["Nubank", "Itaú", "Banco do Brasil", "Caixa", "Carteira"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`mini-pill${walletName === preset ? " active" : ""}`}
                  onClick={() => setWalletName(preset)}
                >
                  <Wallet size={13} /> {preset}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Nome da conta
                <input
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Ex.: Nubank, Conta corrente"
                  maxLength={60}
                />
              </label>
              <label>
                Saldo atual hoje (R$)
                <MoneyInput ariaLabel="Saldo atual em reais" value={walletBalance} onChange={setWalletBalance} />
              </label>
            </div>
            <div className="onboarding-actions">
              <button type="button" className="tiny-btn" onClick={onClose}>
                Pular por enquanto
              </button>
              <button type="button" className="pill pill-primary" onClick={nextFromStep1}>
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <p className="hint" style={{ margin: 0 }}>
              Informe pelo menos <strong>1 receita</strong> para o app calcular sua margem e suas metas.
            </p>
            <div className="onboarding-chips">
              {[
                ["Salário", "Salário"],
                ["Freela", "Renda extra"],
                ["Pró-labore", "Salário"],
                ["Benefício", "Benefícios"],
              ].map(([label, cat]) => (
                <button
                  key={label}
                  type="button"
                  className={`mini-pill${incDesc === label ? " active" : ""}`}
                  onClick={() => {
                    setIncDesc(label);
                    setIncCategory(cat);
                  }}
                >
                  <ArrowUpCircle size={13} /> {label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Descrição da receita
                <input
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                  placeholder="Ex.: Salário mensal"
                  maxLength={80}
                />
              </label>
              <label>
                Valor (R$)
                <MoneyInput ariaLabel="Valor da receita em reais" value={incAmount} onChange={setIncAmount} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Frequência
                <select value={incMode} onChange={(e) => setIncMode(e.target.value)}>
                  <option value="monthly">Repete todo mês</option>
                  <option value="single">Só uma vez</option>
                </select>
              </label>
              <label>
                Origem
                <select value={incCategory} onChange={(e) => setIncCategory(e.target.value)}>
                  {INCOME_CATS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                {incMode === "single" && incState === "paid" ? "Data do recebimento" : "Data prevista"}
                <input type="date" value={incDate} onChange={(e) => setIncDate(e.target.value)} />
              </label>
              {incMode === "single" && (
                <label>
                  Situação
                  <select value={incState} onChange={(e) => setIncState(e.target.value)}>
                    <option value="pending">A receber</option>
                    <option value="paid">Já recebi</option>
                  </select>
                </label>
              )}
            </div>
            <div className="onboarding-actions">
              {!hasWallet ? (
                <button type="button" className="tiny-btn" onClick={() => setStep(1)}>
                  Voltar
                </button>
              ) : (
                <button type="button" className="tiny-btn" onClick={onClose}>
                  Pular por enquanto
                </button>
              )}
              <button type="button" className="pill pill-primary" onClick={nextFromStep2}>
                Próximo: 1ª despesa <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form className="onboarding-body" onSubmit={finishOnboarding}>
            <p className="hint" style={{ margin: 0 }}>
              Agora informe <strong>1 despesa</strong> (ex.: aluguel, mercado ou conta fixa) para ativar sua projeção.
            </p>
            <div className="onboarding-chips">
              {[
                ["Aluguel", "Moradia"],
                ["Mercado", "Alimentação"],
                ["Internet", "Assinaturas"],
                ["Energia", "Moradia"],
                ["Transporte", "Transporte"],
              ].map(([label, cat]) => (
                <button
                  key={label}
                  type="button"
                  className={`mini-pill${expDesc === label ? " active" : ""}`}
                  onClick={() => {
                    setExpDesc(label);
                    setExpCategory(cat);
                  }}
                >
                  <ArrowDownCircle size={13} /> {label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Descrição da despesa
                <input
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Ex.: Aluguel, Mercado"
                  maxLength={80}
                />
              </label>
              <label>
                Valor (R$)
                <MoneyInput ariaLabel="Valor da despesa em reais" value={expAmount} onChange={setExpAmount} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Categoria
                <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                  {EXPENSE_CATS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Frequência
                <select value={expMode} onChange={(e) => setExpMode(e.target.value)}>
                  <option value="monthly">Repete todo mês</option>
                  <option value="single">Só uma vez</option>
                </select>
              </label>
            </div>
            <label>
              Data de vencimento
              <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
            </label>
            <div className="onboarding-actions">
              <button type="button" className="tiny-btn" onClick={() => setStep(2)} disabled={saving}>
                Voltar
              </button>
              <button type="submit" className="pill pill-primary" disabled={saving}>
                <CheckCircle2 size={16} /> {saving ? "Salvando..." : "Concluir e ver meu painel"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
