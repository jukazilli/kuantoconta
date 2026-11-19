# Auditoria de Migração UI V2 — kuantoconta

**Data:** 18/11/2026  
**Branch base:** `docs/dashboard-visual-reference-2026-11-18`  
**Branch de implementação:** `feat/kuantoconta-ui-v2`  
**Referência visual:** `references/kuantoconta-v2/dashboard.html`, `design-tokens.json`, `visual-guide.md`

---

## 1. Resumo da Inspeção Código Real × Referência V2

A inspeção completa de `Dashboard.jsx`, `FinanceChart.jsx`, `HealthDiagnosisCard.jsx`, `PlanningGoalsPanel.jsx`, `BudgetList.jsx`, `MovementList.jsx`, `EntryDrawer.jsx` e `globals.css` revela as seguintes diferenças estruturais entre a V1 atual e a referência visual V2:

| Aspecto | V1 Atual (`apps/web/app/dashboard`) | Referência V2 (`references/kuantoconta-v2/dashboard.html`) | Decisão de Migração |
|---|---|---|---|
| **Navegação principal** | Dupla: `top-nav` (5 abas) + `rail` lateral esquerda + botão Sair | Dock flutuante centralizada no rodapé com 6 destinos (`Visão geral`, `Movimentos`, `Planejamento`, `Patrimônio`, `Saúde financeira`, `Perfil`) | Adotar dock inferior com 6 destinos; remover `top-nav`, `rail` e aba `Cadastros`; renomear `Conta` para `Perfil`. |
| **Cabeçalho da Visão geral** | `eyebrow` + `H1` grande + `range-picker` (`Início` / `Fim` / `Fim do ano`) | Logo à esquerda; `V1 · Preview` + Avatar à direita; botões `Adicionar` e `Criar` à esquerda; `Início/Fim` + `< mês >` + botão de filtro separado à direita | Reproduzir cabeçalho V2. Manter filtro personalizado de datas dentro do popover de filtro, preservando `rangeStart`/`date` e projeção anual no domínio. |
| **Visão geral — Saúde Financeira** | `HealthDiagnosisCard` em largura total no topo | Ausente na Visão geral (mantida limpa) | Mover `HealthDiagnosisCard` + Marcos de recuperação + Capacidade alocável para a nova aba **Saúde financeira**. |
| **Visão geral — KPIs** | 4 cards em grid (`A pagar` laranja, `Patrimônio projetado`, `Resultado do período`, `A receber`) | 3 cards compactos à esquerda: `A pagar`, `A receber`, `Endividamento` (monetário) | Na Visão geral: `A pagar`, `A receber` e `Endividamento` (`healthPlan.diagnosis.indicators.outstandingDebtCents`). `Patrimônio projetado` vai para **Patrimônio**; `Resultado do período` permanece em **Movimentos** e **Planejamento**. |
| **Visão geral — Gráfico de linha** | `Saldo e patrimônio projetado` (ECharts `line`) | Ausente na Visão geral | Mover o gráfico de evolução patrimonial (`FinanceChart type="line"`) e alerta `firstNegative` para a aba **Patrimônio**. |
| **Visão geral — Gráfico de barras** | `Receitas e despesas` (ECharts `bar` com barras estreitas `#FA6A43` e `#1B1C18`) | No HTML há barras grossas ilustrativas | **Exceção obrigatória:** preservar `FinanceChart` ECharts com duas séries, barras finas (`barMaxWidth`), cores coral e carvão `#1B1C18`, tooltips BRL. |
| **Ações primárias** | Botão `+ Adicionar` dentro do card *Próximos compromissos*; `+ Nova conta` no card *Saldos em conta*; `+ Adicionar` ativos/passivos em *Cadastros* | `Adicionar` (`Gastei`, `Vou gastar`, `Tenho uma conta`) e `Criar` (`Nova conta`, `Novo limite`, `Nova meta`) no toolbar | Conectar `Adicionar` ao `EntryDrawer` com as 3 intenções ADR-010; conectar `Criar` a fluxos contextuais reais (nova conta, definir limite de categoria, nova meta/simulação e acesso a ativos/passivos). |

---

## 2. Inventário Completo de Elementos e Plano de Realocação

