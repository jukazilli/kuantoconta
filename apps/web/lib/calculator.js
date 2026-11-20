import { centsToMask } from "./money-input.js";

/**
 * Pure calculator engine supporting pt-BR decimal entry, chaining operations,
 * and commercial percentage calculations (e.g. 100 + 10% = 110, 200 * 15% = 30).
 */

export function formatCalcNumber(num) {
  if (!Number.isFinite(num)) return "Erro";
  // Avoid floating point noise like 0.1 + 0.2 = 0.30000000000000004
  const rounded = Math.round(num * 1000000) / 1000000;
  return String(rounded).replace(".", ",");
}

export function parseCalcDisplay(display) {
  if (!display || display === "Erro") return 0;
  const n = Number(String(display).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function applyBinaryOp(left, op, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? NaN : left / right;
    default:
      return right;
  }
}

export function createInitialCalcState(initialValueStr = "") {
  const cleaned = String(initialValueStr || "").replace(/[^\d,-]/g, "");
  const parsed = parseCalcDisplay(cleaned);
  const hasInitial = parsed !== 0;
  return {
    display: hasInitial ? formatCalcNumber(parsed) : "0",
    accumulator: null,
    operator: null,
    waitingForOperand: hasInitial, // typing a digit replaces initial value; pressing an operator uses it
    expression: "",
    error: false,
  };
}

export function inputDigit(state, digit) {
  if (state.error) {
    return { ...createInitialCalcState(), display: digit, waitingForOperand: false };
  }
  if (state.waitingForOperand) {
    return {
      ...state,
      display: digit,
      waitingForOperand: false,
    };
  }
  const current = state.display === "0" ? digit : state.display + digit;
  // Cap length to avoid overflow
  if (current.replace(/[^\d]/g, "").length > 12) return state;
  return { ...state, display: current };
}

export function inputDecimal(state) {
  if (state.error) {
    return { ...createInitialCalcState(), display: "0,", waitingForOperand: false };
  }
  if (state.waitingForOperand) {
    return { ...state, display: "0,", waitingForOperand: false };
  }
  if (state.display.includes(",")) return state;
  return { ...state, display: state.display + "," };
}

export function backspaceCalc(state) {
  if (state.error || state.waitingForOperand) {
    return { ...state, display: "0", error: false, waitingForOperand: false };
  }
  const next = state.display.slice(0, -1);
  if (!next || next === "-") return { ...state, display: "0" };
  return { ...state, display: next };
}

export function clearCalc() {
  return createInitialCalcState("");
}

const OP_SYMBOL = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export function inputOperator(state, nextOp) {
  if (state.error) return clearCalc();
  const inputValue = parseCalcDisplay(state.display);

  if (state.accumulator === null) {
    return {
      ...state,
      accumulator: inputValue,
      operator: nextOp,
      waitingForOperand: true,
      expression: `${formatCalcNumber(inputValue)} ${OP_SYMBOL[nextOp] || nextOp}`,
    };
  }

  if (state.waitingForOperand) {
    return {
      ...state,
      operator: nextOp,
      expression: `${formatCalcNumber(state.accumulator)} ${OP_SYMBOL[nextOp] || nextOp}`,
    };
  }

  const result = applyBinaryOp(state.accumulator, state.operator, inputValue);
  if (!Number.isFinite(result)) {
    return {
      display: "Erro",
      accumulator: null,
      operator: null,
      waitingForOperand: true,
      expression: "",
      error: true,
    };
  }

  const formatted = formatCalcNumber(result);
  return {
    display: formatted,
    accumulator: result,
    operator: nextOp,
    waitingForOperand: true,
    expression: `${formatted} ${OP_SYMBOL[nextOp] || nextOp}`,
    error: false,
  };
}

export function inputPercent(state) {
  if (state.error) return clearCalc();
  const current = parseCalcDisplay(state.display);
  let nextValue;
  if (state.accumulator !== null && (state.operator === "+" || state.operator === "-")) {
    // Commercial percentage: 100 + 10% -> 10% of 100 = 10
    nextValue = (state.accumulator * current) / 100;
  } else {
    nextValue = current / 100;
  }
  return {
    ...state,
    display: formatCalcNumber(nextValue),
    waitingForOperand: false,
  };
}

export function evaluateCalc(state) {
  if (state.error) return clearCalc();
  if (state.operator === null || state.accumulator === null) {
    const val = parseCalcDisplay(state.display);
    return {
      ...state,
      display: formatCalcNumber(val),
      waitingForOperand: true,
      expression: "",
    };
  }

  const right = parseCalcDisplay(state.display);
  const result = applyBinaryOp(state.accumulator, state.operator, right);
  if (!Number.isFinite(result)) {
    return {
      display: "Erro",
      accumulator: null,
      operator: null,
      waitingForOperand: true,
      expression: "",
      error: true,
    };
  }

  return {
    display: formatCalcNumber(result),
    accumulator: null,
    operator: null,
    waitingForOperand: true,
    expression: `${formatCalcNumber(state.accumulator)} ${OP_SYMBOL[state.operator] || state.operator} ${formatCalcNumber(right)} =`,
    error: false,
  };
}

/**
 * Resolves the final numeric result (evaluating any pending operation)
 * and formats it as a BRL money mask string (e.g. "172,70").
 */
export function resolveCalcToMoneyMask(state, { allowNegative = false } = {}) {
  const evaluated = state.operator && state.accumulator !== null && !state.waitingForOperand
    ? evaluateCalc(state)
    : state;

  if (evaluated.error) {
    return { ok: false, error: "Operação inválida (ex.: divisão por zero)." };
  }

  const val = parseCalcDisplay(evaluated.display);
  const totalCents = Math.round(val * 100);
  if (!Number.isSafeInteger(totalCents)) {
    return { ok: false, error: "Valor fora do limite permitido." };
  }
  if (!allowNegative && totalCents < 0) {
    return { ok: false, error: "Este campo não aceita valor negativo." };
  }

  return {
    ok: true,
    cents: totalCents,
    mask: centsToMask(totalCents, { allowNegative }),
  };
}
