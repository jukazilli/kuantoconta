"use client";
import { useEffect, useState } from "react";
import { X, Delete, Check } from "lucide-react";
import {
  createInitialCalcState,
  inputDigit,
  inputDecimal,
  backspaceCalc,
  clearCalc,
  inputOperator,
  inputPercent,
  evaluateCalc,
  resolveCalcToMoneyMask,
} from "../../lib/calculator";

export default function CalculatorModal({
  initialValue = "",
  allowNegative = false,
  onInsert,
  onClose,
}) {
  const [calc, setCalc] = useState(() => createInitialCalcState(initialValue));
  const [err, setErr] = useState("");

  function update(fn) {
    setErr("");
    setCalc((old) => fn(old));
  }

  function handleInsert() {
    const res = resolveCalcToMoneyMask(calc, { allowNegative });
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    onInsert(res.mask);
    onClose();
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        update((s) => inputDigit(s, e.key));
      } else if (e.key === "," || e.key === ".") {
        e.preventDefault();
        update((s) => inputDecimal(s));
      } else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") {
        e.preventDefault();
        update((s) => inputOperator(s, e.key));
      } else if (e.key === "%") {
        e.preventDefault();
        update((s) => inputPercent(s));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        update((s) => backspaceCalc(s));
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        update(() => clearCalc());
      } else if (e.key === "=" || e.key === "Enter") {
        e.preventDefault();
        if (calc.operator && calc.accumulator !== null && !calc.waitingForOperand) {
          update((s) => evaluateCalc(s));
        } else if (e.key === "Enter") {
          handleInsert();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const preview = resolveCalcToMoneyMask(calc, { allowNegative });

  return (
    <div
      className="nested-overlay calc-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="calc-dialog" role="dialog" aria-modal="true" aria-label="Calculadora">
        <div className="quick-head">
          <h3>Calculadora</h3>
          <button type="button" aria-label="Fechar calculadora" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="calc-screen">
          <div className="calc-expression" aria-live="polite">
            {calc.expression || "\u00A0"}
          </div>
          <div className="calc-display" aria-live="polite">
            {calc.display}
          </div>
        </div>

        {err && (
          <div className="notice error" role="alert" style={{ padding: "8px 10px", fontSize: 12 }}>
            {err}
          </div>
        )}

        <div className="calc-grid" role="group" aria-label="Teclado da calculadora">
          <button type="button" className="calc-key fn" onClick={() => update(() => clearCalc())}>
            C
          </button>
          <button type="button" className="calc-key fn" aria-label="Apagar último dígito" onClick={() => update((s) => backspaceCalc(s))}>
            <Delete size={18} aria-hidden="true" />
          </button>
          <button type="button" className="calc-key fn" onClick={() => update((s) => inputPercent(s))}>
            %
          </button>
          <button
            type="button"
            className={`calc-key op${calc.operator === "/" ? " active" : ""}`}
            aria-label="Dividir"
            onClick={() => update((s) => inputOperator(s, "/"))}
          >
            ÷
          </button>

          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "7"))}>
            7
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "8"))}>
            8
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "9"))}>
            9
          </button>
          <button
            type="button"
            className={`calc-key op${calc.operator === "*" ? " active" : ""}`}
            aria-label="Multiplicar"
            onClick={() => update((s) => inputOperator(s, "*"))}
          >
            ×
          </button>

          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "4"))}>
            4
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "5"))}>
            5
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "6"))}>
            6
          </button>
          <button
            type="button"
            className={`calc-key op${calc.operator === "-" ? " active" : ""}`}
            aria-label="Subtrair"
            onClick={() => update((s) => inputOperator(s, "-"))}
          >
            −
          </button>

          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "1"))}>
            1
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "2"))}>
            2
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDigit(s, "3"))}>
            3
          </button>
          <button
            type="button"
            className={`calc-key op${calc.operator === "+" ? " active" : ""}`}
            aria-label="Somar"
            onClick={() => update((s) => inputOperator(s, "+"))}
          >
            +
          </button>

          <button type="button" className="calc-key zero" onClick={() => update((s) => inputDigit(s, "0"))}>
            0
          </button>
          <button type="button" className="calc-key" onClick={() => update((s) => inputDecimal(s))}>
            ,
          </button>
          <button
            type="button"
            className="calc-key eq"
            aria-label="Igual"
            onClick={() => update((s) => evaluateCalc(s))}
          >
            =
          </button>
        </div>

        <div className="calc-actions">
          <button type="button" className="light-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="calc-insert-btn" onClick={handleInsert}>
            <Check size={17} aria-hidden="true" />
            Inserir {preview.ok ? `R$ ${preview.mask}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
