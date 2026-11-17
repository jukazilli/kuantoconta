# ADR-008 — Separação de Evento Econômico, Título e Baixa, Identidade Estável de Categorias, Orçamentos Mensais e Projeção Patrimonial

- **Status:** PROPOSTO (Aguardando aprovação do gate BUD-00 antes de qualquer migration ou implementação)
- **Data:** 17/11/2026
- **Issue relacionada:** [jukazilli/kuantoconta#14](https://github.com/jukazilli/kuantoconta/issues/14)
- **Base inspecionada:** PR #12 (`feat/scoped-cancel-financial-series`, SHA `ed5d1f8a3bccdae3774d9bf41aadecc11481fad4`)

---

## 1. Contexto e Problema

O schema atual do **kuantoconta** (`apps/web/db/001_init.sql` a `004_scoped_cancellation.sql`) modela:
- `kc_wallets`: contas reais com saldo inicial (`opening_balance_cents`, `opening_at`).
- `kc_titles`: obrigações/direitos futuros datados por vencimento (`due_on`), com `amount_cents`, `settled_cents`, `series_id`, `installment_index`, `installment_total`, `recurrence` (`single | installments | monthly`).
- `kc_settlements`: liquidações reais de caixa com `idempotency_key` e reversão auditável (`reversed_at`).
- `kc_recurring_rules`: regras mensais até `2099-12-31` expandidas virtualmente em `apps/web/lib/recurring.js`.
- `kc_categories`: categorias por usuário, porém com categorias padrão definidas apenas em código (`DEFAULT_CATEGORIES` em `apps/web/lib/taxonomy.js`) e **armazenadas como texto livre** (`VARCHAR(70)`) em `kc_titles.category` e `kc_titles.subcategory`.

Esse modelo não suporta:
1. **Orçamentos mensais por categoria** sem criar saldos bancários fictícios.
2. **Separação entre fato econômico (compra/receita)** e **obrigação de pagamento (título/parcela)** e **movimentação de caixa (baixa)**.
3. **Lançamento "Pago" atômico na criação** (atualmente `POST /api/portfolio` com `action: "title"` cria apenas título pendente; a baixa exige um `PATCH` separado).
4. **Identificadores estáveis de categoria** para BI e renome sem perda de histórico.
5. **Projeção patrimonial até 31/12 em dois cenários** (`contractual` vs. `within_budgets`) sem dupla contagem entre limite configurado, despesas já comprometidas e baixas realizadas.

---

## 2. Alternativas Analisadas

### Alternativa A — Evoluir `kc_titles` diretamente (sem entidade econômica separada)
Adicionar colunas `occurred_on`, `category_id`, `subcategory_id`, `purchase_group_id` e `budget_carrier` diretamente em `kc_titles`, mantendo `kc_budget_rules` / `kc_budget_periods`.

- **Prós:** Menor número de tabelas novas e menos joins para lançamentos simples (`single`).
- **Contras e Riscos Financeiros:**
  1. **Compras parceladas e dupla contagem:** Uma compra de R$ 1.200,00 em 6× gera 6 linhas em `kc_titles` (R$ 200,00 cada). Para somar o consumo no orçamento no mês da compra sem multiplicar por 6, seria necessário eleger uma linha como "portadora econômica" ou agrupar por `series_id`. Se a parcela 1/6 for cancelada (`scope = 'only'`) ou se a compra for importada a partir da parcela 4/10 (`startIndex > 1`), a agregação quebra ou perde o valor econômico original.
  2. **Edição e reclassificação:** Alterar o valor ou a categoria de uma compra parcelada exigiria atualizar múltiplas linhas em `kc_titles`, colidindo com parcelas já quitadas (`settled_cents > 0`) ou canceladas.
  3. **Mistura de semânticas:** `kc_titles` já carrega a responsabilidade de fluxo de caixa (`due_on`), liquidação (`settled_cents`) e cancelamento por escopo (`kc_cancel_title_scope`). Sobrecarregá-la com competência econômica (`occurred_on`) e estorno mercantil (`refund`) aumenta o acoplamento e o risco de regressão nas PRs #9–#12.

### Alternativa B — Separar `kc_economic_events` de `kc_titles` e `kc_settlements` (**RECOMENDADA**)
Introduzir `kc_economic_events` como a fonte única de verdade do **fato econômico** (consumo/receita), mantendo `kc_titles` como **agenda de obrigações/recebíveis** (fluxo de caixa futuro) e `kc_settlements` como **ledger de caixa realizado**.

```
kc_economic_events (1) ───────< kc_titles (1..N parcelas/ocorrências) ───────< kc_settlements (0..N baixas)
   │ occurred_on                   │ due_on                                      │ settled_on
   │ category_id / subcategory_id  │ amount_cents / settled_cents                │ amount_cents / reversed_at
   ▼                               ▼                                             ▼
Consumo de Orçamento          Contas a Pagar / Receber                     Saldo Realizado em kc_wallets
```

---

## 3. Comparação Técnica (Alternativa A vs. Alternativa B)

| Critério | Alternativa A (`kc_titles` estendida) | Alternativa B (`kc_economic_events` separada) |
|---|---|---|
| **Integridade financeira (zero dupla contagem)** | Frágil em parcelamentos e cancelamentos parciais | Garantida por construção: orçamento lê `kc_economic_events`; caixa lê `kc_settlements`; aberto lê `kc_titles` |
| **Compatibilidade com registros existentes** | Alta, mas mistura dados legados sem `occurred_on` na mesma semântica | Alta: migração aditiva; `kc_titles.economic_event_id` nullable na transição, backfill marcado como `legacy_inferred` |
| **Parcelamentos (6×) vs. Fixa mensal (2099)** | Difícil distinguir `series_id` de compra vs. recorrência no cálculo | Limpo: compra parcelada = 1 evento + N títulos; fixa mensal = 1 regra + 1 evento por competência mensal ativa |
| **Custo de consulta e armazenamento** | 1 tabela menor, mas queries de orçamento exigem `DISTINCT ON` / `GROUP BY series_id` | +1 linha por compra; índice `(user_id, occurred_on, category_id)` permite `SUM` direto e O(1) por mês |
| **Complexidade transacional** | Média na criação, alta na edição/cancelamento parcelado | Controlada via função ACID (`kc_create_financial_event`) com `idempotency_key` |
| **Auditoria e reversões** | Reverter baixa e cancelar parcela disputam estado na mesma linha | Reversão de baixa afeta apenas `kc_settlements` e `kc_titles.settled_cents`; consumo econômico permanece intacto |
| **Isolamento entre usuários (`user_id`)** | FKs compostas existentes | FKs compostas `(id, user_id)` em todas as novas tabelas e eventos |
| **Migração e rollback** | `ALTER TABLE` em `kc_titles` | Aditiva (`CREATE TABLE` + colunas nullable); rollback não destrói dados existentes |

**Decisão:** Adotar a **Alternativa B**.

---

## 4. Resolução das Decisões Abertas de Domínio

### 4.1 Estratégia de IDs estáveis para Categorias (`kc_categories`)
- **Situação atual (`EXISTENTE`):** `DEFAULT_CATEGORIES` em `apps/web/lib/taxonomy.js` gera IDs virtuais `builtin:<direction>:<name>` em `GET /api/portfolio` (`route.js:52`), enquanto `kc_titles` grava `category` e `subcategory` como `VARCHAR(70)`.
- **Decisão (`PROPOSTO`):**
  1. Adicionar `canonical_key VARCHAR(80)` e `active BOOLEAN NOT NULL DEFAULT true` em `kc_categories`, além de `UNIQUE(id, user_id)` para suportar FKs compostas.
  2. Realizar **seed idempotente por usuário** das categorias padrão em `kc_categories` (no primeiro acesso autenticado ou criação), atribuindo UUID real e `canonical_key` estável (ex.: `expense.alimentacao`, `expense.moradia`).
  3. Normalização de colisão: comparação case-insensitive e sem acentos na criação (`lower(unaccent(name))` ou normalização aplicacional) para impedir duplicatas como `"Alimentação"` vs. `"alimentacao"`.
  4. Renomear uma categoria altera apenas `kc_categories.name`; todas as referências (`kc_economic_events`, `kc_titles`, `kc_recurring_rules`, `kc_budget_rules`) apontam para `category_id` (UUID). Desativar marca `active = false`, preservando histórico em relatórios/BI.
  5. Subcategorias possuem `parent_id` apontando para categoria raiz do mesmo `user_id` e `direction` (validado por constraint/trigger ou transação).

### 4.2 Semântica das Três Datas e Dois Efeitos
- `occurred_on`: data do fato econômico (compra/consumo ou receita realizada/competência). Define o **mês calendário Brasil** do orçamento.
- `due_on`: data de vencimento da obrigação/parcela. Define o **fluxo de caixa futuro** (A pagar / A receber).
- `settled_on`: data efetiva da entrada/saída na conta (`kc_wallets`). Define o **caixa realizado**.
- **Regra invariante:** Baixar um título (`kc_settle_title`) ou reverter uma baixa (`kc_reverse_settlement`) **nunca** altera `kc_economic_events` nem o consumo do orçamento.

### 4.3 Dados Legados (`kc_titles` sem `economic_event_id`)
- Títulos legados possuem apenas `due_on` e `category` (texto).
- **Política:**
  - Não inventar `occurred_on` como se fosse data de compra verificada.
  - No backfill (BUD-01/BUD-02), criar `kc_economic_events` com `occurred_on = due_on` e `competence_source = 'legacy_inferred'` (enum: `'user_occurred_on' | 'legacy_inferred' | 'recurring_rule'`).
  - Mapear `category` texto para `kc_categories.id` via lookup normalizado; se o texto não corresponder a nenhuma categoria existente, criar/vincular à categoria do usuário ou registrar em relatório de ambiguidades sem reclassificação silenciosa.
  - Séries parceladas legadas (`recurrence = 'installments'`): agrupar por `series_id` quando todas as parcelas `1..installment_total` estiverem presentes; séries parciais (`startIndex > 1`) registram evento econômico pelo somatório das parcelas importadas, marcado como `legacy_inferred`.

### 4.4 Parcelas anteriores já pagas na importação (`startIndex > 1`)
- Ao cadastrar compra de 10× começando na parcela 4 (`startIndex = 4`), apenas as parcelas `4..10` geram `kc_titles`. O evento econômico registra o valor correspondente às parcelas assumidas no momento do cadastro (`sum(parcelas 4..10)`), com `occurred_on` informado pelo usuário, evitando gerar consumo retroativo em meses passados já fechados.

### 4.5 Limites de Categoria vs. Títulos Fixos (evitar dupla contagem)
- Orçamento é **opcional**, mensal, no nível da **categoria principal de despesa** (`parent_id IS NULL`). Subcategorias consomem o teto da categoria-mãe.
- Despesas fixas (`kc_recurring_rules`, ex.: Aluguel) não exigem orçamento próprio.
- Se o usuário configurar orçamento também para uma categoria que contém despesas fixas (ex.: `Moradia`), a projeção no modo `within_budgets` calcula:
  $$\text{residual}(c, m) = \max(0,\; \text{limite}(c, m) - \text{comprometido}(c, m))$$
  Como o aluguel já integra `comprometido(c, m)`, ele **nunca** é somado duas vezes.
- **Data presumida do gasto residual na projeção diária:** No modo `within_budgets`, o residual `max(0, limite - consumido)` é alocado de forma conservadora no **último dia do mês calendário** (`lastDayOfMonth`, ou `today` se `today` for o último dia), enquanto a curva `contractual` (obrigações reais) permanece visível para nunca mascarar dias de caixa negativo antes do fim do mês.

### 4.6 Versionamento de Orçamento
- `kc_budget_rules` armazena a regra vigente (`limit_cents`, `starts_month`, `ends_month`).
- `kc_budget_periods` armazena o teto efetivo por `(user_id, category_id, month)` com `version` (optimistic locking).
- Alterar o limite no mês corrente atualiza `kc_budget_periods` do mês corrente e meses futuros abrangidos pela regra, **sem alterar meses anteriores já fechados**.
- **Sem rollover automático:** sobra não utilizada em um mês não aumenta o limite do mês seguinte.

### 4.7 Cartão de Crédito / Fatura
- Fica **explicitamente fora do escopo** de BUD-01..07 a conciliação completa de cartão de crédito e faturas rotativas (objeto de ADR futura).
- `kc_wallets` representa exclusivamente contas bancárias/dinheiro. Não criar carteiras fictícias para cartões nem somar fatura como segundo consumo.

### 4.8 Devolução / Estorno Mercantil (`refund`) vs. Reversão de Baixa
- **Reversão de baixa (`kc_reverse_settlement`):** desfaz apenas a movimentação bancária (ex.: erro de digitação de pagamento); o consumo no orçamento permanece.
- **Devolução mercantil (`refund`):** evento econômico específico (`event_kind = 'refund'`, `parent_event_id`) que reduz o consumo líquido do orçamento na competência aplicável, separado do estorno bancário.

### 4.9 Saldo Não Confirmado e Rótulos
- `restante = limite - consumido` pode ser negativo (ultrapassagem visível, sem elevação silenciosa de teto).
- Na UI, rotular sempre como **"Restante do limite"**, nunca como "disponível para gastar". Margem segura de gasto depende de `knownCash && minCash > 0` e reserva protegida.

---

## 5. Consequências

- **Positivas:**
  - Eliminação estrutural de dupla contagem entre orçamento, títulos/parcelas, baixas e projeção 31/12.
  - Suporte nativo a registro "Pago" atômico e idempotente em 1 clique.
  - Preservação integral das funcionalidades das PRs #9–#12 (máscara BRL, período, reversão auditável, exclusão `only/future/all`, recorrências até 2099).
  - Base limpa para BI e para o futuro MCP (Issue #13) via serviços de domínio puros.
- **Negativas / Custos:**
  - Exige backfill cuidadoso dos títulos legados (`legacy_inferred`) e seed de categorias por usuário.
  - Aumenta o número de tabelas de 8 para 12 (todas aditivas e isoladas por `user_id`).