### 2.1. Diagnóstico de Saúde Financeira (`HealthDiagnosisCard`)
1. **Nome e funcionalidade:** Diagnóstico do estado financeiro (`red`, `orange`, `blue`, `green`, `unknown`), razões principais (`reasonCodes`), 4 mini-indicadores (`Dívida restante`, `Comprometimento`, `Reserva líquida`, `Próxima mudança`) e alertas de completude de dados (`dataQuality`).
2. **Componente responsável:** `HealthDiagnosisCard.jsx`.
3. **Estados, eventos e dependências:** Recebe `healthPlan` (derivado via `buildFinancialHealthPlan(data, { today, previousSnapshot })`) e `onOpenPlanning`.
4. **Dados e APIs utilizados:** `GET /api/portfolio` -> `wallets`, `titles`, `settlements`, `recurringRules`, `assets`, `liabilities`, `debtPayments`, `latestHealthSnapshot`.
5. **Localização anterior:** Topo da aba `overview` (`Visão geral`), ocupando largura total.
6. **Nova localização:** Aba dedicada **Saúde financeira** (`active === "health"`).
7. **Como o usuário acessará:** Clicando em **Saúde financeira** na dock inferior.
8. **Critério de aceite:** Todos os 5 estados, razões, 4 indicadores e notas de `dataQuality` renderizam com os dados reais na aba **Saúde financeira**, e o botão contextual direciona para **Planejamento**.

### 2.2. Marcos do Plano e Capacidade Alocável (`PlanningGoalsPanel` — seções 1 e 2)
1. **Nome e funcionalidade:** `Marcos do plano` (`firstCoveredMonth`, `firstSavingMonth`, `firstStableMonth`) e `Motor de prioridades` (`eligibleTodayCents`, `projectedMonthlyCents`, lista de `proposals` com `options`).
2. **Componente responsável:** `PlanningGoalsPanel.jsx` (seções 1 e 2).
3. **Estados, eventos e dependências:** Depende de `healthPlan.milestones` e `healthPlan.allocation`.
4. **Dados e APIs utilizados:** `GET /api/portfolio` via `buildFinancialHealthPlan`.
5. **Localização anterior:** Final da aba `planning` (`Planejamento`).
6. **Nova localização:** Aba **Saúde financeira** (junto ao `HealthDiagnosisCard`), mantendo link contextual em **Planejamento** para acesso rápido.
7. **Como o usuário acessará:** Via aba **Saúde financeira** na dock ou botão contextual em **Planejamento**.
8. **Critério de aceite:** Os 3 marcos de recuperação e as recomendações alocáveis aparecem intactos em **Saúde financeira** sem duplicar lógica de cálculo.

### 2.3. Planejador Inteligente / Simulador de Compras (`PlanningGoalsPanel` — seção 3)
1. **Nome e funcionalidade:** Simulação de compra/objetivo (`simulateGoalPurchase`), comparação de cenários, gargalo (`bottleneckDate`), gravação (`POST /api/portfolio` `action: "goal"`) e exclusão (`PATCH` `action: "cancel_goal"`).
2. **Componente responsável:** `PlanningGoalsPanel.jsx` (seção 3 — pode ser isolada via prop `section="goals"` ou mantida em **Planejamento**).
3. **Estados, eventos e dependências:** `goalForm`, `liveSimulation`, `onSaveGoal`, `onCancelGoal`, `busy`.
4. **Dados e APIs utilizados:** `rawData`, `healthPlan.goals`, `POST /api/portfolio`, `PATCH /api/portfolio`.
5. **Localização anterior:** Final da aba `planning`.
6. **Nova localização:** Permanece na aba **Planejamento** e é alcançável pelo item `Nova meta` do botão **Criar** no cabeçalho.
7. **Como o usuário acessará:** Aba **Planejamento** ou botão **Criar → Nova meta**.
8. **Critério de aceite:** Usuário consegue simular, salvar e remover metas sem gerar cobranças reais, inclusive partindo do botão **Criar → Nova meta**.

### 2.4. Patrimônio Projetado (KPI + Gráfico de Evolução + Bens e Dívidas)
1. **Nome e funcionalidade:**
   - KPI `Patrimônio projetado` (`summary.netWorthPartial` até a data)
   - Gráfico de linha `Saldo e patrimônio projetado` (`FinanceChart type="line"` + alerta `summary.firstNegative`)
   - Cadastro e listagem de `Bens e investimentos` (`summary.assets`, `drawer="asset"`) e `Dívidas declaradas` (`summary.liabilities`, `drawer="liability"`).
