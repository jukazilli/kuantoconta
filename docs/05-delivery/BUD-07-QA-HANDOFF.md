# BUD-07 · Checklist de QA, Migrations e Handoff para Homologação (Issue #14)

- **Issue principal:** [jukazilli/kuantoconta#14](https://github.com/jukazilli/kuantoconta/issues/14)
- **ADR:** [ADR-008](../adr/ADR-008-budgets-economic-events-and-projection.md)

## 1. Cadeia de Entregas e PRs Draft

| Fase | Branch | PR Draft | Conteúdo Principal |
|---|---|---|---|
| **BUD-00** | `docs/bud-00-architecture-adr` | #15 | Diagnóstico, ADR-008 e plano |
| **BUD-01** | `feat/bud-01-categories-budgets-schema` | #16 | Migration `005`, `kc_categories` estáveis, `kc_budget_rules`/`kc_budget_periods`, API CRUD |
| **BUD-02** | `feat/bud-02-economic-events-atomic-entry` | #17 | Migration `006`, `kc_economic_events`, `kc_create_financial_event` ACID/idempotente, `EntryDrawer` Pago/A pagar |
| **BUD-03** | `feat/bud-03-budget-consumption-engine` | #18 | Migration `007`, `computeBudgetSummary`, sync atômico de edição e cancelamento |
| **BUD-04** | `feat/bud-04-projection-scenarios` | #19 | Cenários `contractual` vs. `within_budgets` até 31/12, `safeToSpendCents` |
| **BUD-05** | `feat/bud-05-budgets-ui` | #20 | `BudgetList.jsx`, toggle `Controlar gastos` + `Limite mensal` em `EntryDrawer.jsx` |
| **BUD-06** | `feat/bud-06-home-hierarchy` | #21 | Home centrada em A pagar → Limites → Patrimônio → Saldos/A receber secundários |
| **BUD-07** | `test/bud-07-qa-and-docs` | #22 | Documentação atualizada e checklist de homologação |

## 2. Ordem Obrigatória de Migrations (Neon QA Isolado)

**Atenção:** Nenhuma migration foi executada no banco Neon compartilhado. Ao preparar o ambiente isolado de QA, aplicar na ordem exata:
1. `apps/web/db/001_init.sql` → `004_scoped_cancellation.sql` (base PRs #9–#12)
2. `apps/web/db/005_categories_and_budgets.sql`
3. `apps/web/db/006_economic_events.sql`
4. `apps/web/db/007_economic_event_sync.sql`
5. Backfill opcional de legado em dry-run primeiro:
   `SELECT public.kc_backfill_legacy_economic_events('<user_id>', true);`

## 3. Cobertura de Testes Automatizados

- **Testes unitários (`node --test lib/*.test.mjs`):** **39/39 passando** cobrindo:
  - Casos A e B (R$ 29,80 Pago / A pagar + baixa sem duplicação)
  - Caso C (delta em edição e transferência de categoria)
  - Caso E (compra 6× R$ 200 = R$ 1.200 consumida 1×)
  - Caso F (receita pendente vs. recebida)
  - Caso G (`within_budgets` somando apenas residual)
  - Caso H (caixa negativo nunca promove limite restante como margem livre)
  - Caso J e sem rollover (recorrências 2099, meses 28/29/30/31, virada de mês)
  - Escopos `only/future/all`, reversão de baixa e máscara BRL.

## 4. Itens Pendentes para Homologação Humana (Gate Final)

1. Aplicar migrations `005`–`007` em branch/banco Neon QA isolado.
2. Executar testes E2E autenticados com dois usuários (isolamento A ≠ B, HTTP 401/403, `idempotency_key` sob retry).
3. Validar visualmente no Playwright desktop (`1440×900`, `1280×800`, `1024×768`) após deploy em preview protegido.
4. Aprovar e mesclar a cadeia de PRs #9→#12 e #15→#22 na ordem correta.
