import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadPortfolio, executePortfolioPost, executePortfolioPatch } from "./portfolio-service.js";
import { recordMcpAudit } from "./oauth.js";
import { brDay, cents, isoDate, money } from "./finance.js";
import { computeRange, firstDayOfMonth, lastDayOfMonth } from "./period.js";
import { expandRecurring } from "./recurring.js";
import { computeBudgetSummary, computeTotalDebtCents } from "./budgets.js";
import { buildFinancialHealthPlan } from "./financial-health.js";
import { analyzeConsumptionHabits } from "./habit-analyzer.js";
import { simulateGoalPurchase } from "./goal-planner.js";
import { computeCapitalPace } from "./capital-pace.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function jsonText(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function errText(msg) {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: msg }) }] };
}

function resolveWalletId(wallets, walletIdOrName) {
  if (!walletIdOrName) return wallets[0]?.id || null;
  const exactId = wallets.find((w) => w.id === walletIdOrName);
  if (exactId) return exactId.id;
  const q = String(walletIdOrName).trim().toLowerCase();
  const byName = wallets.find((w) => String(w.name || "").trim().toLowerCase() === q)
    || wallets.find((w) => String(w.name || "").trim().toLowerCase().includes(q));
  return byName?.id || null;
}

function resolveCategory(categories, direction, categoryIdOrName) {
  const roots = (categories || []).filter((c) => c.direction === direction && !c.parent_id);
  const exactId = roots.find((c) => c.id === categoryIdOrName);
  if (exactId) return exactId;
  const q = String(categoryIdOrName || "").trim().toLowerCase();
  return roots.find((c) => String(c.name || "").trim().toLowerCase() === q)
    || roots.find((c) => String(c.name || "").trim().toLowerCase().includes(q))
    || null;
}

export const MCP_TOOL_NAMES = [
  "get_financial_overview",
  "list_movements",
  "get_budgets_status",
  "get_health_diagnosis",
  "get_capital_and_goals",
  "simulate_purchase_impact",
  "create_wallet",
  "create_transaction",
  "settle_or_reverse_title",
  "upsert_budget_limit",
  "suggest_monthly_budgets",
  "create_spending_plan",
  "transfer_to_capital",
  "create_capital_goal",
  "cancel_title_with_scope",
];

export const MCP_PROMPT_NAMES = [
  "fechamento_mensal",
  "plano_sair_do_vermelho",
  "posso_comprar_isso",
];

