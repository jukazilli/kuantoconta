import { sql } from "./db.js";
import { brDay, validSettlementDay } from "./finance.js";
import { DEFAULT_CATEGORIES, allowedRoot, canonicalCategoryKey, normalizeCategoryName } from "./taxonomy.js";
import { isValidMonth, computeMonthlyIncomeCeilingCents, validateBudgetAllocationCeiling, computeBudgetRebalance, suggestBudgetsFromIncome } from "./budgets.js";
import { decodeOccurrenceId } from "./recurring.js";
import { validScope } from "./cancel-scope.js";
import { computePriceInstallmentCents } from "./goal-planner.js";
import { addMonthsYm, computeInvoiceCycleForPurchase, getInvoiceCycleDates } from "./credit-cards.js";
import { addMonthsToIsoDate } from "./lending.js";
import { DEFAULT_DESKTOP_COLUMNS, sanitizeColumnSettings, sanitizeWorkspaceColumns } from "./workspace-columns.js";

export const isDay = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(new Date(s + "T12:00:00Z").getTime()) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;

export const textValue = (x, n) =>
  typeof x === "string" && x.trim().length > 0 && x.trim().length <= n ? x.trim() : null;

export const isUuid = (x) =>
  typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

export function parseAmountCents(x, allowZero = false, allowNegative = false) {
  const s = String(x ?? "").trim().replace(",", ".");
  const re = allowNegative ? /^-?\d{1,10}(?:\.\d{1,2})?$/ : /^\d{1,10}(?:\.\d{1,2})?$/;
  if (!re.test(s)) throw new Error("Informe um valor válido em reais.");
  const negative = s.startsWith("-");
  const [a, b = ""] = (negative ? s.slice(1) : s).split(".");
  const n = (negative ? -1 : 1) * (Number(a) * 100 + Number(b.padEnd(2, "0")));
  if (!Number.isSafeInteger(n) || (!allowNegative && n < 0) || (!allowZero && n === 0)) {
    throw new Error("Valor inválido.");
  }
  return n;
}

function monthOffset(d, delta) {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(end, dd));
  return dt.toISOString().slice(0, 10);
}

const safeUrl = (raw) => {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
};

function sanitizePlanningQuotes(rawQuotes, amountFn, uuidFn) {
  if (!Array.isArray(rawQuotes)) return [];
  return rawQuotes.slice(0, 12).map((q, idx) => {
    const items = Array.isArray(q?.items)
      ? q.items.slice(0, 40).map((it, itemIdx) => ({
          id: textValue(String(it?.id || `item-${itemIdx + 1}`), 60) || `item-${itemIdx + 1}`,
          title: textValue(String(it?.title || "Item"), 120) || "Item",
          amountCents: Math.max(0, Number.isSafeInteger(Number(it?.amountCents)) ? Number(it.amountCents) : 0),
          paymentMethod: it?.paymentMethod === "credit_card" && uuidFn(it?.creditCardId) ? "credit_card" : "standard",
          creditCardId: it?.paymentMethod === "credit_card" && uuidFn(it?.creditCardId) ? it.creditCardId : null,
          installmentCount: Math.max(1, Math.min(60, parseInt(it?.installmentCount, 10) || 1)),
          checked: Boolean(it?.checked),
        }))
      : [];
    const targetCentsRaw = Number(q?.targetCents);
    const targetCents = Number.isSafeInteger(targetCentsRaw) && targetCentsRaw > 0
      ? targetCentsRaw
      : items.reduce((s, it) => s + it.amountCents, 0);
    const downRaw = Number(q?.downPaymentCents);
    const downPaymentCents = Number.isSafeInteger(downRaw) && downRaw >= 0 ? Math.min(targetCents, downRaw) : 0;
    const instCount = Math.max(1, Math.min(120, parseInt(q?.installmentCount, 10) || 1));
    const instCentsRaw = Number(q?.installmentCents);
    const installmentCents = Number.isSafeInteger(instCentsRaw) && instCentsRaw >= 0 ? instCentsRaw : 0;
    const interestBps = Math.min(10000, Math.max(0, Math.round(Number(q?.interestBps || 0))));
    return {
      id: textValue(String(q?.id || `q-${idx + 1}`), 60) || `q-${idx + 1}`,
      label: textValue(String(q?.label || `Cotação ${idx + 1}`), 120) || `Cotação ${idx + 1}`,
      url: safeUrl(q?.url || ""),
      targetCents,
      downPaymentCents,
      installmentCount: instCount,
      installmentCents,
      interestBps,
      paymentStructure: ["upfront", "installments", "hybrid"].includes(q?.paymentStructure) ? q.paymentStructure : "upfront",
      paymentMethod: q?.paymentMethod === "credit_card" && uuidFn(q?.creditCardId) ? "credit_card" : "standard",
      creditCardId: q?.paymentMethod === "credit_card" && uuidFn(q?.creditCardId) ? q.creditCardId : null,
      selectedWalletId: uuidFn(q?.selectedWalletId) ? q.selectedWalletId : null,
      downPaymentSource: ["checking", "caixinha", "create_caixinha"].includes(q?.downPaymentSource) ? q.downPaymentSource : "checking",
      sourceGoalId: uuidFn(q?.sourceGoalId) ? q.sourceGoalId : null,
      parentWalletId: uuidFn(q?.parentWalletId) ? q.parentWalletId : null,
      notes: typeof q?.notes === "string" ? q.notes.trim().slice(0, 300) : "",
      items,
      isChosen: Boolean(q?.isChosen),
    };
  });
}

const ok = (data, status = 200) => ({ ok: true, status, data });
const fail = (error, status = 400) => ({ ok: false, status, error });

export async function seedDefaultCategories(userId) {
  const defaults = Object.entries(DEFAULT_CATEGORIES).flatMap(([direction, names]) =>
    names.map((name) => ({ name, direction, canonical_key: canonicalCategoryKey(direction, name) }))
  );
  await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key)
   SELECT ${userId},r.name,r.direction,r.canonical_key
   FROM jsonb_to_recordset(${JSON.stringify(defaults)}::jsonb) AS r(name text,direction text,canonical_key text)
   ON CONFLICT DO NOTHING`;
}

export async function loadBudgetCeilingInputs(userId) {
  const [categories, budgetRules, budgetPeriods, titles, recurringRules, cancelledRecurring] = await Promise.all([
    sql`SELECT id,name,direction,parent_id,canonical_key,active,is_essential FROM public.kc_categories WHERE user_id=${userId} ORDER BY name LIMIT 300`,
    sql`SELECT id,category_id,limit_cents::text,starts_month,ends_month,active,created_at FROM public.kc_budget_rules WHERE user_id=${userId} ORDER BY created_at LIMIT 300`,
    sql`SELECT id,category_id,month,limit_cents::text,source_rule_id,version,updated_at FROM public.kc_budget_periods WHERE user_id=${userId} ORDER BY month DESC LIMIT 1200`,
    sql`SELECT id,wallet_id,description,direction,category,category_id,amount_cents::text,settled_cents::text,due_on::text,entry_kind,transfer_id,cancelled_at FROM public.kc_titles WHERE user_id=${userId} AND cancelled_at IS NULL LIMIT 4000`,
    sql`SELECT id,wallet_id,direction,description,category,category_id,amount_cents::text,starts_on::text,ends_on::text,paused_at::text,entry_kind FROM public.kc_recurring_rules WHERE user_id=${userId} LIMIT 300`,
    sql`SELECT series_id,installment_index FROM public.kc_titles WHERE user_id=${userId} AND cancelled_at IS NOT NULL AND series_id IS NOT NULL LIMIT 4000`,
  ]);
  return { categories, budgetRules, budgetPeriods, titles, recurringRules, cancelledRecurring };
}

export async function upsertBudgetSafe(ownerId, categoryId, limitCents, targetMonth, active, expectedVersion = null) {
  if (!active) {
    await sql`UPDATE public.kc_budget_rules SET active=false, ends_month=starts_month, updated_at=now() WHERE user_id=${ownerId} AND category_id=${categoryId}::uuid AND active=true AND starts_month > ${targetMonth}`;
  }
  return sql`SELECT public.kc_upsert_budget_rule(${ownerId},${categoryId}::uuid,${limitCents},${targetMonth},${active},${expectedVersion}) AS info`;
}

export async function loadPortfolio(ownerId) {
  const owner = { id: ownerId };
  await seedDefaultCategories(owner.id);
  const [
    wallets,
    titles,
    settlements,
    assets,
    liabilities,
    savedCategories,
    recurringRules,
    cancelledRecurring,
    cancellations,
    budgetRules,
    budgetPeriods,
    economicEvents,
    debtPayments,
    goals,
    healthSnapshots,
    spendingPlans,
    spendingPlanApplications,
  ] = await Promise.all([
    sql`SELECT id,name,opening_balance_cents::text,opening_at,wallet_kind,liquidity_kind,is_reserved,parent_wallet_id,caixinha_purpose,archived_at,created_at FROM public.kc_wallets WHERE user_id=${owner.id} ORDER BY created_at LIMIT 100`,
    sql`SELECT id,wallet_id,description,direction,category,subcategory,category_id,subcategory_id,economic_event_id,amount_cents::text,settled_cents::text,due_on::text,recurrence,installment_index,installment_total,series_id,is_essential,income_confidence,entry_kind,liability_id,person_id,credit_card_id,invoice_month,transfer_id,created_at FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY due_on,id LIMIT 4000`,
    sql`SELECT s.id,s.title_id,s.wallet_id,s.amount_cents::text,s.settled_on::text,s.created_at,s.reversed_at,s.reversal_reason,t.direction,t.category FROM public.kc_settlements s JOIN public.kc_titles t ON t.id=s.title_id AND t.user_id=s.user_id WHERE s.user_id=${owner.id} ORDER BY s.settled_on,s.created_at LIMIT 7000`,
    sql`SELECT id,label,value_cents::text,valued_on::text,asset_kind,liquidity_kind,linked_wallet_id FROM public.kc_assets WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
    sql`SELECT id,label,principal_cents::text,valued_on::text,debt_kind,interest_rate_bps,cet_bps,monthly_installment_cents::text,remaining_installments,maturity_on::text,status,series_id FROM public.kc_liabilities WHERE user_id=${owner.id} ORDER BY label LIMIT 200`,
    sql`SELECT id,name,direction,parent_id,canonical_key,active,is_essential FROM public.kc_categories WHERE user_id=${owner.id} ORDER BY name LIMIT 300`,
    sql`SELECT id,wallet_id,direction,description,category,subcategory,category_id,subcategory_id,amount_cents::text,starts_on::text,ends_on::text,paused_at::text,is_essential,income_confidence,entry_kind,created_at FROM public.kc_recurring_rules WHERE user_id=${owner.id} ORDER BY starts_on LIMIT 300`,
    sql`SELECT series_id,installment_index FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NOT NULL AND series_id IS NOT NULL LIMIT 4000`,
    sql`SELECT title_id,SUM(cancelled_pending_cents)::text AS cancelled_pending_cents,MAX(original_amount_cents)::text AS original_amount_cents FROM public.kc_title_cancellation_events WHERE user_id=${owner.id} GROUP BY title_id LIMIT 4000`,
    sql`SELECT id,category_id,limit_cents::text,starts_month,ends_month,active,created_at FROM public.kc_budget_rules WHERE user_id=${owner.id} ORDER BY created_at LIMIT 300`,
    sql`SELECT id,category_id,month,limit_cents::text,source_rule_id,version,updated_at FROM public.kc_budget_periods WHERE user_id=${owner.id} ORDER BY month DESC LIMIT 1200`,
    sql`SELECT id,direction,description,amount_cents::text,occurred_on::text,category_id,subcategory_id,event_kind,competence_source,status,recurring_rule_id,parent_event_id,created_at FROM public.kc_economic_events WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY occurred_on DESC,created_at DESC LIMIT 4000`,
    sql`SELECT id,liability_id,wallet_id,settlement_id,principal_cents::text,interest_fee_cents::text,paid_on::text,created_at FROM public.kc_debt_payments WHERE user_id=${owner.id} ORDER BY paid_on DESC LIMIT 1000`,
    sql`SELECT id,title,category,target_cents::text,down_payment_cents::text,installment_count,installment_cents::text,interest_bps,desired_on::text,priority,status,wallet_id,parent_wallet_id,caixinha_purpose,source_goal_id,payment_method,credit_card_id,plan_type,payment_structure,quotes_json,budget_category_id,selected_wallet_id,created_at FROM public.kc_financial_goals WHERE user_id=${owner.id} AND status<>'cancelled' ORDER BY priority,created_at DESC LIMIT 100`,
    sql`SELECT as_of::text,state,policy_version,reason_codes,stable_streak_months,updated_at FROM public.kc_health_snapshots WHERE user_id=${owner.id} ORDER BY as_of DESC LIMIT 1`,
    sql`SELECT id,description,category_id,subcategory_id,estimated_amount_cents::text,planned_for::text,planned_month,expected_payment_on::text,status,source,created_at,updated_at,cancelled_at FROM public.kc_spending_plans WHERE user_id=${owner.id} AND status<>'cancelled' ORDER BY planned_month,planned_for NULLS LAST,created_at DESC LIMIT 500`,
    sql`SELECT id,plan_id,economic_event_id,allocated_cents::text,created_at FROM public.kc_spending_plan_applications WHERE user_id=${owner.id} ORDER BY created_at DESC LIMIT 2000`,
  ]);
  let people = [];
  try {
    people = await sql`SELECT id,name,relationship,email,phone,notes,created_at FROM public.kc_people WHERE user_id=${owner.id} ORDER BY name LIMIT 300`;
  } catch (e) {
    if (e?.code !== "42P01") throw e;
  }
  let creditCards = [];
  try {
    creditCards = await sql`SELECT id,name,limit_cents::text,closing_day,due_day,default_wallet_id,archived_at,created_at FROM public.kc_credit_cards WHERE user_id=${owner.id} ORDER BY created_at LIMIT 50`;
  } catch (e) {
    if (e?.code !== "42P01") throw e;
  }
  let workspacePrefs = { desktopColumns: [...DEFAULT_DESKTOP_COLUMNS], columnSettings: {} };
  try {
    const prefRows = await sql`SELECT desktop_columns,column_settings FROM public.kc_user_preferences WHERE user_id=${owner.id} LIMIT 1`;
    if (prefRows.length) {
      workspacePrefs = {
        desktopColumns: sanitizeWorkspaceColumns(prefRows[0].desktop_columns),
        columnSettings: sanitizeColumnSettings(prefRows[0].column_settings),
      };
    }
  } catch (e) {
    if (e?.code !== "42P01") throw e;
  }
  return {
    wallets,
    titles,
    settlements,
    assets,
    liabilities,
    recurringRules,
    cancelledRecurring,
    cancellations,
    categories: savedCategories,
    budgetRules,
    budgetPeriods,
    economicEvents,
    debtPayments,
    goals,
    latestHealthSnapshot: healthSnapshots[0] || null,
    spendingPlans,
    spendingPlanApplications,
    people,
    creditCards,
    workspacePrefs,
    as_of: new Date().toISOString(),
  };
}