2. **Componentes responsáveis:** `Dashboard.jsx` (cards e `FinanceChart.jsx`) e `EntryDrawer.jsx` (`drawer === "asset" | "liability"`).
3. **Estados, eventos e dependências:** `summary.netWorthPartial`, `summary.knownCash`, `summary.firstNegative`, `charts`, `summary.assets`, `summary.liabilities`, `open("asset")`, `open("liability")`.
4. **Dados e APIs utilizados:** `GET /api/portfolio`, `POST /api/portfolio` (`action: "asset" | "liability"`).
5. **Localização anterior:** KPI e gráfico na aba `overview`; Bens e Dívidas na aba `registers` (`Cadastros`).
6. **Nova localização:** Aba dedicada **Patrimônio** (`active === "patrimony"`).
7. **Como o usuário acessará:** Clicando em **Patrimônio** na dock inferior.
8. **Critério de aceite:** Usuário visualiza patrimônio líquido projetado, gráfico de evolução com alerta de déficit, lista/totais de bens e dívidas, e consegue cadastrar novos ativos e passivos sem perda de funcionalidade.

### 2.5. Cadastro de Contas Bancárias (`wallets`)
1. **Nome e funcionalidade:** Listagem de contas com saldo de abertura datado e criação de nova conta (`drawer="wallet"`).
2. **Componentes responsáveis:** `Dashboard.jsx` e `EntryDrawer.jsx`.
3. **Estados, eventos e dependências:** `wallets`, `walletBalance(w)`, `open("wallet")`, `submit` (`action: "wallet"`).
4. **Dados e APIs utilizados:** `GET /api/portfolio`, `POST /api/portfolio` (`action: "wallet"`).
5. **Localização anterior:** Card `Saldos em conta` na `overview` e aba `registers` (`Cadastros`).
6. **Nova localização:**
   - Resumo preservado no card `Saldos em conta` da **Visão geral** (com botão `+ Nova conta`).
   - Botão **Criar → Nova conta** no cabeçalho global.
   - Visão consolidada de contas também visível em **Patrimônio** (com botão `+ Nova conta`).
7. **Como o usuário acessará:** Pelo botão **Criar → Nova conta**, pelo botão `+ Nova conta` no card `Saldos em conta` da Visão geral, ou na aba **Patrimônio**.
8. **Critério de aceite:** Criar uma conta atualiza imediatamente `Saldos em conta`, `Patrimônio` e os seletores do `EntryDrawer`.

### 2.6. Resultado do Período e Detalhamento
1. **Nome e funcionalidade:** `summary.periodResult` (entradas menos saídas no período selecionado) e tabela/resumo mensal.
2. **Componente responsável:** `Dashboard.jsx`.
3. **Estados, eventos e dependências:** `summary.periodResult`, `summary.receivable.total`, `summary.payable.total`, `months`.
4. **Dados e APIs utilizados:** `computeRange` sobre `expanded` (`GET /api/portfolio`).
5. **Localização anterior:** KPI `Resultado do período` na `overview` e cards na aba `planning`.
6. **Nova localização:** Aba **Planejamento** (KPIs e tabela mês a mês) e resumo contextual no topo da aba **Movimentos**.
7. **Como o usuário acessará:** Acessando **Movimentos** ou **Planejamento** na dock.
8. **Critério de aceite:** O resultado do período continua calculado pelo mesmo `computeRange` e visível em **Movimentos** e **Planejamento**.

### 2.7. Categorias e Subcategorias
1. **Nome e funcionalidade:** Criação controlada de categorias de receita/despesa (com opção de limite mensal) e subcategorias vinculadas.
2. **Componentes responsáveis:** `EntryDrawer.jsx` (modal interno `quick === "category" | "subcategory"`) e `Dashboard.jsx` (`addCategory`).
3. **Estados, eventos e dependências:** `categories`, `quick`, `newName`, `trackBudget`, `quickLimit`, `onAddCategory`.
4. **Dados e APIs utilizados:** `POST /api/portfolio` (`action: "category"`).
5. **Localização anterior:** Inline no `EntryDrawer` via botão `+`.
6. **Nova localização:** Mantido contextualmente dentro do `EntryDrawer` (acessível por **Adicionar** e edição de lançamentos) e via **Criar → Novo limite** (que permite configurar limite em categoria existente ou criar categoria com limite).
7. **Como o usuário acessará:** Botão `+` ao lado de Categoria/Subcategoria no `EntryDrawer`, ou **Criar → Novo limite**.
8. **Critério de aceite:** Nenhuma categoria ou subcategoria fica inacessível após a remoção de `Cadastros`.