export function createKuantoContaMcpServer(ownerId, deps = {}) {
  const getPortfolio = deps.loadPortfolio || loadPortfolio;
  const postAction = deps.executePortfolioPost || executePortfolioPost;
  const patchAction = deps.executePortfolioPatch || executePortfolioPatch;
  const audit = deps.recordMcpAudit || recordMcpAudit;

  const server = new McpServer({
    name: "kuantoconta",
    version: "1.0.0",
  });

  async function runTool(toolName, fn) {
    try {
      const result = await fn();
      await audit(ownerId, toolName, result?.isError ? "error" : "ok");
      return result;
    } catch (e) {
      await audit(ownerId, toolName, "error");
      return errText(e?.message || "Falha ao executar ferramenta.");
    }
  }

  // 1. get_financial_overview
  server.registerTool(
    "get_financial_overview",
    {
      title: "Visão geral financeira",
      description: "Retorna saldos por banco/carteira, total a pagar, a receber, saldo previsto e endividamento no período.",
      inputSchema: {
        rangeStart: z.string().regex(DATE_RE).optional().describe("Data inicial YYYY-MM-DD (padrão: primeiro dia do mês atual)"),
        date: z.string().regex(DATE_RE).optional().describe("Data final YYYY-MM-DD (padrão: último dia do mês atual)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ rangeStart, date }) =>
      runTool("get_financial_overview", async () => {
        const today = brDay();
        const start = rangeStart || firstDayOfMonth(today);
        const end = date || lastDayOfMonth(today);
        const data = await getPortfolio(ownerId);
        const expanded = expandRecurring(data, start < today ? start : today, end < today ? today : end);
        const summary = computeRange(expanded, start, end, today);
        const totalDebtCents = computeTotalDebtCents({ ...data, mode: "all_commitments" });
        const financialDebtOnlyCents = computeTotalDebtCents({ ...data, mode: "financial_only" });

        return jsonText({
          period: { rangeStart: start, date: end, today },
          liveCashCents: summary.liveCash,
          liveCashFormatted: summary.liveCash === null ? "Não informado" : money(summary.liveCash),
          projectedBalanceCents: summary.projectedBalance,
          projectedBalanceFormatted: summary.projectedBalance === null ? "Não informado" : money(summary.projectedBalance),
          toPayCents: summary.openExpense,
          toPayFormatted: money(summary.openExpense),
          toReceiveCents: summary.openIncome,
          toReceiveFormatted: money(summary.openIncome),
          totalDebtCents,
          totalDebtFormatted: money(totalDebtCents),
          totalCommitmentsCents: totalDebtCents,
          totalCommitmentsFormatted: money(totalDebtCents),
          financialDebtOnlyCents,
          financialDebtOnlyFormatted: money(financialDebtOnlyCents),
          minCashCents: summary.minCash,
          wallets: (data.wallets || [])
            .filter((w) => !w.archived_at)
            .map((w) => ({
              id: w.id,
              name: w.name,
              walletKind: w.wallet_kind,
              isReserved: Boolean(w.is_reserved),
            })),
        });
      })
  );

  // 2. list_movements
  server.registerTool(
    "list_movements",
    {
      title: "Listar movimentos",
      description: "Lista lançamentos (receitas e despesas) filtrados por período, tipo, status e texto.",
      inputSchema: {
        rangeStart: z.string().regex(DATE_RE).optional(),
        date: z.string().regex(DATE_RE).optional(),
        direction: z.enum(["all", "income", "expense"]).optional(),
        status: z.enum(["all", "pending", "paid", "late"]).optional(),
        query: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ rangeStart, date, direction = "all", status = "all", query = "", limit = 40 }) =>
      runTool("list_movements", async () => {
        const today = brDay();
        const start = rangeStart || firstDayOfMonth(today);
        const end = date || lastDayOfMonth(today);
        const data = await getPortfolio(ownerId);
        const expanded = expandRecurring(data, start < today ? start : today, end < today ? today : end);
        const q = query.trim().toLowerCase();

        const rows = (expanded.titles || [])
          .filter((t) => {
            const d = isoDate(t.due_on);
            if (d < start || d > end) return false;
            if (direction !== "all" && t.direction !== direction) return false;
            const rem = Math.max(0, cents(t.amount_cents) - cents(t.settled_cents));
            if (status === "paid" && rem > 0) return false;
            if (status === "pending" && rem === 0) return false;
            if (status === "late" && !(rem > 0 && d < today)) return false;
            if (q && !`${t.description} ${t.category} ${t.subcategory || ""}`.toLowerCase().includes(q)) return false;
            return true;
          })
          .slice(0, limit)
          .map((t) => ({
            id: t.id,
            description: t.description,
            direction: t.direction,
            category: t.category,
            subcategory: t.subcategory,
            dueOn: isoDate(t.due_on),
            amountCents: cents(t.amount_cents),
            amountFormatted: money(cents(t.amount_cents)),
            settledCents: cents(t.settled_cents),
            remainingCents: Math.max(0, cents(t.amount_cents) - cents(t.settled_cents)),
            recurrence: t.recurrence,
            walletId: t.wallet_id,
          }));

        return jsonText({ period: { rangeStart: start, date: end }, count: rows.length, items: rows });
      })
  );

  // 3. get_budgets_status
  server.registerTool(
    "get_budgets_status",
    {
      title: "Status dos limites mensais",
      description: "Mostra os orçamentos/limites por categoria do mês: gasto realizado, planejado, comprometido e restante livre.",
      inputSchema: {
        month: z.string().regex(MONTH_RE).optional().describe("Mês no formato YYYY-MM (padrão: mês atual)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ month }) =>
      runTool("get_budgets_status", async () => {
        const targetMonth = month || brDay().slice(0, 7);
        const data = await getPortfolio(ownerId);
        const items = computeBudgetSummary({
          month: targetMonth,
          categories: data.categories || [],
          budgetRules: data.budgetRules || [],
          budgetPeriods: data.budgetPeriods || [],
          economicEvents: data.economicEvents || [],
          titles: data.titles || [],
          recurringRules: data.recurringRules || [],
          cancelledRecurring: data.cancelledRecurring || [],
          spendingPlans: data.spendingPlans || [],
          spendingPlanApplications: data.spendingPlanApplications || [],
        });
        return jsonText({
          month: targetMonth,
          budgets: items.map((i) => ({
            categoryId: i.categoryId,
            categoryName: i.categoryName,
            limitCents: i.limitCents,
            limitFormatted: i.limitCents === null ? "Sem teto" : money(i.limitCents),
            realizedCents: i.realizedCents,
            committedCents: i.committedUnrealizedCents,
            plannedCents: i.plannedRemainingCents,
            remainingCents: i.remainingLimitCents,
            unallocatedCents: i.unallocatedCents,
            utilizationPct: i.utilizationPct,
          })),
        });
      })
  );

  // 4. get_health_diagnosis
  server.registerTool(
    "get_health_diagnosis",
    {
      title: "Diagnóstico de saúde financeira",
      description: "Retorna estado financeiro, reserva líquida, comprometimento, Dedo Duro (gastos formiguinha e vazamentos), Tesouraço (economia potencial) e Marcos de recuperação.",
      inputSchema: {
        rangeStart: z.string().regex(DATE_RE).optional(),
        date: z.string().regex(DATE_RE).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ rangeStart, date }) =>
      runTool("get_health_diagnosis", async () => {
        const today = brDay();
        const start = rangeStart || firstDayOfMonth(today);
        const end = date || lastDayOfMonth(today);
        const data = await getPortfolio(ownerId);
        const healthPlan = buildFinancialHealthPlan(data, { today, previousSnapshot: data.latestHealthSnapshot || null });
        const expanded = expandRecurring(data, start < today ? start : today, end < today ? today : end);
        const habits = analyzeConsumptionHabits({
          titles: expanded.titles || [],
          recurringRules: data.recurringRules || [],
          rangeStart: start,
          rangeEnd: end,
        });
        return jsonText({
          period: { rangeStart: start, date: end },
          diagnosis: healthPlan.diagnosis,
          milestones: healthPlan.milestones,
          allocation: healthPlan.allocation,
          dedoDuro: {
            topLeaks: habits.topLeaks,
            smallLeaks: habits.smallLeaks,
            weekend: habits.weekend,
          },
          tesouraco: habits.tesouraco,
        });
      })
  );

  // 5. get_capital_and_goals
  server.registerTool(
    "get_capital_and_goals",
    {
      title: "Meu Capital, reservas e metas",
      description: "Retorna Carteira de Capital, bens, dívidas declaradas, metas de capital (com ritmo onPace) e compras planejadas salvas.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      runTool("get_capital_and_goals", async () => {
        const today = brDay();
        const data = await getPortfolio(ownerId);
        const capitalWallets = (data.wallets || []).filter(
          (w) => w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment"
        );
        const summary = computeRange(data, today, today, today);
        const capitalBalanceCents = capitalWallets.reduce((acc, w) => {
          const settled = (data.settlements || [])
            .filter((s) => s.wallet_id === w.id && !s.reversed_at && (!w.opening_at || isoDate(s.settled_on) >= isoDate(w.opening_at)))
            .reduce((sum, s) => sum + (s.direction === "income" ? cents(s.amount_cents) : -cents(s.amount_cents)), 0);
          return acc + cents(w.opening_balance_cents) + settled;
        }, 0);
        const healthPlan = buildFinancialHealthPlan(data, { today, previousSnapshot: data.latestHealthSnapshot || null });
        const monthlyContrib = Math.max(0, Number(healthPlan?.allocation?.projectedMonthlyCents || 0));

        const capitalGoals = (data.goals || [])
          .filter((g) => g.category === "capital_goal")
          .map((g) => ({
            id: g.id,
            title: g.title,
            targetCents: cents(g.target_cents),
            desiredOn: isoDate(g.desired_on),
            pace: computeCapitalPace({
              targetCents: cents(g.target_cents),
              targetDate: isoDate(g.desired_on) || `${today.slice(0, 4)}-12-31`,
              currentCapitalCents: capitalBalanceCents,
              monthlyContributionCents: monthlyContrib,
              today,
            }),
          }));

        const purchaseGoals = (data.goals || [])
          .filter((g) => g.category !== "capital_goal")
          .map((g) => ({
            id: g.id,
            title: g.title,
            targetCents: cents(g.target_cents),
            downPaymentCents: cents(g.down_payment_cents),
            installmentCount: g.installment_count,
            installmentCents: cents(g.installment_cents),
            interestBps: Number(g.interest_bps || 0),
            desiredOn: isoDate(g.desired_on),
          }));

        return jsonText({
          liveCashCents: summary.liveCash,
          capitalBalanceCents,
          capitalBalanceFormatted: money(capitalBalanceCents),
          assets: data.assets || [],
          liabilities: data.liabilities || [],
          capitalGoals,
          purchaseGoals,
        });
      })
  );

  // 6. simulate_purchase_impact
  server.registerTool(
    "simulate_purchase_impact",
    {
      title: "Simular compra parcelada com juros (Tabela Price)",
      description: "Simula se uma compra (ex: carro, notebook) cabe no orçamento com cálculo de juros Tabela Price e veredito em 2 etapas (Entrada vs Parcela mensal).",
      inputSchema: {
        title: z.string().min(1).max(120),
        targetReais: z.number().positive().describe("Valor total do bem em reais"),
        downPaymentReais: z.number().min(0).optional().describe("Valor de entrada em reais (padrão 0)"),
        installmentCount: z.number().int().min(1).max(120).optional().describe("Número de parcelas (padrão 1)"),
        monthlyInterestPct: z.number().min(0).max(100).optional().describe("Juros mensal em % a.m., ex: 1.89"),
        useCapitalInDownPayment: z.boolean().optional().describe("Se deve considerar saldo da Carteira de Capital/Reserva na entrada"),
        desiredOn: z.string().regex(DATE_RE).optional().describe("Data desejada YYYY-MM-DD"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ title, targetReais, downPaymentReais = 0, installmentCount = 1, monthlyInterestPct = 0, useCapitalInDownPayment = false, desiredOn }) =>
      runTool("simulate_purchase_impact", async () => {
        const today = brDay();
        const data = await getPortfolio(ownerId);
        const sim = simulateGoalPurchase(
          data,
          {
            title,
            targetCents: Math.round(targetReais * 100),
            downPaymentCents: Math.round(downPaymentReais * 100),
            installmentCount,
            interestBps: Math.round(monthlyInterestPct * 100),
            useCapitalInDownPayment,
            desiredOn: desiredOn || today,
          },
          { today }
        );
        return jsonText(sim);
      })
  );

  // 7. create_wallet
  server.registerTool(
    "create_wallet",
    {
      title: "Criar conta ou carteira",
      description: "Cadastra uma nova conta bancária, carteira de uso diário, reserva de emergência ou carteira de capital.",
      inputSchema: {
        name: z.string().min(1).max(90),
        balanceReais: z.number().optional().describe("Saldo atual de abertura em reais (pode ser negativo)"),
        walletKind: z.enum(["checking", "cash", "reserve", "investment"]).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, balanceReais = 0, walletKind = "checking" }) =>
      runTool("create_wallet", async () => {
        const res = await postAction(ownerId, {
          action: "wallet",
          name,
          balance: String(balanceReais),
          walletKind,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 8. create_transaction
  server.registerTool(
    "create_transaction",
    {
      title: "Criar lançamento (receita ou despesa)",
      description: "Registra um gasto já pago, uma conta a pagar ou a receber, parcelada ou recorrente mensal.",
      inputSchema: {
        direction: z.enum(["expense", "income"]),
        description: z.string().min(1).max(140),
        amountReais: z.number().positive(),
        category: z.string().min(1).max(70).describe("Nome da categoria principal (ex: Alimentação, Moradia, Salário)"),
        wallet: z.string().optional().describe("ID ou nome da conta/banco (usa a primeira conta se omitido)"),
        dueOn: z.string().regex(DATE_RE).optional().describe("Data de vencimento YYYY-MM-DD (padrão: hoje)"),
        mode: z.enum(["single", "installments", "monthly"]).optional(),
        count: z.number().int().min(1).max(60).optional(),
        valueMode: z.enum(["total", "installment"]).optional(),
        settlementState: z.enum(["pending", "paid"]).optional(),
        settledOn: z.string().regex(DATE_RE).optional(),
        idempotencyKey: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool("create_transaction", async () => {
        const data = await getPortfolio(ownerId);
        const walletId = resolveWalletId(data.wallets || [], args.wallet);
        if (!walletId) return errText("Nenhuma conta cadastrada. Crie uma conta primeiro com create_wallet.");
        const today = brDay();
        const dueOn = args.dueOn || today;
        const res = await postAction(ownerId, {
          action: "title",
          walletId,
          direction: args.direction,
          description: args.description,
          category: args.category,
          amount: String(args.amountReais),
          dueOn,
          occurredOn: dueOn,
          mode: args.mode || "single",
          count: args.count || 1,
          valueMode: args.valueMode || "total",
          settlementState: args.settlementState || "pending",
          settledOn: args.settlementState === "paid" ? args.settledOn || today : null,
          idempotencyKey: args.idempotencyKey,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 9. settle_or_reverse_title
  server.registerTool(
    "settle_or_reverse_title",
    {
      title: "Dar baixa ou estornar lançamento",
      description: "Confirma o pagamento/recebimento de um título (settle) ou estorna uma baixa realizada (reverse).",
      inputSchema: {
        operation: z.enum(["settle", "reverse"]),
        titleId: z.string().uuid().optional(),
        amountReais: z.number().positive().optional(),
        settledOn: z.string().regex(DATE_RE).optional(),
        settlementId: z.string().uuid().optional(),
        idempotencyKey: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (args) =>
      runTool("settle_or_reverse_title", async () => {
        if (args.operation === "reverse") {
          const res = await patchAction(ownerId, { action: "reverse", settlementId: args.settlementId });
          return res.ok ? jsonText(res.data) : errText(res.error);
        }
        const res = await patchAction(ownerId, {
          action: "settle",
          titleId: args.titleId,
          amount: String(args.amountReais || 0),
          settledOn: args.settledOn || brDay(),
          idempotency: args.idempotencyKey || crypto.randomUUID(),
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 10. upsert_budget_limit
  server.registerTool(
    "upsert_budget_limit",
    {
      title: "Definir ou desativar limite de orçamento",
      description: "Configura o limite mensal de uma categoria de despesa ou desativa o controle de limite.",
      inputSchema: {
        category: z.string().min(1).max(80).describe("ID ou nome da categoria de despesa"),
        limitReais: z.number().min(0).optional(),
        month: z.string().regex(MONTH_RE).optional(),
        active: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ category, limitReais = 0, month, active = true }) =>
      runTool("upsert_budget_limit", async () => {
        const data = await getPortfolio(ownerId);
        const cat = resolveCategory(data.categories || [], "expense", category);
        if (!cat) return errText(`Categoria de despesa '${category}' não encontrada.`);
        const res = await postAction(ownerId, {
          action: "budget",
          categoryId: cat.id,
          month: month || brDay().slice(0, 7),
          limit: String(limitReais),
          active,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 11. suggest_monthly_budgets
  server.registerTool(
    "suggest_monthly_budgets",
    {
      title: "Sugerir limites pela renda do mês",
      description: "Gera automaticamente a divisão inteligente de limites (50% Essenciais, 30% Estilo de vida, 20% Reserva/Capital) com base na renda do mês.",
      inputSchema: {
        month: z.string().regex(MONTH_RE).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ month }) =>
      runTool("suggest_monthly_budgets", async () => {
        const res = await postAction(ownerId, {
          action: "suggest_budgets",
          month: month || brDay().slice(0, 7),
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 12. create_spending_plan
  server.registerTool(
    "create_spending_plan",
    {
      title: "Criar compra planejada (previsão)",
      description: "Registra uma intenção de gasto futuro dentro do orçamento sem gerar dívida ou cobrança real.",
      inputSchema: {
        description: z.string().min(1).max(140),
        category: z.string().min(1).max(70),
        amountReais: z.number().positive(),
        plannedMonth: z.string().regex(MONTH_RE).optional(),
        plannedFor: z.string().regex(DATE_RE).optional(),
        idempotencyKey: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) =>
      runTool("create_spending_plan", async () => {
        const res = await postAction(ownerId, {
          action: "spending_plan",
          description: args.description,
          category: args.category,
          amount: String(args.amountReais),
          plannedMonth: args.plannedMonth,
          plannedFor: args.plannedFor,
          idempotencyKey: args.idempotencyKey,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 13. transfer_to_capital
  server.registerTool(
    "transfer_to_capital",
    {
      title: "Transferir aporte para Carteira de Capital / Reserva",
      description: "Move saldo de uma conta de uso diário para a Carteira de Capital ou Reserva sem duplicar despesas.",
      inputSchema: {
        amountReais: z.number().positive(),
        fromWallet: z.string().optional().describe("ID ou nome da conta de origem"),
        toWallet: z.string().optional().describe("ID ou nome da carteira de destino (padrão: primeira carteira de reserva/capital)"),
        transferredOn: z.string().regex(DATE_RE).optional(),
        description: z.string().max(120).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ amountReais, fromWallet, toWallet, transferredOn, description }) =>
      runTool("transfer_to_capital", async () => {
        const data = await getPortfolio(ownerId);
        const wallets = data.wallets || [];
        const checking = wallets.find((w) => !w.is_reserved && w.wallet_kind !== "reserve" && w.wallet_kind !== "investment");
        const capital = wallets.find((w) => w.is_reserved || w.wallet_kind === "reserve" || w.wallet_kind === "investment");
        const fromId = resolveWalletId(wallets, fromWallet || checking?.id);
        const toId = resolveWalletId(wallets, toWallet || capital?.id);
        if (!fromId || !toId || fromId === toId) {
          return errText("É necessário ter uma conta de origem e uma Carteira de Capital/Reserva diferentes.");
        }
        const res = await postAction(ownerId, {
          action: "transfer_capital",
          fromWalletId: fromId,
          toWalletId: toId,
          amount: String(amountReais),
          transferredOn: transferredOn || brDay(),
          description,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 14. create_capital_goal
  server.registerTool(
    "create_capital_goal",
    {
      title: "Criar meta de capital ou objetivo de compra",
      description: "Salva uma meta de formação de capital (category='capital_goal') ou uma simulação de compra planejada.",
      inputSchema: {
        title: z.string().min(1).max(120),
        targetReais: z.number().positive(),
        desiredOn: z.string().regex(DATE_RE).optional(),
        isCapitalGoal: z.boolean().optional().describe("true para meta de capital/reserva; false para compra planejada"),
        downPaymentReais: z.number().min(0).optional(),
        installmentCount: z.number().int().min(1).max(120).optional(),
        monthlyInterestPct: z.number().min(0).max(100).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ title, targetReais, desiredOn, isCapitalGoal = true, downPaymentReais = 0, installmentCount = 1, monthlyInterestPct = 0 }) =>
      runTool("create_capital_goal", async () => {
        const res = await postAction(ownerId, {
          action: "goal",
          title,
          category: isCapitalGoal ? "capital_goal" : null,
          target: String(targetReais),
          downPayment: String(isCapitalGoal ? 0 : downPaymentReais),
          installmentCount: isCapitalGoal ? 1 : installmentCount,
          interestBps: isCapitalGoal ? 0 : Math.round(monthlyInterestPct * 100),
          desiredOn,
        });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // 15. cancel_title_with_scope
  server.registerTool(
    "cancel_title_with_scope",
    {
      title: "Cancelar lançamento com escopo",
      description: "Cancela somente uma ocorrência (only), esta e futuras (future), ou toda a série em aberto (all). Preserva baixas já realizadas.",
      inputSchema: {
        titleId: z.string().min(1),
        scope: z.enum(["only", "future", "all"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ titleId, scope }) =>
      runTool("cancel_title_with_scope", async () => {
        const res = await patchAction(ownerId, { action: "cancel_scope", titleId, scope });
        return res.ok ? jsonText(res.data) : errText(res.error);
      })
  );

  // Prompts analíticos
  server.registerPrompt(
    "fechamento_mensal",
    {
      title: "Fechamento mensal inteligente",
      description: "Gera um resumo executivo do mês com saldos, limites estourados, contas pendentes e sobra real.",
      argsSchema: { month: z.string().regex(MONTH_RE).optional() },
    },
    ({ month }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Faça o fechamento financeiro do mês ${month || "atual"} usando get_financial_overview, get_budgets_status e list_movements. Destaque: (1) saldo realizado vs previsto, (2) categorias acima do limite, (3) contas ainda em aberto/atrasadas e (4) 3 ações objetivas para o próximo mês em português simples.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "plano_sair_do_vermelho",
    {
      title: "Plano prático para sair do vermelho",
      description: "Analisa saúde financeira, Dedo Duro, Tesouraço e Marcos de recuperação para montar um plano de ação.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Chame get_health_diagnosis e get_capital_and_goals. Explique em linguagem direta e acolhedora: (1) minha situação atual, (2) onde o dinheiro está escoando (Dedo Duro), (3) quanto posso liberar por mês e por ano cortando gastos (Tesouraço) e (4) as datas previstas dos meus marcos até a estabilidade.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "posso_comprar_isso",
    {
      title: "Simulador: posso comprar isso?",
      description: "Avalia se uma compra à vista ou financiada com juros cabe na entrada e na sobra mensal.",
      argsSchema: {
        item: z.string().optional(),
        valorReais: z.string().optional(),
      },
    },
    ({ item, valorReais }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Quero saber se posso comprar ${item || "um item"} ${valorReais ? `de R$ ${valorReais}` : ""}. Use simulate_purchase_impact e apresente o veredito em 2 etapas: (1) se tenho a entrada hoje ou quando atinjo, e (2) se a parcela com juros cabe na minha sobra mensal livre, sugerindo alternativas se não couber.`,
          },
        },
      ],
    })
  );

  return server;
}