export async function executePortfolioPost(ownerId, x) {
  const owner = { id: ownerId };
  const day = isDay;
  const uuid = isUuid;
  const amount = parseAmountCents;

  if (x.action === "wallet") {
    const name = textValue(x.name, 90);
    if (!name) return fail("Informe o nome da conta.");
    const initial = amount(x.balance ?? "0", true, true);
    const walletKind = ["checking", "cash", "reserve", "investment"].includes(x.walletKind) ? x.walletKind : "checking";
    const liquidityKind = ["immediate", "d_plus", "locked"].includes(x.liquidityKind) ? x.liquidityKind : "immediate";
    const isReserved = Boolean(x.isReserved) || walletKind === "reserve";
    const inserted = await sql`INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved) VALUES(${owner.id},${name},${initial},now(),${walletKind},${liquidityKind},${isReserved}) RETURNING id`;
    return ok({ saved: true, id: inserted[0]?.id }, 201);
  }

  if (x.action === "category") {
    const name = textValue(x.name, 80);
    const direction = x.direction;
    if (!name || !["income", "expense"].includes(direction)) return fail("Nome ou tipo de categoria inválido.");
    const normalized = normalizeCategoryName(name);
    const existingCats = await sql`SELECT id,name,parent_id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} LIMIT 300`;
    if (!x.parentName) {
      if (allowedRoot(direction, name) || existingCats.some((c) => !c.parent_id && normalizeCategoryName(c.name) === normalized)) {
        return fail("Categoria já cadastrada.", 409);
      }
      const hasLimit = direction === "expense" && x.limit !== undefined && x.limit !== null && x.limit !== "";
      const limitCents = hasLimit ? amount(x.limit, true, false) : 0;
      const targetMonth = isValidMonth(x.month) ? x.month : brDay().slice(0, 7);
      let rebalance = { rebalanced: false, adjustments: [] };
      if (hasLimit && limitCents > 0) {
        const inputs = await loadBudgetCeilingInputs(owner.id);
        const autoRebalance = x.autoRebalance !== false;
        if (autoRebalance) {
          rebalance = computeBudgetRebalance({ month: targetMonth, targetCategoryId: null, newLimitCents: limitCents, ...inputs });
          if (!rebalance.ok) return fail(rebalance.error, 400);
        } else {
          const check = validateBudgetAllocationCeiling({ month: targetMonth, targetCategoryId: null, newLimitCents: limitCents, active: true, ...inputs });
          if (!check.ok) return fail(check.error, 400);
        }
      }
      const key = canonicalCategoryKey(direction, name);
      const inserted = await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${name},${direction},${key}) RETURNING id`;
      const catId = inserted[0]?.id;
      if (catId && hasLimit) {
        if (rebalance.rebalanced && rebalance.adjustments.length) {
          for (const adj of rebalance.adjustments) {
            await upsertBudgetSafe(owner.id, adj.categoryId, adj.newLimitCents, targetMonth, adj.newLimitCents > 0, null);
          }
        }
        await upsertBudgetSafe(owner.id, catId, limitCents, targetMonth, limitCents > 0, null);
      }
      return ok({ saved: true, id: catId, rebalanced: Boolean(rebalance.rebalanced), adjustments: rebalance.adjustments || [] }, 201);
    }
    const parentName = textValue(x.parentName, 80);
    if (!parentName) return fail("Selecione uma categoria antes de adicionar subcategoria.");
    const parent = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
    if (!parent.length && !allowedRoot(direction, parentName)) return fail("Categoria não encontrada.", 404);
    let parentId = parent[0]?.id;
    if (!parentId) {
      await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${parentName},${direction},${canonicalCategoryKey(direction, parentName)}) ON CONFLICT DO NOTHING`;
      const row = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${direction} AND parent_id IS NULL AND name=${parentName} LIMIT 1`;
      parentId = row[0]?.id;
    }
    if (existingCats.some((c) => normalizeCategoryName(c.name) === normalized)) return fail("Essa subcategoria já está cadastrada.", 409);
    const insertedSub = await sql`INSERT INTO public.kc_categories(user_id,name,direction,parent_id) VALUES(${owner.id},${name},${direction},${parentId}::uuid) RETURNING id`;
    return ok({ saved: true, id: insertedSub[0]?.id }, 201);
  }

  if (x.action === "budget") {
    if (!uuid(x.categoryId)) return fail("Orçamento inválido.");
    const targetMonth = isValidMonth(x.month) ? x.month : brDay().slice(0, 7);
    const active = x.active !== false;
    const limitCents = active ? amount(x.limit, true, false) : 0;
    const inputs = await loadBudgetCeilingInputs(owner.id);
    const autoRebalance = x.autoRebalance !== false;
    let rebalance = { rebalanced: false, adjustments: [] };
    if (active && limitCents > 0 && autoRebalance) {
      rebalance = computeBudgetRebalance({ month: targetMonth, targetCategoryId: x.categoryId, newLimitCents: limitCents, ...inputs });
      if (!rebalance.ok) return fail(rebalance.error, 400);
      for (const adj of rebalance.adjustments) {
        await upsertBudgetSafe(owner.id, adj.categoryId, adj.newLimitCents, targetMonth, adj.newLimitCents > 0, null);
      }
    } else {
      const check = validateBudgetAllocationCeiling({ month: targetMonth, targetCategoryId: x.categoryId, newLimitCents: limitCents, active, ...inputs });
      if (!check.ok) return fail(check.error, 400);
    }
    const expectedVersion = Number.isInteger(x.expectedVersion) ? x.expectedVersion : null;
    const rows = await upsertBudgetSafe(owner.id, x.categoryId, limitCents, targetMonth, active, expectedVersion);
    return ok({ saved: true, rebalanced: Boolean(rebalance.rebalanced), adjustments: rebalance.adjustments || [], ...rows[0]?.info }, 201);
  }

  if (x.action === "suggest_budgets") {
    const targetMonth = isValidMonth(x.month) ? x.month : brDay().slice(0, 7);
    const inputs = await loadBudgetCeilingInputs(owner.id);
    const incomeCents = computeMonthlyIncomeCeilingCents({ month: targetMonth, ...inputs });
    if (incomeCents <= 0) return fail("Cadastre seus valores a receber deste mês antes de gerar os orçamentos.", 400);
    const suggestions = suggestBudgetsFromIncome({ incomeCents });
    const existingCats = await sql`SELECT id,name,canonical_key FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND parent_id IS NULL LIMIT 300`;
    const catByNorm = new Map(existingCats.map((c) => [normalizeCategoryName(c.name), c.id]));
    for (const s of suggestions) {
      let catId = catByNorm.get(normalizeCategoryName(s.categoryName));
      if (!catId) {
        const key = canonicalCategoryKey("expense", s.categoryName);
        const ins = await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${s.categoryName},'expense',${key}) ON CONFLICT DO NOTHING RETURNING id`;
        catId = ins[0]?.id;
        if (!catId) {
          const found = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND parent_id IS NULL AND canonical_key=${key} LIMIT 1`;
          catId = found[0]?.id;
        }
        if (catId) catByNorm.set(normalizeCategoryName(s.categoryName), catId);
      }
      if (catId) {
        await upsertBudgetSafe(owner.id, catId, s.controlsLimit ? s.limitCents : 0, targetMonth, s.controlsLimit, null);
      }
    }
    const existingCapital = await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND (is_reserved=true OR wallet_kind IN ('reserve','investment')) LIMIT 1`;
    if (!existingCapital.length) {
      await sql`INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved) VALUES(${owner.id},'Carteira de Capital',0,now(),'investment','d_plus',true)`;
    }
    return ok({ saved: true, incomeCents, suggestions }, 201);
  }

  if (x.action === "loan") {
    const label = textValue(x.description, 120);
    if (!label) return fail("Informe a descrição do empréstimo.");
    const principalCents = amount(x.principal, false, false);
    const installmentCents = amount(x.installmentAmount, false, false);
    const count = Math.min(120, Math.max(2, parseInt(x.installmentCount, 10) || 0));
    if (!Number.isInteger(count) || count < 2) return fail("Informe ao menos 2 parcelas.");
    if (!day(x.firstDueOn)) return fail("Informe a data da primeira parcela.");
    const creditWallet = x.creditWallet !== false;
    const receivedDay = day(x.receivedOn) ? x.receivedOn : brDay();
    if (creditWallet) {
      if (!uuid(x.walletId)) return fail("Selecione a conta que recebeu o empréstimo.");
      if (receivedDay > brDay()) return fail("A data de recebimento não pode ser futura.");
    }
    const seriesId = crypto.randomUUID();
    const liabRows = await sql`INSERT INTO public.kc_liabilities(user_id,label,principal_cents,valued_on,debt_kind,monthly_installment_cents,remaining_installments,status,series_id) VALUES(${owner.id},${label},${principalCents},${receivedDay},'loan',${installmentCents},${count},'active',${seriesId}::uuid) RETURNING id`;
    const liabilityId = liabRows[0]?.id;
    const empCat = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND parent_id IS NULL AND canonical_key='expense:emprestimos' LIMIT 1`;
    const categoryId = empCat[0]?.id || null;
    if (creditWallet && uuid(x.walletId)) {
      const inTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,category_id,amount_cents,settled_cents,due_on,recurrence,entry_kind,liability_id) VALUES(${owner.id},${x.walletId}::uuid,${label + " (valor recebido)"},'income','Empréstimos',${categoryId},${principalCents},${principalCents},${receivedDay},'once','debt_payment',${liabilityId}::uuid) RETURNING id`;
      await sql`INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on) VALUES(${owner.id},${inTitle[0].id}::uuid,${x.walletId}::uuid,${principalCents},${receivedDay})`;
    }
    const walletRef = uuid(x.walletId)
      ? x.walletId
      : (await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} ORDER BY created_at LIMIT 1`)[0]?.id;
    if (!walletRef) return fail("Cadastre uma conta antes de lançar as parcelas do empréstimo.");
    for (let i = 1; i <= count; i++) {
      const due = monthOffset(x.firstDueOn, i - 1);
      await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,category_id,amount_cents,settled_cents,due_on,recurrence,installment_index,installment_total,series_id,entry_kind,liability_id) VALUES(${owner.id},${walletRef}::uuid,${`${label} (${i}/${count})`},'expense','Empréstimos',${categoryId},${installmentCents},0,${due},'installments',${i},${count},${seriesId}::uuid,'debt_payment',${liabilityId}::uuid)`;
    }
    return ok({ saved: true, liabilityId, seriesId }, 201);
  }

  if (x.action === "credit_card") {
    const name = textValue(x.name, 90);
    if (!name) return fail("Informe o nome do cartão de crédito.");
    const limitCents = amount(x.limit ?? "0", true, false);
    const closingDay = Number(x.closingDay);
    const dueDay = Number(x.dueDay);
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) return fail("Dia de fechamento deve ser entre 1 e 31.");
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return fail("Dia de vencimento deve ser entre 1 e 31.");
    const defaultWalletId = uuid(x.defaultWalletId) ? x.defaultWalletId : null;
    if (defaultWalletId) {
      const w = await sql`SELECT id FROM public.kc_wallets WHERE id=${defaultWalletId}::uuid AND user_id=${owner.id} LIMIT 1`;
      if (!w.length) return fail("Conta padrão de pagamento não encontrada.", 404);
    }
    const rows = await sql`INSERT INTO public.kc_credit_cards(user_id,name,limit_cents,closing_day,due_day,default_wallet_id) VALUES(${owner.id},${name},${limitCents},${closingDay},${dueDay},${defaultWalletId}::uuid) RETURNING id,name,limit_cents::text,closing_day,due_day,default_wallet_id`;
    return ok({ saved: true, id: rows[0]?.id, creditCard: rows[0] }, 201);
  }

  if (x.action === "person") {
    const name = textValue(x.name, 120);
    if (!name) return fail("Informe o nome da pessoa.");
    const relationship = textValue(x.relationship, 50) || "Outro";
    const email = x.email ? textValue(x.email, 160) : null;
    const phone = x.phone ? textValue(x.phone, 40) : null;
    const notes = x.notes ? textValue(x.notes, 300) : null;
    const rows = await sql`INSERT INTO public.kc_people(user_id,name,relationship,email,phone,notes) VALUES(${owner.id},${name},${relationship},${email},${phone},${notes}) RETURNING id,name,relationship,email,phone,notes,created_at`;
    return ok({ saved: true, id: rows[0]?.id, person: rows[0] }, 201);
  }

  if (x.action === "lend") {
    const description = textValue(x.description, 140);
    if (!description) return fail("Informe a descrição do empréstimo.");
    const rawAmountCents = amount(x.amount, false, false);
    if (!uuid(x.personId)) return fail("Selecione para quem você emprestou.");

    const hasCard = uuid(x.creditCardId);
    if (!hasCard && !uuid(x.walletId)) return fail("Selecione de qual conta ou cartão o valor saiu.");

    const lentOn = day(x.lentOn) ? x.lentOn : brDay();
    if (lentOn > brDay()) return fail("A data de saída/compra não pode ser futura.");
    const expectedRepaymentOn = day(x.expectedRepaymentOn) ? x.expectedRepaymentOn : null;
    if (!expectedRepaymentOn) return fail("Informe a previsão de pagamento.");
    if (expectedRepaymentOn < lentOn) return fail("A previsão de pagamento deve ser igual ou posterior à data de saída.");

    const cardInstallments = hasCard ? Math.max(1, Math.min(60, Number(x.cardInstallments || 1))) : 1;
    const repaymentCount = Math.max(1, Math.min(60, Number(x.repaymentCount || 1)));
    if (!Number.isInteger(cardInstallments) || !Number.isInteger(repaymentCount)) {
      return fail("Quantidade de parcelas inválida.");
    }
    const valueMode = x.valueMode === "installment" ? "installment" : "total";
    const totalCents =
      valueMode === "installment"
        ? rawAmountCents * (hasCard ? cardInstallments : repaymentCount)
        : rawAmountCents;

    const pRows = await sql`SELECT id,name,relationship FROM public.kc_people WHERE id=${x.personId}::uuid AND user_id=${owner.id} LIMIT 1`;
    if (!pRows.length) return fail("Pessoa não encontrada.", 404);
    const person = pRows[0];

    let card = null;
    let outWalletId = x.walletId || null;
    let repayWalletId = uuid(x.repaymentWalletId) ? x.repaymentWalletId : x.walletId || null;

    if (hasCard) {
      const cRows = await sql`SELECT id,name,closing_day,due_day,default_wallet_id FROM public.kc_credit_cards WHERE id=${x.creditCardId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
      if (!cRows.length) return fail("Cartão de crédito não encontrado.", 404);
      card = cRows[0];
      if (!uuid(repayWalletId)) {
        repayWalletId =
          card.default_wallet_id ||
          (await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND archived_at IS NULL ORDER BY created_at LIMIT 1`)[0]?.id;
      }
      outWalletId = repayWalletId;
    }

    if (!uuid(outWalletId) || !uuid(repayWalletId)) return fail("Conta bancária inválida.");
    const wCheckIds = outWalletId === repayWalletId ? [outWalletId] : [outWalletId, repayWalletId];
    const wRows = await sql`SELECT id,name FROM public.kc_wallets WHERE id = ANY(${wCheckIds}::uuid[]) AND user_id=${owner.id}`;
    if (wRows.length !== wCheckIds.length) return fail("Conta não encontrada.", 404);

    const linkId = crypto.randomUUID();
    const outTitleIds = [];

    if (card) {
      const firstCycle = computeInvoiceCycleForPurchase({
        purchaseDate: lentOn,
        closingDay: card.closing_day,
        dueDay: card.due_day,
      });
      const outSeriesId = cardInstallments > 1 ? crypto.randomUUID() : null;
      const basePart = Math.floor(totalCents / cardInstallments);
      const remPart = totalCents - basePart * cardInstallments;

      for (let i = 1; i <= cardInstallments; i++) {
        const ym = i === 1 ? firstCycle.invoiceMonth : addMonthsYm(firstCycle.invoiceMonth, i - 1);
        const cycle = i === 1 ? firstCycle : getInvoiceCycleDates(card, ym);
        const partCents = basePart + (i === 1 ? remPart : 0);
        const outLabel =
          cardInstallments > 1
            ? `${description} (${i}/${cardInstallments} · ${person.name})`
            : `${description} (${person.name})`;
        const inserted = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,installment_index,installment_total,series_id,entry_kind,person_id,credit_card_id,invoice_month,transfer_id) VALUES(${owner.id},${outWalletId}::uuid,${outLabel.slice(0, 140)},'expense','Empréstimos',${partCents},0,${cycle.dueDate}::date,${cardInstallments > 1 ? "installments" : "single"},${i},${cardInstallments},${outSeriesId}::uuid,'loan_out',${person.id}::uuid,${card.id}::uuid,${cycle.invoiceMonth},${linkId}::uuid) RETURNING id`;
        if (inserted[0]?.id) outTitleIds.push(inserted[0].id);
      }
    } else {
      const outLabel = `${description} (${person.name})`;
      const outTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,person_id,transfer_id) VALUES(${owner.id},${outWalletId}::uuid,${outLabel.slice(0, 140)},'expense','Empréstimos',${totalCents},${totalCents},${lentOn}::date,'single','loan_out',${person.id}::uuid,${linkId}::uuid) RETURNING id`;
      await sql`INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on,idempotency_key) VALUES(${owner.id},${outTitle[0].id}::uuid,${outWalletId}::uuid,${totalCents},${lentOn}::date,${crypto.randomUUID()}::uuid)`;
      if (outTitle[0]?.id) outTitleIds.push(outTitle[0].id);
    }

    const repaySeriesId = repaymentCount > 1 ? crypto.randomUUID() : null;
    const repayBase = Math.floor(totalCents / repaymentCount);
    const repayRem = totalCents - repayBase * repaymentCount;
    const repaymentTitleIds = [];

    for (let j = 1; j <= repaymentCount; j++) {
      const repayDue = j === 1 ? expectedRepaymentOn : addMonthsToIsoDate(expectedRepaymentOn, j - 1);
      const partCents = repayBase + (j === 1 ? repayRem : 0);
      const inLabel =
        repaymentCount > 1
          ? `Devolução (${j}/${repaymentCount}): ${description} (${person.name})`
          : `Devolução: ${description} (${person.name})`;
      const inTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,installment_index,installment_total,series_id,entry_kind,person_id,transfer_id) VALUES(${owner.id},${repayWalletId}::uuid,${inLabel.slice(0, 140)},'income','Reembolsos',${partCents},0,${repayDue}::date,${repaymentCount > 1 ? "installments" : "single"},${j},${repaymentCount},${repaySeriesId}::uuid,'loan_repayment',${person.id}::uuid,${linkId}::uuid) RETURNING id`;
      if (inTitle[0]?.id) repaymentTitleIds.push(inTitle[0].id);
    }

    return ok(
      {
        saved: true,
        outTitleId: outTitleIds[0] || null,
        outTitleIds,
        repaymentTitleId: repaymentTitleIds[0] || null,
        repaymentTitleIds,
        linkId,
        person,
        creditCardId: card?.id || null,
      },
      201
    );
  }

  if (x.action === "transfer_capital") {
    if (!uuid(x.fromWalletId) || !uuid(x.toWalletId) || x.fromWalletId === x.toWalletId) {
      return fail("Selecione contas de origem e destino diferentes.");
    }
    const transferCents = amount(x.amount, false, false);
    const transferDay = day(x.transferredOn) ? x.transferredOn : brDay();
    if (transferDay > brDay()) return fail("A data da transferência não pode ser futura.");
    const wallets = await sql`SELECT id,name FROM public.kc_wallets WHERE user_id=${owner.id} AND id IN (${x.fromWalletId}::uuid,${x.toWalletId}::uuid)`;
    if (wallets.length !== 2) return fail("Contas não encontradas.", 404);
    const desc = textValue(x.description, 120) || "Aporte para Carteira de Capital";
    const outTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind) VALUES(${owner.id},${x.fromWalletId}::uuid,${desc},'expense','Reserva e Capital',${transferCents},${transferCents},${transferDay},'once','reserve_transfer') RETURNING id`;
    const inTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind) VALUES(${owner.id},${x.toWalletId}::uuid,${desc},'income','Reserva e Capital',${transferCents},${transferCents},${transferDay},'once','reserve_transfer') RETURNING id`;
    await sql`INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on) VALUES(${owner.id},${outTitle[0].id}::uuid,${x.fromWalletId}::uuid,${transferCents},${transferDay}),(${owner.id},${inTitle[0].id}::uuid,${x.toWalletId}::uuid,${transferCents},${transferDay})`;
    return ok({ saved: true }, 201);
  }

  if (x.action === "transfer") {
    if (!uuid(x.fromWalletId) || !uuid(x.toWalletId) || x.fromWalletId === x.toWalletId) {
      return fail("Selecione contas de origem e destino diferentes.");
    }
    const transferCents = amount(x.amount, false, false);
    const transferDay = day(x.transferredOn) ? x.transferredOn : brDay();
    const isSettled = x.settled !== false && transferDay <= brDay();
    const settledCents = isSettled ? transferCents : 0;

    const wallets = await sql`
      SELECT id, name FROM public.kc_wallets
      WHERE user_id=${owner.id} AND id IN (${x.fromWalletId}::uuid, ${x.toWalletId}::uuid) AND archived_at IS NULL
    `;
    if (wallets.length !== 2) return fail("Contas não encontradas ou arquivadas.", 404);

    const fromWallet = wallets.find((w) => w.id === x.fromWalletId);
    const toWallet = wallets.find((w) => w.id === x.toWalletId);

    const descRaw = textValue(x.description, 140);
    const outDesc = descRaw || `Transferência para ${toWallet.name}`;
    const inDesc = descRaw || `Transferência de ${fromWallet.name}`;

    const transferId = crypto.randomUUID();

    const outTitle = await sql`
      INSERT INTO public.kc_titles(
        user_id, wallet_id, description, direction, category,
        amount_cents, settled_cents, due_on, recurrence,
        entry_kind, transfer_id
      ) VALUES (
        ${owner.id}, ${x.fromWalletId}::uuid, ${outDesc}, 'expense', 'Transferência',
        ${transferCents}, ${settledCents}, ${transferDay}::date, 'single',
        'transfer', ${transferId}::uuid
      ) RETURNING id
    `;

    const inTitle = await sql`
      INSERT INTO public.kc_titles(
        user_id, wallet_id, description, direction, category,
        amount_cents, settled_cents, due_on, recurrence,
        entry_kind, transfer_id
      ) VALUES (
        ${owner.id}, ${x.toWalletId}::uuid, ${inDesc}, 'income', 'Transferência',
        ${transferCents}, ${settledCents}, ${transferDay}::date, 'single',
        'transfer', ${transferId}::uuid
      ) RETURNING id
    `;

    if (isSettled) {
      await sql`
        INSERT INTO public.kc_settlements(user_id, title_id, wallet_id, amount_cents, settled_on, idempotency_key)
        VALUES
          (${owner.id}, ${outTitle[0].id}::uuid, ${x.fromWalletId}::uuid, ${transferCents}, ${transferDay}::date, ${crypto.randomUUID()}::uuid),
          (${owner.id}, ${inTitle[0].id}::uuid, ${x.toWalletId}::uuid, ${transferCents}, ${transferDay}::date, ${crypto.randomUUID()}::uuid)
      `;
    }

    return ok({
      saved: true,
      transferId,
      outTitleId: outTitle[0]?.id,
      inTitleId: inTitle[0]?.id,
      isSettled
    }, 201);
  }

  if (x.action === "materialize") {
    const occ = decodeOccurrenceId(x.occurrenceId);
    if (!occ) return fail("Ocorrência mensal inválida.");
    const rule = await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${occ.ruleId}::uuid LIMIT 1`;
    if (!rule.length) return fail("Recorrência não encontrada.", 404);
    const start = rule[0].starts_on;
    const index = (Number(occ.ym.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(occ.ym.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
    if (!Number.isInteger(index) || index < 1) return fail("Ocorrência inválida.");
    const result = await sql`SELECT public.kc_materialize_recurring_occurrence(${owner.id},${occ.ruleId}::uuid,${index}) AS id`;
    return ok({ saved: true, id: result[0]?.id });
  }

  if (x.action === "title") {
    const description = textValue(x.description, 140);
    const category = textValue(x.category, 70);
    const hasCard = x.direction === "expense" && uuid(x.creditCardId);
    let card = null;
    let effectiveWalletId = x.walletId;
    let effectiveDueOn = x.dueOn;
    const occurredOn = x.occurredOn && day(x.occurredOn) ? String(x.occurredOn) : day(x.dueOn) ? String(x.dueOn) : brDay();

    if (hasCard) {
      const cRows = await sql`SELECT id,name,closing_day,due_day,default_wallet_id FROM public.kc_credit_cards WHERE id=${x.creditCardId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
      if (!cRows.length) return fail("Cartão de crédito não encontrado.", 404);
      card = cRows[0];
      const cycle = computeInvoiceCycleForPurchase({ purchaseDate: occurredOn, closingDay: card.closing_day, dueDay: card.due_day });
      effectiveDueOn = cycle.dueDate;
      if (!uuid(effectiveWalletId)) {
        effectiveWalletId = card.default_wallet_id || (await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND archived_at IS NULL ORDER BY created_at LIMIT 1`)[0]?.id;
      }
    }

    if (!description || !category || !day(effectiveDueOn) || !["income", "expense"].includes(x.direction) || !uuid(effectiveWalletId)) {
      return fail("Descrição, data, tipo, categoria ou conta inválidos.");
    }
    const w = await sql`SELECT id FROM public.kc_wallets WHERE id=${effectiveWalletId}::uuid AND user_id=${owner.id}`;
    if (!w.length) return fail("Conta não encontrada.", 404);
    let root = await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL AND name=${category} LIMIT 1`;
    if (!root.length && allowedRoot(x.direction, category)) {
      await seedDefaultCategories(owner.id);
      root = await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL AND name=${category} LIMIT 1`;
    }
    if (!root.length) return fail("Selecione uma categoria cadastrada.");
    const categoryId = root[0].id;
    const subcategory = x.subcategory ? textValue(x.subcategory, 70) : null;
    if (x.subcategory && !subcategory) return fail("Subcategoria inválida.");
    let subcategoryId = null;
    if (subcategory) {
      const subs = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id=${categoryId}::uuid LIMIT 1`;
      if (!subs.length) return fail("Selecione uma subcategoria já cadastrada.");
      subcategoryId = subs[0].id;
    }
    const base = amount(x.amount);
    const mode = ["single", "installments", "monthly"].includes(x.mode) ? x.mode : "single";
    if (mode === "monthly") {
      if (effectiveDueOn > "2099-12-31") return fail("Recorrência só é permitida até 2099.");
      const end = x.endsOn ? String(x.endsOn) : null;
      if (end && (!day(end) || end < effectiveDueOn || end > "2099-12-31")) return fail("Data final da recorrência inválida.");
      const rule = await sql`INSERT INTO public.kc_recurring_rules(user_id,wallet_id,direction,description,category,subcategory,category_id,subcategory_id,amount_cents,starts_on,ends_on)
       VALUES(${owner.id},${effectiveWalletId}::uuid,${x.direction},${description},${category},${subcategory},${categoryId}::uuid,${subcategoryId}::uuid,${base},${effectiveDueOn}::date,${end}::date)
       RETURNING id`;
      return ok({ saved: true, recurringRuleId: rule[0]?.id, createdOccurrences: 0 }, 201);
    }
    if (!day(occurredOn)) return fail("Data da compra/competência inválida.");
    const settlementState = card ? "pending" : x.settlementState === "paid" ? "paid" : "pending";
    const settledOn = settlementState === "paid" ? String(x.settledOn || occurredOn) : null;
    if (settlementState === "paid" && !validSettlementDay(settledOn, brDay())) {
      return fail("A baixa realizada não pode ter uma data futura.");
    }
    const count = mode === "single" ? 1 : Number(x.count);
    if (!Number.isInteger(count) || count < 1 || count > 60) return fail("Quantidade de parcelas inválida.");
    const start = mode === "installments" ? Number(x.startIndex || 1) : 1;
    if (!Number.isInteger(start) || start < 1 || start > count) return fail("Parcela inicial inválida.");
    const perMode = x.valueMode === "installment" ? "installment" : "total";
    const idempotencyKey = uuid(x.idempotencyKey) ? x.idempotencyKey : crypto.randomUUID();
    const rows = await sql`SELECT public.kc_create_financial_event(
     ${owner.id},${effectiveWalletId}::uuid,${x.direction},${description},
     ${categoryId}::uuid,${subcategoryId}::uuid,${category},${subcategory},
     ${base},${occurredOn}::date,${effectiveDueOn}::date,${mode},${count},${start},${perMode},
     ${settlementState},${settledOn}::date,${idempotencyKey}::uuid
    ) AS info`;
    const info = rows[0]?.info || {};
    const eventId = info.event_id || info.economic_event_id;
    if (card && uuid(eventId)) {
      await sql`UPDATE public.kc_titles SET credit_card_id=${card.id}::uuid, invoice_month=to_char(due_on,'YYYY-MM') WHERE user_id=${owner.id} AND economic_event_id=${eventId}::uuid`;
    }
    let reconciliation = null;
    if (x.direction === "expense" && uuid(x.spendingPlanId) && uuid(eventId)) {
      const recKey = uuid(x.reconcileIdempotencyKey) ? x.reconcileIdempotencyKey : crypto.randomUUID();
      const recRows = await sql`SELECT public.kc_apply_event_to_spending_plan(${owner.id},${x.spendingPlanId}::uuid,${eventId}::uuid,NULL,${x.closeSpendingPlan !== false},${recKey}::uuid) AS info`;
      reconciliation = recRows[0]?.info || null;
    }
    return ok({ saved: true, ...info, reconciliation, creditCardId: card?.id || null, invoiceDueOn: card ? effectiveDueOn : null }, 201);
  }

  if (x.action === "spending_plan") {
    const description = textValue(x.description, 140);
    const category = textValue(x.category, 70);
    if (!description || !category) return fail("Informe descrição e categoria para a previsão.");
    const estimatedCents = amount(x.amount);
    let root = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND parent_id IS NULL AND name=${category} LIMIT 1`;
    if (!root.length && allowedRoot("expense", category)) {
      await seedDefaultCategories(owner.id);
      root = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND parent_id IS NULL AND name=${category} LIMIT 1`;
    }
    if (!root.length) return fail("Selecione uma categoria de despesa cadastrada.");
    const categoryId = root[0].id;
    let subcategoryId = null;
    if (x.subcategory) {
      const subName = textValue(x.subcategory, 70);
      const sub = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction='expense' AND name=${subName} AND parent_id=${categoryId}::uuid LIMIT 1`;
      if (sub.length) subcategoryId = sub[0].id;
    }
    const plannedFor = x.plannedFor && day(x.plannedFor) ? x.plannedFor : null;
    const plannedMonth = plannedFor ? plannedFor.slice(0, 7) : isValidMonth(x.plannedMonth) ? x.plannedMonth : brDay().slice(0, 7);
    const expectedPaymentOn = x.expectedPaymentOn && day(x.expectedPaymentOn) ? x.expectedPaymentOn : null;
    const idempotencyKey = uuid(x.idempotencyKey) ? x.idempotencyKey : crypto.randomUUID();
    const rows = await sql`SELECT public.kc_create_spending_plan(${owner.id},${description},${categoryId}::uuid,${subcategoryId}::uuid,${estimatedCents},${plannedFor}::date,${plannedMonth},${expectedPaymentOn}::date,${idempotencyKey}::uuid) AS info`;
    return ok({ saved: true, ...rows[0]?.info }, 201);
  }

  if (x.action === "reconcile_plan") {
    if (!uuid(x.planId) || !uuid(x.economicEventId)) return fail("Plano ou despesa inválidos para conciliação.");
    const allocatedCents =
      x.allocatedAmount !== undefined && x.allocatedAmount !== null && x.allocatedAmount !== ""
        ? amount(x.allocatedAmount)
        : null;
    const idempotencyKey = uuid(x.idempotencyKey) ? x.idempotencyKey : crypto.randomUUID();
    const rows = await sql`SELECT public.kc_apply_event_to_spending_plan(${owner.id},${x.planId}::uuid,${x.economicEventId}::uuid,${allocatedCents},${x.closePlan !== false},${idempotencyKey}::uuid) AS info`;
    return ok({ saved: true, ...rows[0]?.info }, 201);
  }

  if (x.action === "asset" || x.action === "liability") {
    const label = textValue(x.label, 120);
    const value = amount(x.amount, true);
    if (!label) return fail("Descrição inválida.");
    if (x.action === "asset") {
      const assetKind = ["property", "investment", "reserve", "other"].includes(x.assetKind) ? x.assetKind : "other";
      const liquidityKind = ["immediate", "d_plus", "locked"].includes(x.liquidityKind) ? x.liquidityKind : "locked";
      const linkedWalletId = uuid(x.linkedWalletId) ? x.linkedWalletId : null;
      if (linkedWalletId) {
        const w = await sql`SELECT id FROM public.kc_wallets WHERE id=${linkedWalletId}::uuid AND user_id=${owner.id} LIMIT 1`;
        if (!w.length) return fail("Conta vinculada não encontrada.", 404);
      }
      await sql`INSERT INTO public.kc_assets(user_id,label,value_cents,valued_on,asset_kind,liquidity_kind,linked_wallet_id) VALUES(${owner.id},${label},${value},current_date,${assetKind},${liquidityKind},${linkedWalletId}::uuid)`;
    } else {
      const debtKind = ["loan", "financing", "credit_card", "other"].includes(x.debtKind) ? x.debtKind : "loan";
      const interestRateBps = Number.isInteger(x.interestRateBps) && x.interestRateBps >= 0 ? x.interestRateBps : null;
      const monthlyInstallmentCents =
        x.monthlyInstallment !== undefined && x.monthlyInstallment !== null && x.monthlyInstallment !== ""
          ? amount(x.monthlyInstallment, true)
          : null;
      const remainingInstallments = Number.isInteger(x.remainingInstallments) && x.remainingInstallments >= 0 ? x.remainingInstallments : null;
      const maturityOn = x.maturityOn && day(x.maturityOn) ? x.maturityOn : null;
      await sql`INSERT INTO public.kc_liabilities(user_id,label,principal_cents,valued_on,debt_kind,interest_rate_bps,monthly_installment_cents,remaining_installments,maturity_on) VALUES(${owner.id},${label},${value},current_date,${debtKind},${interestRateBps},${monthlyInstallmentCents},${remainingInstallments},${maturityOn}::date)`;
    }
    return ok({ saved: true }, 201);
  }

  if (x.action === "debt_payment") {
    if (!uuid(x.liabilityId) || !day(x.paidOn)) return fail("Dívida ou data inválida.");
    if (!validSettlementDay(x.paidOn, brDay())) return fail("Pagamento realizado não pode ter data futura.");
    const principalCents = amount(x.principal ?? "0", true);
    const interestFeeCents = amount(x.interestFee ?? "0", true);
    if (principalCents === 0 && interestFeeCents === 0) return fail("Informe o valor amortizado ou dos juros.");
    const walletId = uuid(x.walletId) ? x.walletId : null;
    const idempotencyKey = uuid(x.idempotencyKey) ? x.idempotencyKey : crypto.randomUUID();
    const rows = await sql`SELECT public.kc_record_debt_payment(${owner.id},${x.liabilityId}::uuid,${walletId}::uuid,${principalCents},${interestFeeCents},${x.paidOn}::date,${idempotencyKey}::uuid) AS info`;
    return ok({ saved: true, ...rows[0]?.info }, 201);
  }

  if (x.action === "reserve_caixinha") {
    if (!uuid(x.goalId) || !uuid(x.fromWalletId)) {
      return fail("Selecione a conta bancária e a caixinha.");
    }
    const transferCents = amount(x.amount, false, false);
    const transferDay = day(x.transferredOn) ? x.transferredOn : brDay();
    if (transferDay > brDay()) return fail("A data da reserva não pode ser futura.");
    const direction = x.direction === "withdraw" ? "withdraw" : "deposit";

    const [goalRows, bankRows] = await Promise.all([
      sql`SELECT id,title,wallet_id,parent_wallet_id,caixinha_purpose FROM public.kc_financial_goals WHERE id=${x.goalId}::uuid AND user_id=${owner.id} AND category='capital_goal' AND status<>'cancelled' LIMIT 1`,
      sql`SELECT id,name FROM public.kc_wallets WHERE id=${x.fromWalletId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`,
    ]);
    if (!goalRows.length) return fail("Caixinha não encontrada.", 404);
    if (!bankRows.length) return fail("Conta bancária não encontrada ou arquivada.", 404);

    const goal = goalRows[0];
    const bankWallet = bankRows[0];
    let caixinhaWalletId = goal.wallet_id;

    if (!caixinhaWalletId) {
      const purpose = ["reserve", "goal", "capital"].includes(goal.caixinha_purpose) ? goal.caixinha_purpose : "goal";
      const wKind = purpose === "reserve" ? "reserve" : "investment";
      const lKind = purpose === "reserve" ? "immediate" : "d_plus";
      const isRes = purpose === "reserve";
      const createdW = await sql`
        INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${String(goal.title).slice(0, 90)},0,now() - interval '1 second',${wKind},${lKind},${isRes},${bankWallet.id}::uuid,${purpose})
        RETURNING id
      `;
      caixinhaWalletId = createdW[0]?.id;
      await sql`
        UPDATE public.kc_financial_goals
        SET wallet_id=${caixinhaWalletId}::uuid, parent_wallet_id=COALESCE(parent_wallet_id, ${bankWallet.id}::uuid)
        WHERE id=${goal.id}::uuid AND user_id=${owner.id}
      `;
    }

    if (direction === "withdraw" && caixinhaWalletId) {
      const balRows = await sql`
        SELECT
          COALESCE(w.opening_balance_cents, 0)::text AS opening_cents,
          COALESCE((
            SELECT SUM(CASE WHEN t.direction = 'income' THEN s.amount_cents ELSE -s.amount_cents END)
            FROM public.kc_settlements s
            JOIN public.kc_titles t ON t.id = s.title_id AND t.user_id = s.user_id
            WHERE s.user_id = ${owner.id}
              AND s.wallet_id = ${caixinhaWalletId}::uuid
              AND s.reversed_at IS NULL
              AND (w.opening_at IS NULL OR s.created_at >= w.opening_at)
          ), 0)::text AS posted_cents
        FROM public.kc_wallets w
        WHERE w.id = ${caixinhaWalletId}::uuid AND w.user_id = ${owner.id}
        LIMIT 1
      `;
      const caixinhaBalanceCents = balRows.length
        ? Number(balRows[0].opening_cents || 0) + Number(balRows[0].posted_cents || 0)
        : 0;
      if (transferCents > caixinhaBalanceCents) {
        return fail("Saldo insuficiente nesta caixinha para realizar o resgate.", 400);
      }
    }

    const sourceId = direction === "withdraw" ? caixinhaWalletId : bankWallet.id;
    const destId = direction === "withdraw" ? bankWallet.id : caixinhaWalletId;
    const outDesc = direction === "withdraw" ? `Resgate da caixinha: ${goal.title}`.slice(0, 140) : `Reservado na caixinha: ${goal.title}`.slice(0, 140);
    const inDesc = direction === "withdraw" ? `Resgate de ${goal.title}`.slice(0, 140) : `Reserva de ${bankWallet.name}`.slice(0, 140);
    const transferId = crypto.randomUUID();

    const outTitle = await sql`
      INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,transfer_id)
      VALUES(${owner.id},${sourceId}::uuid,${outDesc},'expense','Caixinhas',${transferCents},${transferCents},${transferDay}::date,'single','reserve_transfer',${transferId}::uuid)
      RETURNING id
    `;
    const inTitle = await sql`
      INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,transfer_id)
      VALUES(${owner.id},${destId}::uuid,${inDesc},'income','Caixinhas',${transferCents},${transferCents},${transferDay}::date,'single','reserve_transfer',${transferId}::uuid)
      RETURNING id
    `;
    await sql`
      INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on,idempotency_key)
      VALUES
        (${owner.id},${outTitle[0].id}::uuid,${sourceId}::uuid,${transferCents},${transferDay}::date,${crypto.randomUUID()}::uuid),
        (${owner.id},${inTitle[0].id}::uuid,${destId}::uuid,${transferCents},${transferDay}::date,${crypto.randomUUID()}::uuid)
    `;
    return ok({ saved: true, transferId, caixinhaWalletId }, 201);
  }

  if (x.action === "goal") {
    const title = textValue(x.title, 120);
    if (!title) return fail("Informe o nome do objetivo ou compra.");
    const targetCents = amount(x.target);
    const downPaymentCents = x.downPayment !== undefined && x.downPayment !== null && x.downPayment !== "" ? amount(x.downPayment, true) : 0;
    if (downPaymentCents > targetCents) return fail("Entrada não pode superar o valor total.");
    const installmentCount = Number(x.installmentCount || 1);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) return fail("Quantidade de parcelas inválida.");
    const interestBps = Math.min(10000, Math.max(0, Math.round(Number(x.interestBps || 0))));
    const installmentCents = x.installmentAmount
      ? amount(x.installmentAmount, true)
      : computePriceInstallmentCents({ financedCents: targetCents - downPaymentCents, installmentCount, monthlyInterestBps: interestBps });
    const desiredOn = x.desiredOn && day(x.desiredOn) ? x.desiredOn : null;
    const category = textValue(x.category, 60) || null;

    if (category === "capital_goal") {
      const purpose = ["reserve", "goal", "capital"].includes(x.caixinhaPurpose) ? x.caixinhaPurpose : "goal";
      let parentWalletId = uuid(x.parentWalletId) ? x.parentWalletId : null;
      if (parentWalletId) {
        const pw = await sql`SELECT id,name FROM public.kc_wallets WHERE id=${parentWalletId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
        if (!pw.length) return fail("Conta bancária vinculada não encontrada ou arquivada.", 404);
      } else {
        const checkingWallets = await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND archived_at IS NULL AND parent_wallet_id IS NULL AND is_reserved=false AND wallet_kind NOT IN ('reserve','investment') ORDER BY created_at LIMIT 1`;
        if (checkingWallets.length) return fail("Selecione o banco ou conta onde esta caixinha ficará.");
      }

      const wKind = purpose === "reserve" ? "reserve" : "investment";
      const lKind = purpose === "reserve" ? "immediate" : "d_plus";
      const isRes = purpose === "reserve";
      const createdWallet = await sql`
        INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${title.slice(0, 90)},0,now() - interval '1 second',${wKind},${lKind},${isRes},${parentWalletId}::uuid,${purpose})
        RETURNING id
      `;
      const caixinhaWalletId = createdWallet[0]?.id;
      const rows = await sql`
        INSERT INTO public.kc_financial_goals(user_id,title,category,target_cents,down_payment_cents,installment_count,installment_cents,interest_bps,desired_on,status,wallet_id,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${title},${category},${targetCents},${downPaymentCents},${installmentCount},${installmentCents},${interestBps},${desiredOn}::date,'simulated',${caixinhaWalletId}::uuid,${parentWalletId}::uuid,${purpose})
        RETURNING id
      `;
      const goalId = rows[0]?.id;

      const initialCents = x.initialAmount !== undefined && x.initialAmount !== null && String(x.initialAmount).trim() !== ""
        ? amount(x.initialAmount, true, false)
        : 0;
      if (initialCents > 0 && parentWalletId && caixinhaWalletId) {
        const todayStr = brDay();
        const transferId = crypto.randomUUID();
        const outTitle = await sql`
          INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,transfer_id)
          VALUES(${owner.id},${parentWalletId}::uuid,${`Reserva inicial: ${title}`.slice(0, 140)},'expense','Caixinhas',${initialCents},${initialCents},${todayStr}::date,'single','reserve_transfer',${transferId}::uuid)
          RETURNING id
        `;
        const inTitle = await sql`
          INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,transfer_id)
          VALUES(${owner.id},${caixinhaWalletId}::uuid,${`Reserva inicial: ${title}`.slice(0, 140)},'income','Caixinhas',${initialCents},${initialCents},${todayStr}::date,'single','reserve_transfer',${transferId}::uuid)
          RETURNING id
        `;
        await sql`
          INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on,idempotency_key)
          VALUES
            (${owner.id},${outTitle[0].id}::uuid,${parentWalletId}::uuid,${initialCents},${todayStr}::date,${crypto.randomUUID()}::uuid),
            (${owner.id},${inTitle[0].id}::uuid,${caixinhaWalletId}::uuid,${initialCents},${todayStr}::date,${crypto.randomUUID()}::uuid)
        `;
      }
      return ok({ saved: true, id: goalId, walletId: caixinhaWalletId }, 201);
    }

    let sourceGoalId = uuid(x.sourceGoalId) ? x.sourceGoalId : null;
    if (sourceGoalId) {
      const sg = await sql`SELECT id FROM public.kc_financial_goals WHERE id=${sourceGoalId}::uuid AND user_id=${owner.id} AND category='capital_goal' AND status<>'cancelled' LIMIT 1`;
      if (!sg.length) return fail("Caixinha selecionada para entrada não foi encontrada.", 404);
    } else if (x.createLinkedCaixinha && uuid(x.parentWalletId)) {
      const pw = await sql`SELECT id FROM public.kc_wallets WHERE id=${x.parentWalletId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
      if (!pw.length) return fail("Conta bancária para a nova caixinha não encontrada.", 404);
      const caixinhaTargetCents = downPaymentCents > 0 ? downPaymentCents : targetCents;
      const caixinhaTitle = (downPaymentCents > 0 ? `Entrada: ${title}` : `Caixinha: ${title}`).slice(0, 120);
      const cw = await sql`
        INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${caixinhaTitle.slice(0, 90)},0,now() - interval '1 second','investment','d_plus',false,${x.parentWalletId}::uuid,'goal')
        RETURNING id
      `;
      const cg = await sql`
        INSERT INTO public.kc_financial_goals(user_id,title,category,target_cents,down_payment_cents,installment_count,installment_cents,interest_bps,desired_on,status,wallet_id,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${caixinhaTitle},'capital_goal',${caixinhaTargetCents},0,1,0,0,${desiredOn}::date,'simulated',${cw[0].id}::uuid,${x.parentWalletId}::uuid,'goal')
        RETURNING id
      `;
      sourceGoalId = cg[0]?.id || null;
    }

    const paymentMethod = x.paymentMethod === "credit_card" && uuid(x.creditCardId) ? "credit_card" : "standard";
    const creditCardId = paymentMethod === "credit_card" ? x.creditCardId : null;
    if (creditCardId) {
      const cc = await sql`SELECT id FROM public.kc_credit_cards WHERE id=${creditCardId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
      if (!cc.length) return fail("Cartão de crédito selecionado não foi encontrado.", 404);
    }

    const planType = ["purchase", "trip", "shopping_list"].includes(x.planType) ? x.planType : "purchase";
    const paymentStructure = ["upfront", "installments", "hybrid"].includes(x.paymentStructure)
      ? x.paymentStructure
      : downPaymentCents > 0 && installmentCount > 1
        ? "hybrid"
        : installmentCount > 1
          ? "installments"
          : "upfront";
    const budgetCategoryId = uuid(x.budgetCategoryId) ? x.budgetCategoryId : null;
    const selectedWalletId = uuid(x.selectedWalletId) ? x.selectedWalletId : null;
    const quotesSanitized = sanitizePlanningQuotes(x.quotes, amount, uuid);
    const quotesJsonStr = JSON.stringify(quotesSanitized);

    const rows = await sql`
      INSERT INTO public.kc_financial_goals(
        user_id,title,category,target_cents,down_payment_cents,installment_count,installment_cents,
        interest_bps,desired_on,status,source_goal_id,payment_method,credit_card_id,
        plan_type,payment_structure,quotes_json,budget_category_id,selected_wallet_id
      )
      VALUES(
        ${owner.id},${title},${category},${targetCents},${downPaymentCents},${installmentCount},${installmentCents},
        ${interestBps},${desiredOn}::date,'simulated',${sourceGoalId}::uuid,${paymentMethod},${creditCardId}::uuid,
        ${planType},${paymentStructure},${quotesJsonStr}::jsonb,${budgetCategoryId}::uuid,${selectedWalletId}::uuid
      )
      RETURNING id
    `;
    return ok({ saved: true, id: rows[0]?.id, sourceGoalId, paymentMethod, creditCardId, planType, paymentStructure }, 201);
  }

  if (x.action === "save_workspace_prefs") {
    const desktopColumns = sanitizeWorkspaceColumns(x.desktopColumns);
    const columnSettings = sanitizeColumnSettings(x.columnSettings);
    try {
      await sql`INSERT INTO public.kc_user_preferences(user_id,desktop_columns,column_settings,updated_at)
        VALUES(${owner.id},${JSON.stringify(desktopColumns)}::jsonb,${JSON.stringify(columnSettings)}::jsonb,now())
        ON CONFLICT (user_id) DO UPDATE SET desktop_columns=EXCLUDED.desktop_columns, column_settings=EXCLUDED.column_settings, updated_at=now()`;
    } catch (e) {
      if (e?.code !== "42P01") throw e;
    }
    return ok({ saved: true, desktopColumns, columnSettings });
  }

  return fail("Ação não reconhecida.");
}

