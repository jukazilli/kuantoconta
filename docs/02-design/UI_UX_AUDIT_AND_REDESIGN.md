# Auditoria de UI/UX e Plano de Redesign Web — Kuantoconta

**Data:** 2026-11-20  
**Escopo:** Versão Web (`apps/web/app/dashboard/`), mantendo a linguagem visual de **Bento Grids** com foco em leitura rápida (< 3 segundos), hierarquia clara, eliminação de redundâncias e separação por tarefas mentais.

---

## 1. Diagnóstico Geral

A base visual atual (Bento Grids, tipografia, contraste e cards) funciona bem, mas a experiência acumulou três problemas estruturais que quebram a leitura rápida:

1. **Mistura de tarefas mentais:** `Planejamento` mistura *Orçamentos/Limites* (controle restritivo do mês atual) com *Compras planejadas* (simulação aspiracional de futuro); `Meu Capital` mistura *formação de patrimônio* com *Cartões de crédito/Faturas* (fluxo de consumo mensal).
2. **Redundância de navegação, dados e fluxos:** Mesmos controles e números aparecem repetidos em múltiplas abas e barras (ex.: `Perfil` no topo e no dock; seletor de mês no header e dentro de `Movimentos`; `Endividamento` repetido em 3 abas; `Transferir` vs. `Aporte Capital`).
3. **Poluição de micro-botões nos cards:** Botões espremidos em cabeçalhos de cards (`Sugerir limites` + `Configurar limite` + ícone `TrendingUp`), ícones que não parecem botões (`Target`), micro-botões de exclusão inline (`Trash2`) e 3 botões no cabeçalho de `Contas bancárias e carteiras`.

---

## 2. Inventário Completo de Redundâncias e Problemas por Tela/Componente

### 2.1. Shell, Header e Navegação (`Dashboard.jsx`)

