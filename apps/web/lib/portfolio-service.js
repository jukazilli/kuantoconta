import { sql } from "./db.js";
import { brDay, validSettlementDay } from "./finance.js";
import { DEFAULT_CATEGORIES, allowedRoot, canonicalCategoryKey, normalizeCategoryName } from "./taxonomy.js";
import { isValidMonth, computeMonthlyIncomeCeilingCents, validateBudgetAllocationCeiling, suggestBudgetsFromIncome } from "./budgets.js";
import { decodeOccurrenceId } from "./recurring.js";
import { validScope } from "./cancel-scope.js";
import { computePriceInstallmentCents } from "./goal-planner.js";

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
    sql`SELECT id,wallet_id,description,direction,category,category_id,amount_cents::text,settled_cents::text,due_on::text,entry_kind,cancelled_at FROM public.kc_titles WHERE user_id=${userId} AND cancelled_at IS NULL LIMIT 4000`,
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
    sql`SELECT id,name,opening_balance_cents::text,opening_at,wallet_kind,liquidity_kind,is_reserved,created_at FROM public.kc_wallets WHERE user_id=${owner.id} ORDER BY created_at LIMIT 100`,
    sql`SELECT id,wallet_id,description,direction,category,subcategory,category_id,subcategory_id,economic_event_id,amount_cents::text,settled_cents::text,due_on::text,recurrence,installment_index,installment_total,series_id,is_essential,income_confidence,entry_kind,liability_id,person_id,created_at FROM public.kc_titles WHERE user_id=${owner.id} AND cancelled_at IS NULL ORDER BY due_on,id LIMIT 4000`,
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
    sql`SELECT id,title,category,target_cents::text,down_payment_cents::text,installment_count,installment_cents::text,interest_bps,desired_on::text,priority,status,created_at FROM public.kc_financial_goals WHERE user_id=${owner.id} AND status<>'cancelled' ORDER BY priority,created_at DESC LIMIT 100`,
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
      if (hasLimit && limitCents > 0) {
        const inputs = await loadBudgetCeilingInputs(owner.id);
        const check = validateBudgetAllocationCeiling({ month: targetMonth, targetCategoryId: null, newLimitCents: limitCents, active: true, ...inputs });
        if (!check.ok) return fail(check.error, 400);
      }
      const key = canonicalCategoryKey(direction, name);
      const inserted = await sql`INSERT INTO public.kc_categories(user_id,name,direction,canonical_key) VALUES(${owner.id},${name},${direction},${key}) RETURNING id`;
      const catId = inserted[0]?.id;
      if (catId && hasLimit) {
        await sql`SELECT public.kc_upsert_budget_rule(${owner.id},${catId}::uuid,${limitCents},${targetMonth},true,NULL)`;
      }
      return ok({ saved: true, id: catId }, 201);
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
    const check = validateBudgetAllocationCeiling({ month: targetMonth, targetCategoryId: x.categoryId, newLimitCents: limitCents, active, ...inputs });
    if (!check.ok) return fail(check.error, 400);
    const expectedVersion = Number.isInteger(x.expectedVersion) ? x.expectedVersion : null;
    const rows = await upsertBudgetSafe(owner.id, x.categoryId, limitCents, targetMonth, active, expectedVersion);
    return ok({ saved: true, ...rows[0]?.info }, 201);
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
    const amountCents = amount(x.amount, false, false);
    if (!uuid(x.walletId)) return fail("Selecione de qual conta o dinheiro saiu.");
    if (!uuid(x.personId)) return fail("Selecione para quem você emprestou.");
    const lentOn = day(x.lentOn) ? x.lentOn : brDay();
    if (lentOn > brDay()) return fail("A data de saída não pode ser futura.");
    const expectedRepaymentOn = day(x.expectedRepaymentOn) ? x.expectedRepaymentOn : null;
    if (!expectedRepaymentOn) return fail("Informe a previsão de pagamento.");
    if (expectedRepaymentOn < lentOn) return fail("A previsão de pagamento deve ser igual ou posterior à data de saída.");

    const [wRows, pRows] = await Promise.all([
      sql`SELECT id,name FROM public.kc_wallets WHERE id=${x.walletId}::uuid AND user_id=${owner.id} LIMIT 1`,
      sql`SELECT id,name,relationship FROM public.kc_people WHERE id=${x.personId}::uuid AND user_id=${owner.id} LIMIT 1`,
    ]);
    if (!wRows.length) return fail("Conta não encontrada.", 404);
    if (!pRows.length) return fail("Pessoa não encontrada.", 404);
    const person = pRows[0];

    const outLabel = `${description} (${person.name})`;
    const inLabel = `Devolução: ${description} (${person.name})`;
    const outTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,person_id) VALUES(${owner.id},${x.walletId}::uuid,${outLabel.slice(0, 140)},'expense','Empréstimos',${amountCents},${amountCents},${lentOn}::date,'single','loan_out',${person.id}::uuid) RETURNING id`;
    await sql`INSERT INTO public.kc_settlements(user_id,title_id,wallet_id,amount_cents,settled_on,idempotency_key) VALUES(${owner.id},${outTitle[0].id}::uuid,${x.walletId}::uuid,${amountCents},${lentOn}::date,${crypto.randomUUID()}::uuid)`;
    const inTitle = await sql`INSERT INTO public.kc_titles(user_id,wallet_id,description,direction,category,amount_cents,settled_cents,due_on,recurrence,entry_kind,person_id) VALUES(${owner.id},${x.walletId}::uuid,${inLabel.slice(0, 140)},'income','Reembolsos',${amountCents},0,${expectedRepaymentOn}::date,'single','loan_repayment',${person.id}::uuid) RETURNING id`;

    return ok({ saved: true, outTitleId: outTitle[0]?.id, repaymentTitleId: inTitle[0]?.id, person }, 201);
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
    if (!description || !category || !day(x.dueOn) || !["income", "expense"].includes(x.direction) || !uuid(x.walletId)) {
      return fail("Descrição, data, tipo, categoria ou conta inválidos.");
    }
    const w = await sql`SELECT id FROM public.kc_wallets WHERE id=${x.walletId}::uuid AND user_id=${owner.id}`;
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
      if (x.dueOn > "2099-12-31") return fail("Recorrência só é permitida até 2099.");
      const end = x.endsOn ? String(x.endsOn) : null;
      if (end && (!day(end) || end < x.dueOn || end > "2099-12-31")) return fail("Data final da recorrência inválida.");
      const rule = await sql`INSERT INTO public.kc_recurring_rules(user_id,wallet_id,direction,description,category,subcategory,category_id,subcategory_id,amount_cents,starts_on,ends_on)
       VALUES(${owner.id},${x.walletId}::uuid,${x.direction},${description},${category},${subcategory},${categoryId}::uuid,${subcategoryId}::uuid,${base},${x.dueOn}::date,${end}::date)
       RETURNING id`;
      return ok({ saved: true, recurringRuleId: rule[0]?.id, createdOccurrences: 0 }, 201);
    }
    const occurredOn = x.occurredOn ? String(x.occurredOn) : x.dueOn;
    if (!day(occurredOn)) return fail("Data da compra/competência inválida.");
    const settlementState = x.settlementState === "paid" ? "paid" : "pending";
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
     ${owner.id},${x.walletId}::uuid,${x.direction},${description},
     ${categoryId}::uuid,${subcategoryId}::uuid,${category},${subcategory},
     ${base},${occurredOn}::date,${x.dueOn}::date,${mode},${count},${start},${perMode},
     ${settlementState},${settledOn}::date,${idempotencyKey}::uuid
    ) AS info`;
    const info = rows[0]?.info || {};
    const eventId = info.event_id || info.economic_event_id;
    let reconciliation = null;
    if (x.direction === "expense" && uuid(x.spendingPlanId) && uuid(eventId)) {
      const recKey = uuid(x.reconcileIdempotencyKey) ? x.reconcileIdempotencyKey : crypto.randomUUID();
      const recRows = await sql`SELECT public.kc_apply_event_to_spending_plan(${owner.id},${x.spendingPlanId}::uuid,${eventId}::uuid,NULL,${x.closeSpendingPlan !== false},${recKey}::uuid) AS info`;
      reconciliation = recRows[0]?.info || null;
    }
    return ok({ saved: true, ...info, reconciliation }, 201);
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
    const rows = await sql`INSERT INTO public.kc_financial_goals(user_id,title,category,target_cents,down_payment_cents,installment_count,installment_cents,interest_bps,desired_on,status) VALUES(${owner.id},${title},${category},${targetCents},${downPaymentCents},${installmentCount},${installmentCents},${interestBps},${desiredOn}::date,'simulated') RETURNING id`;
    return ok({ saved: true, id: rows[0]?.id }, 201);
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
    return ok({ saved: true, id: rows[0]?.id });
  }

  if (x.action === "reverse") {
    if (!uuid(x.settlementId)) return fail("Baixa inválida.");
    const reversal = await sql`SELECT public.kc_reverse_settlement(${owner.id},${x.settlementId}::uuid,'Reversão solicitada pelo titular') AS id`;
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
    const title = await sql`SELECT id,series_id,recurrence,installment_index FROM public.kc_titles WHERE id=${x.titleId}::uuid AND user_id=${owner.id} AND cancelled_at IS NULL LIMIT 1`;
    if (!title.length) return fail("Lançamento não encontrado.", 404);
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

  if (x.action === "cancel_goal") {
    if (!uuid(x.goalId)) return fail("Objetivo inválido.");
    await sql`UPDATE public.kc_financial_goals SET status='cancelled' WHERE id=${x.goalId}::uuid AND user_id=${owner.id}`;
    return ok({ saved: true });
  }

  if (x.action === "cancel") {
    if (!uuid(x.titleId)) return fail("Título inválido.");
    const result = await sql`SELECT public.kc_cancel_title_scope(${owner.id},${x.titleId}::uuid,'only') AS info`;
    await sql`SELECT public.kc_sync_cancelled_economic_events(${owner.id},${x.titleId}::uuid)`;
    return ok({ saved: true, ...result[0]?.info });
  }

  return fail("Ação não reconhecida.");
}

export async function executePortfolioAction(ownerId, payload, method = "POST") {
  return method === "PATCH" ? executePortfolioPatch(ownerId, payload) : executePortfolioPost(ownerId, payload);
}
