"use client";
import { useState } from "react";
import { Calculator } from "lucide-react";
import { maskMoney } from "../../lib/money-input";
import CalculatorModal from "./CalculatorModal";

export default function MoneyInput({
  value = "",
  onChange,
  allowNegative = false,
  withCalculator = true,
  placeholder = "0,00",
  ariaLabel,
  required = true,
  ...props
}) {
  const [calcOpen, setCalcOpen] = useState(false);

  return (
    <span className="money-input-wrap">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(maskMoney(e.target.value, { allowNegative }))}
      />
      {withCalculator && (
        <button
          type="button"
          className="calc-trigger-btn"
          title="Abrir calculadora"
          aria-label="Abrir calculadora para calcular valor"
          onClick={() => setCalcOpen(true)}
        >
          <Calculator size={18} aria-hidden="true" />
        </button>
      )}
      {calcOpen && (
        <CalculatorModal
          initialValue={value}
          allowNegative={allowNegative}
          onInsert={(masked) => onChange(masked)}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </span>
  );
}
