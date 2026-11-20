import test from "node:test";
import assert from "node:assert/strict";
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
} from "./calculator.js";

test("calculator performs basic arithmetic and chains operations accurately", () => {
  let s = createInitialCalcState("");
  for (const ch of "125") s = inputDigit(s, ch);
  s = inputDecimal(s);
  s = inputDigit(s, "5");
  s = inputOperator(s, "+");
  for (const ch of "24") s = inputDigit(s, ch);
  s = inputDecimal(s);
  s = inputDigit(s, "5");
  s = evaluateCalc(s);
  assert.equal(s.display, "150");

  const resolved = resolveCalcToMoneyMask(s);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.cents, 15000);
  assert.equal(resolved.mask, "150,00");
});

test("calculator handles commercial percentage (100 + 10% = 110, 200 * 15% = 30)", () => {
  let s = createInitialCalcState("");
  for (const ch of "100") s = inputDigit(s, ch);
  s = inputOperator(s, "+");
  for (const ch of "10") s = inputDigit(s, ch);
  s = inputPercent(s);
  s = evaluateCalc(s);
  assert.equal(s.display, "110");

  let s2 = createInitialCalcState("");
  for (const ch of "200") s2 = inputDigit(s2, ch);
  s2 = inputOperator(s2, "*");
  for (const ch of "15") s2 = inputDigit(s2, ch);
  s2 = inputPercent(s2);
  s2 = evaluateCalc(s2);
  assert.equal(s2.display, "30");
});

test("calculator starts from existing MoneyInput value and supports continuing or replacing", () => {
  // Continuing operation from existing 142,80
  let s = createInitialCalcState("142,80");
  assert.equal(s.display, "142,8");
  s = inputOperator(s, "+");
  s = inputDigit(s, "7");
  s = inputDecimal(s);
  s = inputDigit(s, "2");
  const out = resolveCalcToMoneyMask(s);
  assert.equal(out.ok, true);
  assert.equal(out.mask, "150,00");

  // Typing a digit immediately replaces initial value
  let sReplace = createInitialCalcState("142,80");
  sReplace = inputDigit(sReplace, "5");
  sReplace = inputDigit(sReplace, "0");
  assert.equal(sReplace.display, "50");
});

test("calculator handles division by zero, backspace, clear, and negative guardrails", () => {
  let s = createInitialCalcState("");
  s = inputDigit(s, "1");
  s = inputDigit(s, "0");
  s = inputOperator(s, "/");
  s = inputDigit(s, "0");
  s = evaluateCalc(s);
  assert.equal(s.error, true);
  assert.equal(s.display, "Erro");
  assert.equal(resolveCalcToMoneyMask(s).ok, false);

  s = clearCalc();
  s = inputDigit(s, "5");
  s = inputDigit(s, "9");
  s = backspaceCalc(s);
  assert.equal(s.display, "5");

  // Negative result blocked when allowNegative=false, allowed when allowNegative=true
  let neg = createInitialCalcState("");
  neg = inputDigit(neg, "1");
  neg = inputDigit(neg, "0");
  neg = inputOperator(neg, "-");
  neg = inputDigit(neg, "2");
  neg = inputDigit(neg, "5");
  neg = evaluateCalc(neg);
  assert.equal(neg.display, "-15");
  assert.equal(resolveCalcToMoneyMask(neg, { allowNegative: false }).ok, false);
  const okNeg = resolveCalcToMoneyMask(neg, { allowNegative: true });
  assert.equal(okNeg.ok, true);
  assert.equal(okNeg.mask, "-15,00");
});