### 2.8. Seletor de Período Personalizado e Atalho "Fim do ano"
1. **Nome e funcionalidade:** Seleção de `rangeStart` e `date` personalizados, além do cálculo de projeção até 31/12.
2. **Componente responsável:** `Dashboard.jsx`.
3. **Estados, eventos e dependências:** `rangeStart`, `date`, `selectMonth(delta)`, `END`.
4. **Dados e APIs utilizados:** `expandRecurring` e `computeRange`.
5. **Localização anterior:** Inputs fixos `Início`, `Fim` e botão `Fim do ano` no topo da tela.
6. **Nova localização:**
   - Na barra do cabeçalho: exibição compacta `Início | Fim`, navegação `< mês >` com chevrons (mudando mês e ano) e botão **Filtro** separado.
   - Dentro do popover do botão **Filtro**: campos de data personalizados (`Início` e `Fim`), botão de atalho para fim do ano dentro do filtro (não exposto como botão solto no cabeçalho) e filtros de visualização.
7. **Como o usuário acessará:** Clicando nos chevrons `<` `>` para mudar mês/ano, ou clicando no ícone de **Filtro** para intervalo personalizado.
8. **Critério de aceite:** Chevrons avançam/recuam meses inclusive na virada de ano (dezembro ↔ janeiro); filtros de data atualizam `rangeStart`/`date` e recalculam os KPIs e gráficos.

### 2.9. Perfil (antiga aba Conta)
1. **Nome e funcionalidade:** Dados do usuário (`user.name`, `user.email`), links de `Termos de Uso` (`/legal/terms`) e `Aviso de Privacidade` (`/legal/privacy`), aviso de prévia e botão `Sair da conta` (`authClient.signOut()`).
2. **Componente responsável:** `Dashboard.jsx`.
3. **Estados, eventos e dependências:** `user`, `authClient.signOut()`.
4. **Dados e APIs utilizados:** Sessão Neon Auth.
5. **Localização anterior:** Aba `Conta` (`active === "account"`) + botão Sair na `rail` lateral.
6. **Nova localização:** Aba **Perfil** (`active === "profile"`) na dock inferior e clique no Avatar no canto superior direito.
7. **Como o usuário acessará:** Clicando em **Perfil** na dock ou no Avatar no topo direito.
8. **Critério de aceite:** Dados do perfil, links legais e logout funcionam perfeitamente pela aba **Perfil** e pelo Avatar.

### 2.10. Compromissos, Orçamentos e Ações de Baixa/Exclusão
1. **Nome e funcionalidade:** `MovementList` (detalhes, editar, duplicar, baixa parcial/total, reversão de baixa, encerrar recorrência, exclusão por escopo `CancelScopeDialog`) e `BudgetList` (limites mensais, planos de gasto, drill-down).
2. **Componentes responsáveis:** `MovementList.jsx`, `BudgetList.jsx`, `EntryDrawer.jsx`, `CancelScopeDialog.jsx`.
3. **Estados, eventos e dependências:** `rows`, `filter`, `query`, `selectedTitle`, `cancelTarget`, `open`, `handleAction`.
4. **Dados e APIs utilizados:** `PATCH /api/portfolio` (`settle`, `edit`, `reverse`, `stop_recurring`, `cancel_scope`, `update_spending_plan`, `cancel_spending_plan`), `POST /api/portfolio` (`budget`, `spending_plan`).
5. **Localização anterior:** `Visão geral` (resumo compacto) + `Movimentos` + `Planejamento`.
6. **Nova localização:** Preservados exatamente nessa organização: resumo na **Visão geral** (`Próximos compromissos` com botão `Carteira`, e `Limites mensais` com botão `Gerenciar`), lista completa em **Movimentos** e gestão completa de limites em **Planejamento**.
7. **Como o usuário acessará:** Diretamente na **Visão geral** (atalhos) ou pelas abas **Movimentos** e **Planejamento**.
8. **Critério de aceite:** Fluxos de criar, editar, baixar, reverter, duplicar e excluir por escopo permanecem 100% operacionais.