export async function executePortfolioPatch(ownerId, x) {
  const owner = { id: ownerId };
  const day = isDay;
  const uuid = isUuid;
  const amount = parseAmountCents;

  if (x.action === "settle") {
    if (!uuid(x.titleId) || !uuid(x.idempotency) || !day(x.settledOn)) return fail("Dados de baixa inválidos.");
    if (!validSettlementDay(x.settledOn, brDay())) return fail("A baixa realizada não pode ter uma data futura.");
    const value = amount(x.amount);
    const rows = await sql`SELECT public.kc_settle_title(${owner.id},${x.titleId}::uuid,${value},${x.settledOn}::date,${x.idempotency}::uuid) AS id`;
    const tRows = await sql`SELECT transfer_id,entry_kind FROM public.kc_titles WHERE user_id=${owner.id} AND id=${x.titleId}::uuid LIMIT 1`;
    if (tRows.length && tRows[0].transfer_id && ["transfer", "reserve_transfer"].includes(tRows[0].entry_kind)) {
      const counterpart = await sql`
        SELECT id FROM public.kc_titles
        WHERE user_id=${owner.id} AND transfer_id=${tRows[0].transfer_id}::uuid AND id<>${x.titleId}::uuid AND cancelled_at IS NULL LIMIT 1
      `;
      if (counterpart.length) {
        await sql`SELECT public.kc_settle_title(${owner.id},${counterpart[0].id}::uuid,${value},${x.settledOn}::date,${crypto.randomUUID()}::uuid)`;
      }
    }
    return ok({ saved: true, id: rows[0]?.id });
  }

  if (x.action === "reverse") {
    if (!uuid(x.settlementId)) return fail("Baixa inválida.");
    const sRows = await sql`
      SELECT s.title_id, t.transfer_id, t.entry_kind, s.amount_cents
      FROM public.kc_settlements s
      JOIN public.kc_titles t ON t.id = s.title_id AND t.user_id = s.user_id
      WHERE s.id=${x.settlementId}::uuid AND s.user_id=${owner.id} LIMIT 1
    `;
    const reversal = await sql`SELECT public.kc_reverse_settlement(${owner.id},${x.settlementId}::uuid,'Reversão solicitada pelo titular') AS id`;
    if (sRows.length && sRows[0].transfer_id && ["transfer", "reserve_transfer"].includes(sRows[0].entry_kind)) {
      const counterpartS = await sql`
        SELECT s2.id
        FROM public.kc_settlements s2
        JOIN public.kc_titles t2 ON t2.id = s2.title_id AND t2.user_id = s2.user_id
        WHERE t2.user_id=${owner.id}
          AND t2.transfer_id=${sRows[0].transfer_id}::uuid
          AND t2.id<>${sRows[0].title_id}::uuid
          AND s2.reversed_at IS NULL
          AND s2.amount_cents=${sRows[0].amount_cents}
        LIMIT 1
      `;
      if (counterpartS.length) {
        await sql`SELECT public.kc_reverse_settlement(${owner.id},${counterpartS[0].id}::uuid,'Reversão solicitada pelo titular')`;
      }
    }
    return ok({ saved: true, reversedId: reversal[0]?.id });
  }

  if (x.action === "stop_recurring") {
    if (!uuid(x.ruleId) || !day(x.startsOn)) return fail("Regra ou data inválida.");
    const rule = await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${x.ruleId}::uuid LIMIT 1`;
    if (!rule.length) return fail("Regra não encontrada.", 404);
    const start = rule[0].starts_on;
    const index = (Number(x.startsOn.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(x.startsOn.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
    if (index < 1) return fail("Data anterior à recorrência.");
    const result = await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${x.ruleId}::uuid,${index},'future') AS info`;
    return ok({ saved: true, ...result[0]?.info });
  }

  if (x.action === "edit") {
    if (!uuid(x.titleId) || !uuid(x.walletId) || !day(x.dueOn) || !["income", "expense"].includes(x.direction)) {
      return fail("Título ou dados inválidos.");
    }
    const description = textValue(x.description, 140);
    const category = textValue(x.category, 70);
    const subcategory = x.subcategory ? textValue(x.subcategory, 70) : null;
    if (!description || !category || (x.subcategory && !subcategory)) return fail("Descrição ou categoria inválida.");
    const account = await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND id=${x.walletId}::uuid LIMIT 1`;
    if (!account.length) return fail("Conta não encontrada.", 404);
    let root = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL LIMIT 1`;
    if (!root.length && allowedRoot(x.direction, category)) {
      await seedDefaultCategories(owner.id);
      root = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${category} AND parent_id IS NULL LIMIT 1`;
    }
    if (!root.length) {
      const userRoots = await sql`SELECT id, name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND parent_id IS NULL LIMIT 300`;
      const matched = userRoots.find((c) => normalizeCategoryName(c.name) === normalizeCategoryName(category));
      if (matched) root = [matched];
    }
    if (!root.length) return fail("Categoria inválida.");
    const categoryId = root[0].id;
    let subcategoryId = null;
    if (subcategory) {
      const sub = await sql`SELECT id FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${x.direction} AND name=${subcategory} AND parent_id=${categoryId}::uuid LIMIT 1`;
      if (!sub.length) return fail("Subcategoria inválida.");
      subcategoryId = sub[0].id;
    }
    const value = amount(x.amount);
    const occurredOn = x.occurredOn && day(x.occurredOn) ? x.occurredOn : null;
    await sql`SELECT public.kc_edit_title_and_event(${owner.id},${x.titleId}::uuid,${x.walletId}::uuid,${x.direction},${description},${categoryId}::uuid,${subcategoryId}::uuid,${category},${subcategory},${value},${x.dueOn}::date,${occurredOn}::date)`;
    return ok({ saved: true, scope: "this-occurrence" });
  }

  if (x.action === "cancel_scope") {
    if (!validScope(x.scope)) return fail("Escolha uma opção de exclusão válida.");
    const virtual = decodeOccurrenceId(x.titleId);
    if (virtual) {
      const rule = await sql`SELECT starts_on::text FROM public.kc_recurring_rules WHERE user_id=${owner.id} AND id=${virtual.ruleId}::uuid LIMIT 1`;
      if (!rule.length) return fail("Recorrência não encontrada.", 404);
      const index = (Number(virtual.ym.slice(0, 4)) - Number(rule[0].starts_on.slice(0, 4))) * 12 + Number(virtual.ym.slice(5, 7)) - Number(rule[0].starts_on.slice(5, 7)) + 1;
      if (!Number.isInteger(index) || index < 1) return fail("Ocorrência inválida.");
      const result = await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${virtual.ruleId}::uuid,${index},${x.scope}) AS info`;
      return ok({ saved: true, ...result[0]?.info });
    }
    if (!uuid(x.titleId)) return fail("Lançamento inválido.");
    const title = await sql`SELECT id,series_id,recurrence,installment_index,transfer_id,entry_kind FROM public.kc_titles WHERE id=${x.titleId}::uuid AND user_id=${owner.id} AND cancelled_at IS NULL LIMIT 1`;
    if (!title.length) return fail("Lançamento não encontrado.", 404);
    if (title[0].transfer_id && ["transfer", "reserve_transfer"].includes(title[0].entry_kind)) {
      const pair = await sql`SELECT id FROM public.kc_titles WHERE user_id=${owner.id} AND transfer_id=${title[0].transfer_id}::uuid AND cancelled_at IS NULL`;
      let info = null;
      for (const p of pair) {
        const res = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${p.id}::uuid,'only') AS info`;
        await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${p.id}::uuid)`;
        if (!info) info = res[0]?.info;
      }
      return ok({ saved: true, cancelled_titles: pair.length, ...info });
    }
    if (title[0].transfer_id && title[0].entry_kind === "loan_out") {
      const result = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,${x.scope}) AS info`;
      await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
      if (x.scope === "all" || Number(title[0].installment_total || 1) <= 1) {
        const openRepays = await sql`SELECT id FROM public.kc_titles WHERE user_id=${owner.id} AND transfer_id=${title[0].transfer_id}::uuid AND id<>${x.titleId}::uuid AND entry_kind='loan_repayment' AND settled_cents=0 AND cancelled_at IS NULL`;
        for (const r of openRepays) {
          await sql`SELECT public.kc_cancel_title_scope(${owner.id},${r.id}::uuid,'only')`;
        }
      }
      return ok({ saved: true, ...result[0]?.info });
    }
    if (title[0].series_id && title[0].recurrence === "monthly") {
      const rule = await sql`SELECT id FROM public.kc_recurring_rules WHERE id=${title[0].series_id}::uuid AND user_id=${owner.id} LIMIT 1`;
      if (rule.length) {
        const result = await sql`SELECT public.kc_cancel_recurring_scope(${owner.id},${rule[0].id}::uuid,${title[0].installment_index},${x.scope}) AS info`;
        return ok({ saved: true, ...result[0]?.info });
      }
    }
    const result = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,${x.scope}) AS info`;
    await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
    return ok({ saved: true, ...result[0]?.info });
  }

  if (x.action === "rename_category") {
    if (!uuid(x.categoryId)) return fail("Categoria inválida.");
    const name = textValue(x.name, 80);
    if (!name) return fail("Informe o novo nome da categoria.");
    const cat = await sql`SELECT id,direction,parent_id FROM public.kc_categories WHERE id=${x.categoryId}::uuid AND user_id=${owner.id} LIMIT 1`;
    if (!cat.length) return fail("Categoria não encontrada.", 404);
    const siblings = await sql`SELECT id,name FROM public.kc_categories WHERE user_id=${owner.id} AND direction=${cat[0].direction} AND id<>${x.categoryId}::uuid LIMIT 300`;
    if (siblings.some((s) => normalizeCategoryName(s.name) === normalizeCategoryName(name))) {
      return fail("Já existe uma categoria com esse nome.", 409);
    }
    await sql`UPDATE public.kc_categories SET name=${name} WHERE id=${x.categoryId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true });
  }

  if (x.action === "update_spending_plan") {
    if (!uuid(x.planId)) return fail("Plano inválido.");
    const existing = await sql`SELECT id,description,estimated_amount_cents,planned_for::text,planned_month,status FROM public.kc_spending_plans WHERE id=${x.planId}::uuid AND user_id=${owner.id} AND status<>'cancelled' LIMIT 1`;
    if (!existing.length) return fail("Plano não encontrado.", 404);
    const nextDesc = x.description !== undefined ? textValue(x.description, 140) : existing[0].description;
    if (!nextDesc) return fail("Descrição inválida.");
    const nextAmount = x.amount !== undefined && x.amount !== null && x.amount !== "" ? amount(x.amount) : Number(existing[0].estimated_amount_cents);
    const nextPlannedFor =
      x.plannedFor === null || x.plannedFor === ""
        ? null
        : x.plannedFor && day(x.plannedFor)
          ? x.plannedFor
          : existing[0].planned_for;
    const nextMonth = nextPlannedFor
      ? nextPlannedFor.slice(0, 7)
      : isValidMonth(x.plannedMonth)
        ? x.plannedMonth
        : existing[0].planned_month;
    const alloc = await sql`SELECT COALESCE(SUM(a.allocated_cents),0)::text AS total FROM public.kc_spending_plan_applications a JOIN public.kc_economic_events e ON e.id=a.economic_event_id AND e.user_id=a.user_id WHERE a.user_id=${owner.id} AND a.plan_id=${x.planId}::uuid AND e.cancelled_at IS NULL`;
    const allocated = Number(alloc[0]?.total || 0);
    const nextStatus = allocated >= nextAmount ? "fulfilled" : allocated > 0 ? "partially_fulfilled" : "planned";
    await sql`UPDATE public.kc_spending_plans SET description=${nextDesc},estimated_amount_cents=${nextAmount},planned_for=${nextPlannedFor}::date,planned_month=${nextMonth},status=${nextStatus},updated_at=now() WHERE id=${x.planId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true, status: nextStatus });
  }

  if (x.action === "cancel_spending_plan") {
    if (!uuid(x.planId)) return fail("Plano inválido.");
    await sql`UPDATE public.kc_spending_plans SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=${x.planId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true });
  }

  if (x.action === "update_goal") {
    if (!uuid(x.goalId)) return fail("Planejamento inválido.");
    const existingRows = await sql`SELECT id FROM public.kc_financial_goals WHERE id=${x.goalId}::uuid AND user_id=${owner.id} AND status<>'cancelled' LIMIT 1`;
    if (!existingRows.length) return fail("Planejamento não encontrado.", 404);
    const title = textValue(x.title, 120);
    if (!title) return fail("Informe o nome do planejamento.");
    const targetCents = amount(x.target);
    const downPaymentCents = x.downPayment !== undefined && x.downPayment !== null && x.downPayment !== "" ? amount(x.downPayment, true) : 0;
    if (downPaymentCents > targetCents) return fail("Entrada não pode superar o valor total.");
    const installmentCount = Number(x.installmentCount || 1);
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) return fail("Quantidade de parcelas inválida.");
    const interestBps = Math.min(10000, Math.max(0, Math.round(Number(x.interestBps || 0))));
    const installmentCents = x.installmentAmount
      ? amount(x.installmentAmount, true)
      : computePriceInstallmentCents({ financedCents: targetCents - downPaymentCents, installmentCount, monthlyInterestBps: interestBps });
    const desiredOn = x.desiredOn && day(x.desiredOn) ? x.desiredOn : null;
    let sourceGoalId = uuid(x.sourceGoalId) ? x.sourceGoalId : null;
    if (!sourceGoalId && x.createLinkedCaixinha && uuid(x.parentWalletId)) {
      const pw = await sql`SELECT id FROM public.kc_wallets WHERE id=${x.parentWalletId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
      if (!pw.length) return fail("Conta bancária para a nova caixinha não encontrada.", 404);
      const caixinhaTargetCents = downPaymentCents > 0 ? downPaymentCents : targetCents;
      const caixinhaTitle = (downPaymentCents > 0 ? `Entrada: ${title}` : `Caixinha: ${title}`).slice(0, 120);
      const cw = await sql`
        INSERT INTO public.kc_wallets(user_id,name,opening_balance_cents,opening_at,wallet_kind,liquidity_kind,is_reserved,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${caixinhaTitle.slice(0, 90)},0,now() - interval '1 second','investment','d_plus',false,${x.parentWalletId}::uuid,'goal')
        RETURNING id
      `;
      const cg = await sql`
        INSERT INTO public.kc_financial_goals(user_id,title,category,target_cents,down_payment_cents,installment_count,installment_cents,interest_bps,desired_on,status,wallet_id,parent_wallet_id,caixinha_purpose)
        VALUES(${owner.id},${caixinhaTitle},'capital_goal',${caixinhaTargetCents},0,1,0,0,${desiredOn}::date,'simulated',${cw[0].id}::uuid,${x.parentWalletId}::uuid,'goal')
        RETURNING id
      `;
      sourceGoalId = cg[0]?.id || null;
    }
    const paymentMethod = x.paymentMethod === "credit_card" && uuid(x.creditCardId) ? "credit_card" : "standard";
    const creditCardId = paymentMethod === "credit_card" ? x.creditCardId : null;
    const planType = ["purchase", "trip", "shopping_list"].includes(x.planType) ? x.planType : "purchase";
    const paymentStructure = ["upfront", "installments", "hybrid"].includes(x.paymentStructure)
      ? x.paymentStructure
      : downPaymentCents > 0 && installmentCount > 1
        ? "hybrid"
        : installmentCount > 1
          ? "installments"
          : "upfront";
    const budgetCategoryId = uuid(x.budgetCategoryId) ? x.budgetCategoryId : null;
    const selectedWalletId = uuid(x.selectedWalletId) ? x.selectedWalletId : null;
    const quotesSanitized = sanitizePlanningQuotes(x.quotes, amount, uuid);
    const quotesJsonStr = JSON.stringify(quotesSanitized);

    await sql`
      UPDATE public.kc_financial_goals
      SET title=${title},
          target_cents=${targetCents},
          down_payment_cents=${downPaymentCents},
          installment_count=${installmentCount},
          installment_cents=${installmentCents},
          interest_bps=${interestBps},
          desired_on=${desiredOn}::date,
          source_goal_id=${sourceGoalId}::uuid,
          payment_method=${paymentMethod},
          credit_card_id=${creditCardId}::uuid,
          plan_type=${planType},
          payment_structure=${paymentStructure},
          quotes_json=${quotesJsonStr}::jsonb,
          budget_category_id=${budgetCategoryId}::uuid,
          selected_wallet_id=${selectedWalletId}::uuid
      WHERE id=${x.goalId}::uuid AND user_id=${owner.id}
    `;
    return ok({ saved: true, id: x.goalId, sourceGoalId, paymentMethod, creditCardId, planType, paymentStructure });
  }

  if (x.action === "cancel_goal") {
    if (!uuid(x.goalId)) return fail("Objetivo inválido.");
    const gRows = await sql`SELECT id,category,wallet_id,parent_wallet_id FROM public.kc_financial_goals WHERE id=${x.goalId}::uuid AND user_id=${owner.id} AND status<>'cancelled' LIMIT 1`;
    if (gRows.length) {
      await sql`UPDATE public.kc_financial_goals SET source_goal_id=NULL WHERE user_id=${owner.id} AND source_goal_id=${x.goalId}::uuid`;
      await sql`UPDATE public.kc_financial_goals SET status='cancelled' WHERE id=${x.goalId}::uuid AND user_id=${owner.id}`;
      const g = gRows[0];
      if (g.wallet_id) {
        // Falha 5: Converte reserve_transfer da caixinha excluída para 'transfer' antes de migrar para a conta mãe
        await sql`
          UPDATE public.kc_titles
          SET entry_kind = 'transfer'
          WHERE user_id = ${owner.id}
            AND entry_kind = 'reserve_transfer'
            AND (
              wallet_id = ${g.wallet_id}::uuid
              OR transfer_id IN (
                SELECT DISTINCT transfer_id
                FROM public.kc_titles
                WHERE user_id = ${owner.id}
                  AND wallet_id = ${g.wallet_id}::uuid
                  AND transfer_id IS NOT NULL
              )
            )
        `;
        let targetId = g.parent_wallet_id;
        if (targetId) {
          const pw = await sql`SELECT id FROM public.kc_wallets WHERE id=${targetId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
          if (!pw.length) targetId = null;
        }
        if (!targetId) {
          const fallback = await sql`SELECT id FROM public.kc_wallets WHERE user_id=${owner.id} AND id<>${g.wallet_id}::uuid AND archived_at IS NULL ORDER BY created_at LIMIT 1`;
          targetId = fallback[0]?.id || null;
        }
        if (targetId) {
          await sql`SELECT public.kc_archive_wallet(${owner.id},${g.wallet_id}::uuid,${targetId}::uuid,'transfer')`;
        } else {
          await sql`UPDATE public.kc_wallets SET archived_at=now(), opening_balance_cents=0, opening_at=now() WHERE id=${g.wallet_id}::uuid AND user_id=${owner.id}`;
        }
      }
    }
    return ok({ saved: true });
  }

  if (x.action === "pay_credit_card_invoice") {
    if (!uuid(x.creditCardId) || !isValidMonth(x.invoiceMonth) || !uuid(x.walletId)) {
      return fail("Cartão, mês da fatura ou conta de pagamento inválidos.");
    }
    const paidOn = day(x.paidOn) ? x.paidOn : brDay();
    if (!validSettlementDay(paidOn, brDay())) return fail("A data de pagamento não pode ser futura.");
    const payCents = amount(x.amount, false, false);
    const wRows = await sql`SELECT id FROM public.kc_wallets WHERE id=${x.walletId}::uuid AND user_id=${owner.id} AND archived_at IS NULL LIMIT 1`;
    if (!wRows.length) return fail("Conta de pagamento não encontrada.", 404);
    const openTitles = await sql`
      SELECT id, wallet_id, amount_cents::text, settled_cents::text
      FROM public.kc_titles
      WHERE user_id=${owner.id}
        AND credit_card_id=${x.creditCardId}::uuid
        AND COALESCE(invoice_month, to_char(due_on, 'YYYY-MM'))=${x.invoiceMonth}
        AND cancelled_at IS NULL
        AND settled_cents < amount_cents
      ORDER BY due_on, created_at
    `;
    const totalOpen = openTitles.reduce((s, t) => s + Math.max(0, Number(t.amount_cents) - Number(t.settled_cents)), 0);
    if (totalOpen <= 0) return fail("Esta fatura já está totalmente paga.");
    if (payCents > totalOpen) return fail("Valor maior que o saldo em aberto desta fatura.", 409);

    let left = payCents;
    let settledCount = 0;
    for (const t of openTitles) {
      if (left <= 0) break;
      const rem = Math.max(0, Number(t.amount_cents) - Number(t.settled_cents));
      const chunk = Math.min(left, rem);
      if (chunk <= 0) continue;
      if (t.wallet_id !== x.walletId) {
        await sql`UPDATE public.kc_titles SET wallet_id=${x.walletId}::uuid WHERE id=${t.id}::uuid AND user_id=${owner.id}`;
      }
      await sql`SELECT public.kc_settle_title(${owner.id},${t.id}::uuid,${chunk},${paidOn}::date,${crypto.randomUUID()}::uuid)`;
      left -= chunk;
      settledCount += 1;
    }
    return ok({ saved: true, paidCents: payCents - left, settledCount, remainingCents: totalOpen - (payCents - left) });
  }

  if (x.action === "archive_credit_card") {
    if (!uuid(x.creditCardId)) return fail("Cartão inválido.");
    await sql`UPDATE public.kc_credit_cards SET archived_at=now() WHERE id=${x.creditCardId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true });
  }

  if (x.action === "archive_wallet") {
    if (!uuid(x.sourceWalletId) || !uuid(x.targetWalletId)) return fail("Selecione a conta a arquivar e a conta destino.");
    const balanceAction = x.balanceAction === "discard" ? "discard" : "transfer";
    const rows = await sql`SELECT public.kc_archive_wallet(${owner.id},${x.sourceWalletId}::uuid,${x.targetWalletId}::uuid,${balanceAction}) AS info`;
    return ok({ saved: true, ...rows[0]?.info });
  }

  if (x.action === "unarchive_wallet") {
    if (!uuid(x.walletId)) return fail("Conta inválida.");
    await sql`UPDATE public.kc_wallets SET archived_at=NULL, opening_balance_cents=0, opening_at=now() WHERE id=${x.walletId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true });
  }

  if (x.action === "cancel") {
    if (!uuid(x.titleId)) return fail("Título inválido.");
    const tRows = await sql`SELECT id,transfer_id,entry_kind FROM public.kc_titles WHERE id=${x.titleId}::uuid AND user_id=${owner.id} AND cancelled_at IS NULL LIMIT 1`;
    if (!tRows.length) return fail("Título não encontrado.", 404);
    if (tRows[0].transfer_id && ["transfer", "reserve_transfer"].includes(tRows[0].entry_kind)) {
      const pair = await sql`SELECT id FROM public.kc_titles WHERE user_id=${owner.id} AND transfer_id=${tRows[0].transfer_id}::uuid AND cancelled_at IS NULL`;
      let info = null;
      for (const p of pair) {
        const res = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${p.id}::uuid,'only') AS info`;
        await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${p.id}::uuid)`;
        if (!info) info = res[0]?.info;
      }
      return ok({ saved: true, cancelledCount: pair.length, ...info });
    }
    if (tRows[0].transfer_id && tRows[0].entry_kind === "loan_out") {
      const result = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,'only') AS info`;
      await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
      const openRepays = await sql`SELECT id FROM public.kc_titles WHERE user_id=${owner.id} AND transfer_id=${tRows[0].transfer_id}::uuid AND id<>${x.titleId}::uuid AND entry_kind='loan_repayment' AND settled_cents=0 AND cancelled_at IS NULL`;
      for (const r of openRepays) {
        await sql`SELECT public.kc_cancel_title_scope(${owner.id},${r.id}::uuid,'only')`;
      }
      return ok({ saved: true, ...result[0]?.info });
    }
    const result = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,'only') AS info`;
    await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
    return ok({ saved: true, ...result[0]?.info });
  }

  if (x.action === "save_workspace_prefs") {
    const desktopColumns = sanitizeWorkspaceColumns(x.desktopColumns);
    const columnSettings = sanitizeColumnSettings(x.columnSettings);
    try {
      await sql`INSERT INTO public.kc_user_preferences(user_id,desktop_columns,column_settings,updated_at)
        VALUES(${owner.id},${JSON.stringify(desktopColumns)}::jsonb,${JSON.stringify(columnSettings)}::jsonb,now())
        ON CONFLICT (user_id) DO UPDATE SET desktop_columns=EXCLUDED.desktop_columns, column_settings=EXCLUDED.column_settings, updated_at=now()`;
    } catch (e) {
      if (e?.code !== "42P01") throw e;
    }
    return ok({ saved: true, desktopColumns, columnSettings });
  }

  return fail("Ação não reconhecida.");
}

export async function executePortfolioAction(ownerId, payload, method = "POST") {
  return method === "PATCH" ? executePortfolioPatch(ownerId, payload) : executePortfolioPost(ownerId, payload);
}