- **Header em 2 blocos empilhados** ([Dashboard.jsx#L973-L1066](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L973-L1066)):
  - `.topbar` contém apenas Logo (esquerda) + Sino e Avatar (direita).
  - `.toolbar` logo abaixo contém `+ Lançamento`, `Criar`, tabbar contextual (`Compras planejadas | Limites por categoria`) e `< novembro >` + Filtros.
  - Em desktop, as duas barras ocupam espaço vertical excessivo e parecem desconectadas.
- **`Perfil` duplicado na navegação** ([Dashboard.jsx#L69](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L69) e [Dashboard.jsx#L988-L996](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L988-L996)):
  - Avatar no canto superior direito abre `profile` **e** o dock inferior (`bottom-dock`) também dedica 1 dos 6 slots principais para `Perfil`.
- **Menu `Criar` longo e técnico** ([Dashboard.jsx#L2137-L2228](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L2137-L2228)):
  - Rótulo `Criar` compete semanticamente com `+ Lançamento`.
  - Lista 7 opções com textos longos e jargão contábil (ex.: *"Novo empréstimo / financiamento — Creditar valor recebido e gerar parcelas no endividamento"*).

### 2.2. Visão Geral (`active === "overview"`, [Dashboard.jsx#L1086-L1261](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1086-L1261))

- **Card `Saldos em conta`** ([L1220-L1258](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1220-L1258)):
  - Possui 2 botões de ícone no cabeçalho (`SlidersHorizontal` para gerenciar contas e `Plus` para nova conta).
  - As linhas das contas (`.account-row`) são estáticas e não clicáveis.
- **Filtro global de Endividamento escondido** ([L2368-L2385](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L2368-L2385)):
  - A opção `Composição do endividamento` (`Todos os compromissos` vs `Apenas dívidas financeiras`) só aparece no modal de filtro da aba `overview`, embora o KPI `Endividamento` apareça também em `planning` e `patrimony`.

### 2.3. Movimentos (`active === "movements"`, [Dashboard.jsx#L1263-L1319](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1263-L1319) e [MovementList.jsx](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/MovementList.jsx))

- **Navegador de mês duplicado** ([Dashboard.jsx#L1307-L1315](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1307-L1315)):
  - `.movements-period-nav` (`‹ novembro de 2026 ›`) aparece dentro do card da lista logo abaixo do `.month-nav` que já está na barra superior.
- **Copy desatualizado no estado vazio** ([MovementList.jsx#L15](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/MovementList.jsx#L15)):
  - Texto orienta `"Use + A pagar ou + A receber para começar"`, mas esses botões não existem mais no topo (foram unificados em `+ Lançamento`).

### 2.4. Planejamento (`active === "planning"`, [Dashboard.jsx#L1321-L1522](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1321-L1522))

- **Sub-tabbar misturando tarefas mentais** ([L1010-L1031](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1010-L1031)):
  - `Compras planejadas` (planejamento de futuro) e `Limites por categoria` (orçamento mensal) dividem a mesma aba.
- **KPI `Endividamento total` repetido** ([L1338](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1338)):
  - Repete o mesmo dado de `Visão geral` e `Meu Capital` em vez de mostrar um indicador direto de planejamento/orçamento.
- **Card `Divisão inteligente da renda` congestionado** ([L1406-L1457](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1406-L1457)):
  - Cabeçalho empilha eyebrow, título, `Sugerir limites`, `Configurar limite` e ícone `TrendingUp` (`openCapitalTransfer`).
- **Acesso a `Compras planejadas` com ícone genérico** ([L1350-L1352](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1350-L1352)):
  - Botão `+` sem rótulo; enquanto o empty state abaixo ([L1400](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1400)) cita `"+ Novo planejamento"`, texto que não corresponde a nenhum botão visível.

### 2.5. Meu Capital (`active === "patrimony"`, [Dashboard.jsx#L1524-L1814](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1524-L1814))

- **Card `Metas de capital`** ([L1546-L1610](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1546-L1610)):
  - Botão de criação usa apenas o ícone `Target` ([L1552](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1552)), sem aparência clara de ação clicável.
  - Cada card tem micro-botão inline `Trash2` ([L1580](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1580)) para remover, em vez de abrir detalhe ao clicar no card (como já acontece em `Compras planejadas`).
  - Conceitualmente, formar objetivos/metas pertence a **Planejamento** (modelo "Guardar dinheiro / Caixinhas"), enquanto `Meu Capital` deveria consolidar resultados e patrimônio.
- **Card `Contas bancárias e carteiras`** ([L1631-L1680](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1631-L1680)):
  - 3 micro-botões no cabeçalho (`TrendingUp` aporte, `SlidersHorizontal` gerenciar, `Plus` nova conta).
  - Linhas das contas (`.account-panel-row`) não são clicáveis para gerenciamento direto.
- **Card `Cartões de crédito` fora de contexto** ([L1682-L1738](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1682-L1738)):
  - Cartões e faturas são passivos de giro/consumo mensal, sem relação direta com formação de capital/patrimônio.
  - Empty state ([L1736](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1736)) ainda referencia `Criar → Cartão de crédito`.

### 2.6. Saúde Financeira (`active === "health"`, [Dashboard.jsx#L1816-L2001](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1816-L2001))

- **Redundância no modal de diagnóstico** ([HealthDiagnosisCard.jsx](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/HealthDiagnosisCard.jsx)):
  - Ao clicar em `Estado financeiro`, o modal exibe `HealthDiagnosisCard`, que repete os 4 mesmos indicadores já visíveis nos cards da tela (`Dívida restante`, `Comprometimento`, `Reserva líquida`, `Próxima mudança`).
- **Componente órfão / código duplicado** ([PlanningGoalsPanel.jsx](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/PlanningGoalsPanel.jsx)):
  - Apenas `section="health"` é utilizado no modal de marcos ([Dashboard.jsx#L2567](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L2567)); toda a parte `section="goals"` (linhas 55–83 e 220–323) duplica o simulador que hoje vive em `EntryDrawer.jsx` (`goal_sim`).
- **Botão de filtro sem efeito na tela**:
  - Na aba `health`, o botão de filtros na toolbar continua ativo, mas não há filtros específicos de saúde no modal (`L2351-L2446`).

### 2.7. Modais e Fluxos de Entrada (`EntryDrawer.jsx`, `GuidedTour.jsx`, `lib/notifications.js`)

- **Dois fluxos para movimentar saldo entre contas** ([EntryDrawer.jsx#L213-L311](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L213-L311) vs. [L485-L497](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L485-L497)):
  - `intent === "transfer"` (em `+ Lançamento`) e `drawer === "transfer_capital"` ("Aporte para Carteira de Capital") fazem a mesma operação de transferência entre carteiras.
  - Notificações ([Dashboard.jsx#L2478](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L2478) e [notifications.js#L113](file:///c:/projetos/kuantoconta/apps/web/lib/notifications.js#L113)) ainda disparam `openCapitalTransfer()`.
- **Notificações de orçamento levam para a tela errada** ([notifications.js#L77-L85](file:///c:/projetos/kuantoconta/apps/web/lib/notifications.js#L77-L85)):
  - Alertas de orçamento estourado ou em 80% apontam para `targetTab: "planning"`, mas sem trocar `planningView` para `"budgets"`, fazendo o usuário cair em `Compras planejadas` quando clicava para ver o orçamento estourado.
- **Copy desatualizado em texto de ajuda** ([EntryDrawer.jsx#L217](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L217)):
  - Cita `"Criar › Nova conta"`.
- **Formulário de empréstimo verboso** ([EntryDrawer.jsx#L508-L528](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L508-L528)):
  - Rótulos técnicos ("Valor recebido", "Creditar o valor recebido na conta selecionada", "Conta vinculada", "Custo financeiro / juros totais").
- **Tour guiado com referências antigas** ([GuidedTour.jsx#L5-L46](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/GuidedTour.jsx#L5-L46)):
  - Passos 1 e 4 citam `"Criar"` e `"Em Planejamento você define limites por categoria"`.

### 2.8. Sistema de Botões Fragmentado e `:hover` em Touch (`globals.css`)

- **12 classes de botão diferentes competindo na UI** ([globals.css](file:///c:/projetos/kuantoconta/apps/web/app/globals.css)):
  - `.pill-primary`, `.pill-secondary`, `.pill-outline-orange`, `.pill-compact`, `.soft-pill`, `.mini-pill`, `.tiny-btn`, `.icon-ghost-btn`, `.dark-button`, `.light-button`, `.primary-button`, `.save-pill` e `.text-button`.
  - `.icon-ghost-btn` (`34x34px` sem rótulo) está sendo usado para ações primárias de negócio (criar meta `Target`, efetivar aporte `TrendingUp`, abrir Tesouraço `Scissors`, criar compra planejada `Plus`), tornando-as invisíveis para o usuário.
  - `.tiny-btn` (micro-botão cinza) é usado tanto para atalhos de data (`Até 31/12`) quanto para ações destrutivas (`Trash2` em metas de capital) e criação (`+ Adicionar` em Bens e imóveis).
- **Efeitos `:hover` sem media query `@media (hover: hover)` e tooltip dependente de hover** ([globals.css#L143-L1620](file:///c:/projetos/kuantoconta/apps/web/app/globals.css#L143)):
  - Existem 15 regras `:hover` globais (incluindo `transform: translateY(-2px)` em `.clickable-card:hover` e `.metric-card.clickable:hover`).
  - Na Linha do Tempo de Saúde Financeira ([globals.css#L348](file:///c:/projetos/kuantoconta/apps/web/app/globals.css#L348)), `.health-timeline-tip` depende de `:hover` / `:focus-visible`, escondendo a explicação do marco em telas touch.

### 2.9. Auditoria de Copy, Terminologia e Jargões Contábeis

| Onde aparece | Copy atual (jargão / inconsistente) | Copy recomendado (linguagem humana) |
| :--- | :--- | :--- |
| [MovementList.jsx#L15](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/MovementList.jsx#L15) | `"Use + A pagar ou + A receber para começar."` | `"Use + Lançamento no topo para registrar sua primeira conta ou receita."` |
| [MovementList.jsx#L26](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/MovementList.jsx#L26) | `"Ver título quitado"` / `"Baixa rápida"` / `"Baixa total ou parcial"` | `"Ver lançamento pago"` / `"Marcar como pago"` / `"Confirmar pagamento"` |
| [Dashboard.jsx#L1301](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1301) | `"Buscar título ou categoria"` | `"Buscar lançamento ou categoria"` |
| [CancelScopeDialog.jsx#L25](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/CancelScopeDialog.jsx#L25) | `"Este título já está totalmente baixado. Desfaça a baixa..."` | `"Este lançamento já foi pago/recebido. Desfaça o pagamento antes de excluir..."` |
| [Dashboard.jsx#L589](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L589) | `"Simulação removida."` (mesmo ao excluir uma Meta de Capital) | Mensagem contextual: `"Objetivo removido."` ou `"Planejamento de compra removido."` |
| [Dashboard.jsx#L829](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L829) | `"Operação salva. Os valores e as projeções foram atualizados."` | `"Salvo com sucesso."` |
| [Dashboard.jsx#L857](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L857) | `"Exclusão confirmada. Obrigações pendentes canceladas: X."` | `"Lançamento excluído."` |
| [EntryDrawer.jsx#L384-L396](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L384-L396) | Mistura `"Origem da receita"` vs. `"De qual orçamento sai?"` vs. `"Novo orçamento"` | Padronizar **Categoria** para classificar o lançamento (com indicação do limite disponível da categoria). |
| [Dashboard.jsx#L1804](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L1804) | `"Bens e imóveis (secundário)"` | `"Bens e imóveis"` (remover a palavra técnica `"(secundário)"` do título visível ao usuário). |

### 2.10. Código Morto, Componentes Órfãos e `window.confirm`

1. **`actionMenu === "add"` nunca é aberto** ([Dashboard.jsx#L2093-L2135](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L2093-L2135)):
   - O modal com `"Gastei"`, `"Tenho uma conta"` e `"Transferência"` está morto no código porque o botão `+ Lançamento` chama `open("title", null, "bill")` diretamente.
2. **`OnboardingModal.jsx` (367 linhas) está órfão** ([OnboardingModal.jsx](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/OnboardingModal.jsx)):
   - Não é importado nem renderizado por nenhum arquivo em `apps/web`.
3. **Simulador duplicado em `PlanningGoalsPanel.jsx`** ([PlanningGoalsPanel.jsx#L55-L83, L174-L320](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/PlanningGoalsPanel.jsx#L174-L320)):
   - O bloco `section="goals"` nunca é usado (substituído pelo drawer `goal_sim`).
4. **Fluxo `intent === "plan"` (`spending_plan`) sem entrada na UI** ([EntryDrawer.jsx#L97-L98](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L97-L98), [Dashboard.jsx#L750-L759](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L750-L759)):
   - Os 4 cards do `EntryDrawer` são `A pagar`, `A receber`, `Transferir` e `Emprestar`; não há botão para escolher `intent === "plan"`.
5. **Fluxo `drawer === "liability"` residual** ([EntryDrawer.jsx#L144, L506](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L144) e [Dashboard.jsx#L748](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L748)):
   - Substituído por `drawer === "loan"`, sem gatilho na interface.
6. **Uso de `window.confirm()` nativo** ([Dashboard.jsx#L633, L866, L882](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L866)):
   - Quebra a consistência visual com os modais da aplicação ao desfazer pagamento ou encerrar recorrência.

---

## 3. Arquitetura Proposta (Web)

### 3.1. Nova Navegação Principal (Dock sem `Perfil`)

Remover `Perfil` do `bottom-dock` (mantendo o acesso exclusivamente no avatar do topo) e separar claramente **Orçamentos** de **Planejamento**:

| Aba | Pergunta que responde | O que contém |
| :--- | :--- | :--- |
| **Visão geral** | *Como está meu mês hoje?* | KPIs principais, Próximos compromissos, Limites resumidos, Cartões/Faturas do mês, Gráficos e Contas bancárias clicáveis. |
| **Movimentos** | *O que entrou, saiu ou vence?* | Extrato unificado com filtros (sem navegador de mês duplicado). |
| **Orçamentos** *(nova)* | *Quanto ainda posso gastar neste mês?* | Divisão inteligente da renda, Limites por categoria (`BudgetList`), Evolução mês a mês. |
| **Planejamento** | *O que quero conquistar ou comprar?* | **Guardar dinheiro (Caixinhas/Objetivos)** no estilo Nubank + **Compras planejadas** (simulador). |
| **Meu Capital** | *Quanto patrimônio acumulei?* | Capital formado, Projeção de capital, Evolução patrimonial, Contas/Carteiras clicáveis, Empréstimos a terceiros, Patrimônio líquido e Bens. *(Sem cartões de crédito.)* |
| **Saúde financeira** | *Qual meu risco e onde cortar?* | Estado financeiro, Reserva líquida, Comprometimento, Marcos de recuperação, Dedo Duro e Tesouraço. |

### 3.2. Shell / Header Unificado em 1 Linha (Desktop)

- Ao mover `Limites por categoria` para a aba **Orçamentos**, a sub-tabbar do header desaparece.
- Em telas desktop (`>= 1024px`), unificar `.topbar` e `.toolbar` em **uma única barra horizontal**:
  - **Esquerda:** Brand `kuantoconta` + `+ Lançamento` + `Novo`
  - **Centro:** `< novembro >` + Botão de Filtros (e chip de período customizado, se ativo)
  - **Direita:** Sino de Notificações + Avatar (`Perfil`)

### 3.3. Padrão de Ações Limpo (Zero Micro-botões e 4 Variantes de Botão)

1. **Consolidação do Sistema de Botões (de 12 classes para 4 papéis claros):**
   - **Primário (`.pill-primary`)**: CTA principal da tela ou modal (ex.: `+ Lançamento`, `Sugerir limites`, `Salvar`).
   - **Secundário / Outline (`.pill-secondary` / `.pill-outline-orange`)**: Ação secundária sempre com **rótulo de texto claro** (ex.: `Novo`, `+ Nova caixinha`, `+ Simular compra`).
   - **Ícone de Navegação (`.icon-ghost-btn`)**: Restrito exclusivamente a controles de navegação e fechamento (`<`, `>`, `X`, `MoreHorizontal`, `ChevronRight`). Proibido usar ícone solto sem rótulo para criar entidades ou mover dinheiro.
   - **Destrutivo**: Ações de exclusão/arquivamento posicionadas sempre **dentro do modal de detalhe/gerenciamento**, nunca como micro-ícone `Trash2` (`tiny-btn`) solto no card.
2. **Botão `Criar` → `Novo` (6 itens enxutos):**
   - **Cartão de crédito** — *Limite, fechamento e faturas*
   - **Conta ou carteira** — *Banco, dinheiro ou reserva*
   - **Orçamento mensal** — *Teto de gastos por categoria*
   - **Planejamento de compra** — *Simular melhor momento para comprar*
   - **Caixinha / Objetivo** — *Guardar dinheiro com meta e prazo*
   - **Empréstimo ou financiamento** — *Registrar crédito e gerar parcelas*
   - *(Patrimônio / Bem pode ficar dentro de Meu Capital → Bens ou como 7º item compacto.)*
3. **Aporte unificado em `Transferir`:**
   - Eliminar `drawer === "transfer_capital"` e todos os botões `TrendingUp` de aporte espalhados.
   - Usar `+ Lançamento → Transferir` com destaque visual para contas `Reserva / Capital` no destino (inclusive ao clicar na notificação de guardar dinheiro).
4. **Cards clicáveis em vez de botões espalhados:**
   - **Contas bancárias:** clicar na conta abre gerenciamento (`ManageWalletsModal` / detalhe da conta), removendo os 3 ícones do header do card.
   - **Caixinhas / Objetivos e Compras planejadas:** clicar no card abre o modal de detalhe (com ações de editar, guardar/transferir ou excluir), removendo `Trash2` inline e ícones soltos `Target`.
   - **Card Divisão inteligente da renda (`Orçamentos`):** apenas 1 CTA claro no cabeçalho (`Sugerir limites` ou `Ajustar limites`).

---

## 4. Plano de Execução Sugerido (para `/goal`)

1. **Fase 1 — Shell, Navegação, Menu `Novo` e Notificações:**
   - Unificar `.topbar` + `.toolbar` em 1 linha no desktop, remover `Perfil` do dock, criar aba `Orçamentos`, renomear `Criar` → `Novo` e simplificar opções/textos (incluindo `Empréstimo ou financiamento` e `GuidedTour.jsx`).
   - Atualizar `lib/notifications.js` para direcionar alertas de orçamento para a nova aba `budgets` e o lembrete de reserva para o fluxo unificado de `Transferir`.
2. **Fase 2 — Limpeza de Redundâncias, Micro-botões e Sistema de Botões:**
   - Remover `.movements-period-nav` duplicado, remover `transfer_capital` e botões `TrendingUp` (unificando em `Transferir`), limpar card `Divisão inteligente da renda`, tornar contas bancárias clicáveis, mover `Cartões de crédito` de `Meu Capital` para `Visão geral`, e remover `Endividamento` duplicado onde não agrega.
   - Padronizar botões nos cabeçalhos dos cards (com rótulo legível onde houver ação de criação) e isolar efeitos `:hover` em `@media (hover: hover) and (pointer: fine)` + tornar tooltips da Linha do Tempo legíveis sem depender de hover.
3. **Fase 3 — Planejamento com Caixinhas, Revisão de Copy e Limpeza de Código Morto:**
   - Transformar `Metas de capital` em **Guardar dinheiro (Caixinhas)** dentro de `Planejamento` com modal de detalhe (sem `Trash2` inline).
   - Aplicar a revisão completa de copy (Tabela 2.9: eliminar jargões *"título"*, *"baixa"*, *"obrigações pendentes"*, *"Simulação removida"* ao apagar meta, e padronizar *"Categoria"* vs. *"Orçamento"*).
   - Remover código morto/órfão (`actionMenu === "add"`, `drawer === "transfer_capital"`, `drawer === "liability"`, `PlanningGoalsPanel.jsx` `section="goals"` e redundâncias em `HealthDiagnosisCard.jsx`).
4. **Fase 4 — Verificação:**
   - Rodar suíte de testes (`npm test`) e validação visual em desktop e mobile garantindo conformidade com a regra de zero `:hover` em mobile e responsividade dos Bento Grids.
