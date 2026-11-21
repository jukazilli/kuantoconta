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

---

## 5. Auditoria de Engenharia: O Caminho do Dinheiro (9 Falhas Mapeadas)

Auditoria forense ponta a ponta nas migrations PL/pgSQL (`apps/web/db/001` a `016`), backend (`apps/web/lib/portfolio-service.js`) e motores de cálculo (`finance.js`, `period.js`, `reconciliation.js`, `budgets.js`, `goal-planner.js`, `Dashboard.jsx`).

### 5.1. O Que Funciona Bem
- Aritmética inteira em centavos (`BIGINT`) e idempotência (`idempotency_key` + `FOR UPDATE`) em `kc_create_financial_event` e `kc_settle_title`.
- Estorno atômico (`kc_reverse_settlement`) preservando histórico via `reversed_at` e restaurando `settled_cents`.
- Espelhamento automático por `transfer_id` entre contas de origem e destino ao baixar, desfazer ou cancelar transferências e reservas em caixinhas.

### 5.2. As 9 Falhas Encontradas

1. **[CRÍTICA] Transferências e Reservas em Caixinhas inflam "A pagar", "A receber" e "Despesas por categoria"**
   - **Arquivos:** [period.js](file:///c:/projetos/kuantoconta/apps/web/lib/period.js#L24-L35), [period.js#L121-L125](file:///c:/projetos/kuantoconta/apps/web/lib/period.js#L121-L125), [finance.js#L35-L47](file:///c:/projetos/kuantoconta/apps/web/lib/finance.js#L35-L47), [Dashboard.jsx#L284-L292](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L284-L292).
   - **Causa:** `Dashboard.jsx` passa a lista bruta `expanded` (sem filtrar `NON_CONSUMPTION_KINDS` do [reconciliation.js](file:///c:/projetos/kuantoconta/apps/web/lib/reconciliation.js#L75-L76)) para `computeRange`. Transferências entre bancos (`transfer`) e movimentos de caixinha (`reserve_transfer`) entram nos totais de receitas, despesas e gráfico por categoria.
   - **Correção:** Separar `cashflowTitles` (para cálculo de saldo de carteiras e listagem em `Movimentos`) de `economicTitles` / `consumptionTitles` (excluindo `transfer`, `reserve_transfer`, `loan_out`, `loan_repayment`, `debt_payment` em KPIs de consumo, receitas/despesas e gráficos).

2. **[CRÍTICA] Bug de Timestamp Estrito (`>`) ao criar Conta ou Caixinha com aporte inicial**
   - **Arquivos:** [Dashboard.jsx#L342](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L342), [finance.js#L24](file:///c:/projetos/kuantoconta/apps/web/lib/finance.js#L24), [reconciliation.js#L10](file:///c:/projetos/kuantoconta/apps/web/lib/reconciliation.js#L10), [portfolio-service.js#L714-L746](file:///c:/projetos/kuantoconta/apps/web/lib/portfolio-service.js#L714-L746).
   - **Causa:** A fórmula soma baixas apenas quando `new Date(s.created_at) > new Date(w.opening_at)`. Quando a sub-carteira da caixinha e o aporte inicial ocorrem no mesmo milissegundo/transação (`now()` igual no Postgres), a comparação estrita `>` retorna `false`: debita a conta mãe e ignora o crédito na caixinha.
   - **Correção:** Nas carteiras do tipo caixinha/filha (ou qualquer baixa vinculada à criação `>= opening_at` quando `s.created_at >= w.opening_at` para carteiras criadas com saldo `0` via evento inicial), usar critério determinístico que garanta inclusão da primeira movimentação (ex.: `w.opening_at` retroativo em 1ms ou comparação `>=` quando a baixa pertence a um título criado para a carteira / flag `initial_settlement`).

3. **[ALTA] Resgate de Caixinha permite saldo negativo (Sem trava de saldo disponível)**
   - **Arquivos:** [portfolio-service.js#L619-L678](file:///c:/projetos/kuantoconta/apps/web/lib/portfolio-service.js#L619-L678) (`reserve_caixinha`), [EntryDrawer.jsx#L617-L670](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/EntryDrawer.jsx#L617-L670).
   - **Causa:** `direction === "withdraw"` não verifica se `transferCents <= saldoAtualCaixinha`, permitindo resgatar mais do que existe na caixinha e gerar dinheiro artificial na conta principal.
   - **Correção:** Validar saldo real da caixinha no backend antes de criar o resgate (`withdraw`), retornando HTTP 400 com mensagem clara; no `deposit`, avisar/bloquear caso exceda o saldo livre se aplicável.

4. **[ALTA] Editar ou Cancelar Parcialmente Parcelado dessincroniza `kc_economic_events`**
   - **Arquivos:** [007_economic_event_sync.sql#L9-L65](file:///c:/projetos/kuantoconta/apps/web/db/007_economic_event_sync.sql#L9-L65).
   - **Causa:** `kc_edit_title_and_event` só atualiza `kc_economic_events` quando `event_kind = 'one_off'`; editar uma parcela (`installment_purchase`) ou cancelar parcelas futuras (`scope = 'future'`) não recalcula `amount_cents` ou `category_id` do evento econômico.
   - **Correção:** Nova migration garantindo recálculo de `kc_economic_events.amount_cents = SUM(kc_titles.amount_cents ativos vinculados ao event_id)` e sincronização de categoria ao editar/cancelar parcelas.

5. **[ALTA] Excluir Caixinha (`cancel_goal`) deixa `reserve_transfer` vivo e infla "Guardado no mês"**
   - **Arquivos:** [portfolio-service.js#L439-L448](file:///c:/projetos/kuantoconta/apps/web/lib/portfolio-service.js#L439-L448), [016_caixinhas.sql#L93-L143](file:///c:/projetos/kuantoconta/apps/web/db/016_caixinhas.sql#L93-L143), [Dashboard.jsx#L398-L410](file:///c:/projetos/kuantoconta/apps/web/app/dashboard/Dashboard.jsx#L398-L410).
   - **Causa:** `kc_archive_wallet` move `kc_titles` e `kc_settlements` da caixinha excluída para a conta mãe (`W1`), restaurando o saldo da conta, porém o título de entrada (`reserve_transfer`, `income`) permanece ativo apontando para `W1` e continua contando em `reservedThisMonthCents`.
   - **Correção:** No arquivamento por exclusão de caixinha (ou no cálculo de `reservedThisMonthCents`), contar apenas movimentações cuja carteira destino é uma carteira de caixinha **ativa** (`wallet_id` pertencente a um `capital_goal` ativo), e registrar estorno limpo/neutro ao encerrar a caixinha sem poluir o KPI mensal.

6. **[ALTA] Excluir parcelas de Empréstimo (`cancel_scope`) mantém passivo fantasma em `kc_liabilities`**
   - **Arquivos:** [portfolio-service.js#L275-L310](file:///c:/projetos/kuantoconta/apps/web/lib/portfolio-service.js#L275-L310), [004_scoped_cancellation.sql#L55-L120](file:///c:/projetos/kuantoconta/apps/web/db/004_scoped_cancellation.sql#L55-L120), [reconciliation.js#L100-L104](file:///c:/projetos/kuantoconta/apps/web/lib/reconciliation.js#L100-L104).
   - **Causa:** `kc_cancel_title_scope` cancela os títulos em `kc_titles`, mas não atualiza nem fecha `kc_liabilities`.
   - **Correção:** Ao cancelar títulos com `liability_id`, se não restarem títulos ativos vinculados àquele `liability_id`, marcar `kc_liabilities.status = 'cancelled'` (ou `'settled'` caso pagas).

7. **[MÉDIA] Empréstimo para Terceiros (`action === "lend"`) sem vínculo entre saída (`loan_out`) e retorno (`loan_repayment`)**
   - **Arquivos:** [portfolio-service.js#L337-L364](file:///c:/projetos/kuantoconta/apps/web/lib/portfolio-service.js#L337-L364).
   - **Causa:** Saída e entrada a receber são gravadas sem `transfer_id` ou `series_id` compartilhado; cancelar uma não cancela/alerta sobre a outra.
   - **Correção:** Vincular `loan_out` e `loan_repayment` via `series_id` (ou coluna dedicada) e sincronizar exclusão/estorno quando a saída for cancelada antes da devolução.

8. **[MÉDIA] Editar data de título já pago não atualiza `kc_settlements.settled_on`**
   - **Arquivos:** [007_economic_event_sync.sql#L38-L59](file:///c:/projetos/kuantoconta/apps/web/db/007_economic_event_sync.sql#L38-L59).
   - **Causa:** Atualiza `due_on` e `occurred_on`, mas deixa `kc_settlements.settled_on` na data antiga, distorcendo o orçamento de caixa por competência.
   - **Correção:** Quando o título estiver integralmente pago em uma única baixa ativa, permitir/sincronizar `settled_on` quando o usuário editar a data de pagamento/competência.

9. **[MÉDIA] Editar valor de título já pago para cima cria pendência silenciosa**
   - **Arquivos:** [007_economic_event_sync.sql#L35-L47](file:///c:/projetos/kuantoconta/apps/web/db/007_economic_event_sync.sql#L35-L47).
   - **Causa:** Aumentar o valor de um título quitado atualiza `kc_titles.amount_cents`, mantendo `settled_cents` no valor antigo e gerando saldo "a pagar" residual sem o usuário perceber.
   - **Correção:** Exibir aviso explícito ou estender opção na UI para atualizar a baixa junto quando o lançamento já estiver marcado como pago.

---

## 6. Regras de Negócio: Saldo Previsto, Orçamentos, Reservas e Cartão de Crédito no Planejamento

### 6.1. Por que `Saldo previsto` ficou negativo (`-R$ 937,83` em `mar/2027`) e Regra Correta de Orçamentos
- **Causa observada na tela (`mar/2027`):**
  - `A receber` = `R$ 3.500,00`, `A pagar` = `R$ 2.652,68`, `Uso diário atual` = `R$ 4,27`. O saldo líquido previsto real seria `+R$ 851,59`.
  - Porém, [computeProjectedBalanceWithBudgetsCents](file:///c:/projetos/kuantoconta/apps/web/lib/budgets.js#L571-L629) subtraía integralmente `Math.max(used, limit)` de todos os orçamentos ativos com limite configurado (`Cartão de Crédito R$ 700`, `Alimentação R$ 300`, etc.), abatendo **R$ 1.789,42 de limites ainda não gastos** e transformando `+R$ 851,59` em `-R$ 937,83`.
- **Regra Definitiva (Hierarquia Kuantoconta — Controle de Teto sem Dupla Dedutibilidade):**
  1. **Orçamento é teto de controle, não compromisso financeiro:** Definir `Alimentação = R$ 300,00` ou `Mercado = R$ 100,00` **NÃO deduz** `R$ 100,00` do `Saldo previsto`. Apenas serve para alertar quanto ainda pode ser gasto na categoria.
  2. **O que compromete o `Saldo previsto` são exclusivamente os lançamentos reais** (pagos ou pendentes/parcelados/recorrentes) já lançados na conta ou na fatura do cartão:
     - *Exemplo canônico:* `Saldo previsto = R$ 120,00` → usuário cria orçamento de `Mercado = R$ 100,00` (`Saldo previsto` continua `R$ 120,00`). Usuário faz compra de `R$ 20,00` (paga ou pendente) em `Mercado`: o limite restante do orçamento cai para **`R$ 80,00`**, e o `Saldo previsto` cai para **`R$ 100,00`** (`120 - 20`).
  3. **Fluxo acumulado até o mês futuro:** Ao navegar para meses futuros (`mar/2027`), o `Saldo previsto` acumulado deve considerar a trajetória de saldo a partir de `TODAY` (ou apresentar claramente a leitura de *Resultado do mês* + *Saldo acumulado na data*) evitando cortes desconectados quando há faturas em meses intermediários.

### 6.2. Essência Kuantoconta: Priorizar Quitação antes de Guardar & Sugestão Inteligente de Aporte em Caixinhas
- **Filosofia:** O aplicativo existe para ajudar o usuário a **sair do aperto e formar capital** com segurança, nunca sugerindo guardar dinheiro que fará falta para pagar contas vencendo.
- **Ordem de Prioridade do Dinheiro Livre:**
  1. **Primeiro:** Cobrir despesas essenciais e compromissos/faturas (`A pagar` do mês e meses seguintes sem ficar negativo).
  2. **Segundo:** A sobra real livre (`Sobra segura do mês = Saldo previsto mínimo livre no mês após todos os compromissos, respeitando piso de caixa ≥ 0`) determina quanto é seguro aportar.
  3. **Regra do Aporte Sugerido (`safeMonthlyContributionCents`):**
     - Se `Saldo previsto = R$ 100,00` e compromissos pendentes somam `R$ 90,00` → sobra real = **`R$ 10,00`** → o sistema **sugere `R$ 10,00` para guardar na Caixinha** neste mês (nunca `R$ 120,00`).
     - Se a sobra real for `<= R$ 0,00` → o estado orienta **"Priorize quitar suas contas deste mês antes de novos aportes"** (`Aporte seguro hoje: R$ 0,00`).
  4. **Integração Orçamentos ↔ Caixinhas:** Limitar ou alertar quando a soma de metas mensais de Caixinhas superar a sobra real projetada do mês.

### 6.3. Planejamento de Compra e Caixinhas com Cartão de Crédito
- **Gap atual:** No simulador de compra (`goal_sim`) e a partir da criação/detalhe de uma Caixinha, não existe a opção de pagar/parcelar via **Cartão de Crédito** selecionando um dos cartões cadastrados (`kc_credit_cards`).
- **Especificação da Nova Capacidade (`goal-planner.js` + `EntryDrawer.jsx`):**
  1. **Seleção do Meio de Pagamento no Planejamento de Compra (`goal_sim`) e atalho "Planejar compra" na Caixinha:**
     - Opções: `Conta / Financiamento direto` **ou** `Cartão de crédito` (escolhendo o cartão em `creditCards`).
     - Possibilidade de combinar **Entrada via Caixinha (ou uso diário) + Restante parcelado no Cartão de Crédito**.
  2. **Validação 1 — Limite do Cartão na Data Desejada (`desiredOn`):**
     - No cartão de crédito, compras parceladas consomem o **valor total financiado** do limite no instante da compra (`limitUsedOnDesiredDate`), e o limite vai sendo **liberado mês a mês** conforme cada parcela já existente vence e é paga até `desiredOn`.
     - Verificar: `limiteDisponivelNaData >= valorNoCartao`. Se não houver limite na data desejada, calcular **qual a primeira data em que as parcelas antigas vencem e liberam limite suficiente** para a nova compra!
  3. **Validação 2 — Impacto nas Faturas Futuras, Orçamento e "A pagar" dos Próximos Meses:**
     - Em vez de debitar a parcela no dia da compra, projetar cada parcela `1..N` exatamente na **data de vencimento de cada fatura** (`computeInvoiceCycleForPurchase({ purchaseDate: desiredOn, closingDay, dueDay })` + meses subsequentes).
     - Validar mês a mês se a soma (`fatura atual projetada + nova parcela + demais contas a pagar`) cabe no **Orçamento mensal** e mantém o **Saldo previsto >= piso protegido** sem invadir outras Caixinhas/Reserva de Emergência.
  4. **Diagnóstico Claro em 3 Pilares no Simulador (quando usar Cartão):**
     - **1. Entrada** (coberta por Caixinha ou uso diário),
     - **2. Limite do Cartão na data da compra** (`Disponível em DD/MM/AAAA: R$ X` vs necessário `R$ Y`),
     - **3. Fatura mensal no Orçamento e Saldo Previsto** (`+R$ P/mês na fatura de MMM/AAAA`).

---

## 7. Plano de Execução Unificado (para `/goal UI_UX_AUDIT_AND_REDESIGN.md`)

1. **Fase A — Banco de Dados & Integridade Transacional (`apps/web/db/017_money_lifecycle_integrity.sql` + `portfolio-service.js`):**
   - Corrigir sincronia de `kc_economic_events` ao editar/cancelar parcelas (`kc_edit_title_and_event` e `kc_sync_cancelled_economic_events`) e sincronizar `settled_on` quando editado em quitação única.
   - Corrigir `kc_cancel_title_scope` para encerrar `kc_liabilities` quando todas as parcelas de um empréstimo forem excluídas.
   - Corrigir vínculo entre `loan_out` e `loan_repayment` (via `series_id`), adicionar trava de saldo insuficiente no resgate de caixinhas (`withdraw`), corrigir timestamp `opening_at` no aporte inicial de Caixinhas (`>=` / 1ms offset) e tratar estorno limpo em `cancel_goal` sem inflar "Guardado no mês".
   - Suportar campos opcionais de meio de pagamento (`payment_method`, `credit_card_id`) em `kc_financial_goals` para planejamentos vinculados a cartão de crédito.
2. **Fase B — Motores de Cálculo e Regra Financeira (`budgets.js`, `period.js`, `finance.js`, `reconciliation.js`, `goal-planner.js`, `Dashboard.jsx`):**
   - **Excluir `NON_CONSUMPTION_KINDS`** (`transfer`, `reserve_transfer`, `loan_out`, `loan_repayment`, `debt_payment`) dos KPIs `A pagar`, `A receber`, `Despesas por categoria` e `Receitas e despesas` mantendo-os visíveis no extrato de `Movimentos`.
   - **Corrigir `computeProjectedBalanceWithBudgetsCents` e `period.js`:** Remover subtração de limite não gasto (`Math.max(used, limit)` e `residualByDay`) para que orçamentos sejam estritamente teto de controle e apenas compras lançadas reduzam `Saldo previsto`. Acumular projeção corretamente entre `TODAY` e o mês selecionado.
   - **Motor de Aporte Seguro (`computeSafeCapitalSuggestion`):** Priorizar obrigações pendentes e calcular quanto realmente sobra no mês/caixinha para sugerir aporte realista nas Caixinhas e em Saúde/Planejamento.
   - **Simulador de Cartão de Crédito no Planejamento (`simulateGoalPurchase` + `credit-cards.js`):** Projetar limite disponível na data futura da compra (considerando liberação por faturas pagas), distribuir parcelas pelos ciclos reais de fechamento/vencimento (`computeInvoiceCycleForPurchase`) e validar impacto mensal no orçamento e no saldo previsto.
3. **Fase C — UI/UX & Formulários (`Dashboard.jsx`, `EntryDrawer.jsx`):**
   - Atualizar `goal_sim` no `EntryDrawer.jsx` para selecionar **Cartão de Crédito** (ou conta/financiamento) + opcionalmente vincular **Caixinha para entrada**, exibindo veredito em 3 pilares (Entrada, Limite do Cartão na data, Parcelas nas faturas futuras).
   - No modal da Caixinha (`selectedCaixinha`), incluir ação rápida `"Usar em planejamento de compra"` (já pré-selecionando a caixinha como entrada) e exibir o **Aporte seguro sugerido para este mês** baseado na sobra real após compromissos.
   - Garantir feedback visual quando título já pago tiver valor alterado (sincronizando baixa ou alertando antes de gerar pendência parcial).
4. **Fase D — Suíte de Testes QA (`qa-scenarios.test.mjs` / `test-suite.test.mjs`) & Build:**
   - Adicionar testes unitários cobrindo as **9 falhas de engenharia**, o exemplo canônico do orçamento (`120 -> orçamento 100 -> compra 20 -> orçamento 80 / saldo 100`), o algoritmo de **Aporte Seguro** (`sobra 100 - 90 = 10`) e a **Simulação em Cartão de Crédito** (limite liberado na data futura + ciclo de fatura + orçamento).
   - Executar suíte completa de testes e `npm run build` em `apps/web`.

---

## 8. Evolução de Planejamentos, Formas de Pagamento com Projeção Real e Redesign do Header

Estudo técnico e de UI/UX para transformar `"Compras planejadas"` em um motor completo de **Planejamentos** (Compras & Cotações, Viagens & Roteiros, Listas Antidesperdício), unificar as formas de pagamento com impacto direto nas projeções de contas/caixinhas/cartões e eliminar o underspacing do Header.

### 8.1. Header (*Unified Command Bar*) + Chip de Saldo Total das Contas
- **Causa do underspacing atual ([globals.css#L71-L105](file:///c:/projetos/kuantoconta/apps/web/app/globals.css#L71-L105)):** `.app` usa `max-width: 1448px` com `padding: 10px 72px 136px 36px` (assimétrico) enquanto o Bento Grid abaixo usa `max-width: 1120px`, deixando os controles do cabeçalho espalhados em `1448px` sem superfície comum.
- **Correção de UI:**
  1. Alinhar o `max-width` da `.topbar` ao grid principal (`max-width: 1160px`, padding lateral simétrico), transformando a `.topbar` em uma **barra cápsula unificada** (`background: rgba(255, 255, 255, 0.72)`, `backdrop-filter: blur(12px)`, `border-radius: 999px`, `padding: 8px 14px`) com divisor vertical sutil entre Marca, Ações (`+ Lançamento` e `Novo`), Seletor de Período (`< mês >` + Filtros) e Área do Titular.
  2. **Chip de Saldo Total (`Saldo em contas: R$ X`):** Exibido de forma compacta à esquerda do sino de notificações (`🔔`), mostrando o somatório real de **todas as contas ativas** (`Uso diário + Caixinhas`), com sub-rótulo ou detalhe rápido ao tocar abrindo o painel/resumo das contas. Em mobile (`<= 670px`), mantém formato compacto sem quebrar a altura da barra.

### 8.2. Reordenação do Bento Grid na Aba `Planejamento`
- **Linha 1 (12 colunas):** Reunir capacidade de reserva + ações primárias na mesma faixa superior:
  - **KPI 1 (`span-3`):** **Guardado em Caixinhas** (total + quebra Reserva vs. Objetivos).
  - **KPI 2 (`span-3`):** **Capacidade no Mês** (`Guardado em [mês]` + `Aporte seguro sugerido` priorizando quitação).
  - **Card Ação (`span-2`):** **Reservar valor** (Guardar / Resgatar).
  - **Card Ação (`span-2`):** **+ Nova caixinha** (Criar objetivo com vínculo bancário).
  - **Card Ação Destaque (`span-2`):** **+ Novo planejamento** (Abre o modal Multi-Step para Compra/Cotação, Viagem ou Lista).
- **Linha 2:**
  - **Esquerda (`span-5`):** **Caixinhas** (onde o capital está guardado).
  - **Direita (`span-7`):** **Planejamentos** (antigo *"Compras planejadas"*, exibindo cards com badge do modo `Compra`, `Viagem` ou `Lista`, contagem de cotações comparadas, cotação vencedora e status de viabilidade).

### 8.3. Três Modos de Planejamento em Modal Largo Multi-Step (`760px`)
Sem criar módulos redundantes, o mesmo fluxo de Planejamento suporta 3 modos no **Passo 1**:
1. **Compra ou Bem com Comparador de Cotações (`purchase`):**
   - Ex.: *"Trocar de Carro"* (`Gol 2020`: entrada `R$ 18.000` + restante `R$ 45.000` + link do anúncio vs. `Cruze`: entrada `R$ 20.000` + restante `R$ 48.000` + link).
   - O motor avalia todas as cotações cadastradas lado a lado e elege automaticamente a vencedora (`🏆 Mais viável para o seu bolso`), permitindo abrir o link salvo e marcar uma cotação como escolhida.
2. **Viagem ou Evento com Roteiro de Custos (`trip`):**
   - Ex.: *"Viagem Paraná dia 19"* composta por itens com chips rápidos (`+ Passagens`, `+ Hospedagem`, `+ Alimentação`, `+ Passeios`, `+ Imprevistos`), onde cada item ou bloco possui valor e forma de pagamento (ex.: passagem parcelada no cartão, hospedagem com Caixinha, gastos locais na conta). Suporta 2+ opções de roteiro para comparar (ex.: *Carro* vs. *Avião*).
3. **Lista de Compras Antidesperdício (`shopping_list`):**
   - Ex.: *"Mercado do Mês"* vinculada a uma categoria de orçamento (ex.: `Alimentação`), com lista de itens estimados e comparação ao vivo contra o limite restante da categoria no mês, além de conversão em despesa real ao concluir a compra.

### 8.4. Arquitetura Unificada de Formas de Pagamento (Sem Conflito nem Redundância)
Hoje o formulário pergunta separadamente *"Parcelas"* e *"De onde sai a entrada?"* mesmo quando não há entrada, além de não permitir criar/vincular uma Caixinha quando `Entrada = R$ 0,00`.

Para eliminar conflitos com **À vista**, **Parcelado** e **Financiado** e cobrir todos os casos reais:

| Estrutura escolhida | O que o usuário informa | Onde pode sair / pagar | Comportamento no Motor de Projeção |
| :--- | :--- | :--- | :--- |
| **1. À vista (100% na data)** | Apenas **Valor total** + Data | • Saldo livre em Conta<br>• Caixinha existente<br>• **Criar Caixinha para juntar até a data**<br>• Cartão de Crédito (1x na fatura) | **Se Conta/Caixinha existente:** verifica saldo atual + fluxo até a data.<br>**Se Criar Caixinha (mesmo com entrada 0):** cria a caixinha alvo (`target = valor total`) e calcula o ritmo mensal `R$/mês` vs. Aporte Seguro até a data.<br>**Se Cartão (1x):** valida limite disponível na data e lança na próxima fatura. |
| **2. Parcelado sem entrada (`N`x)** | **Valor total**, `N` parcelas, Juros opcional, Data | **Meio das parcelas:**<br>• Cartão de Crédito (escolhe cartão)<br>• Boleto / Financiamento (debita na conta)<br>**Opcional:** *Quero criar/usar uma Caixinha de reserva para cobrir as primeiras parcelas?* | **Sem entrada inicial à vista (`netDown = 0`):**<br>• **Cartão:** valida limite disponível pelo valor total na data da compra e projeta parcelas nos ciclos reais das faturas.<br>• **Boleto/Financiamento:** projeta impacto direto em caixa nas datas futuras.<br>• Se vincular Caixinha como reserva das parcelas, abate/protege o saldo acumulado na Caixinha sem misturar com uso diário. |
| **3. Entrada + Parcelas (Híbrido — Carro, Viagem)** | **Valor total**, **Valor da entrada**, `N` parcelas do restante, Juros opcional, Data | **Bloco Entrada:** Conta livre \| Caixinha existente \| **Criar nova Caixinha para juntar a entrada**<br>**Bloco Restante:** Cartão de Crédito \| Financiamento / Carnê (na conta) | Calcula os dois blocos sem dupla contagem:<br>• A Caixinha existente/nova cobre **exclusivamente** a Entrada (nunca toca Reserva de Emergência).<br>• O Restante financia apenas `Valor - Entrada` e consome limite do Cartão (ou caixa mensal da conta) nas datas corretas. |

- **Regra anti-redundância na UI:** Quando o modo escolhido é **À vista**, o bloco *"Restante / Parcelas"* fica oculto; quando é **Parcelado sem entrada**, o bloco *"Entrada"* fica oculto (mas mantém opção discreta `"Reservar em uma Caixinha para esta compra"` caso queira juntar antes de assumir as parcelas!). Só no modo **Entrada + Parcelas** os dois blocos aparecem separados e claros.

### 8.5. Motor de Projeção da Posição de Contas, Caixinhas e Cartões (`projectedPositions`)
A forma de pagamento escolhida **não é meramente informativa** — ela comanda o simulador (`simulateGoalPurchase` / `simulatePlanning`) e devolve um **Raio-X Completo Antes → Depois** para cada instrumento financeiro envolvido:

1. **Posição da Conta Bancária (Uso Diário):**
   - `Saldo projetado na data desejada`: **Antes (`R$ X`) → Depois (`R$ Y`)** após pagar o que sai do uso diário;
   - `Menor saldo livre durante os próximos N meses`: aponta exatamente o dia e o valor mínimo para garantir que nenhuma conta fique negativa.
2. **Posição da Caixinha (Existente ou Nova a Criar):**
   - `Já acumulado hoje`: `R$ A` (se nova Caixinha, `R$ 0,00`);
   - `Projeção até a data desejada` somando o `Aporte seguro mensal` real: **`R$ A + (aporteSeguro × meses) = R$ B`**;
   - `Cobertura`: mostra se na data desejada a Caixinha atingirá 100% da meta (ou quanto faltará) e a **data provável de quitação da meta da Caixinha** sem comprometer as contas do mês.
3. **Posição do Cartão de Crédito (quando escolhido para total ou parcelas):**
   - `Limite disponível na data desejada`: **Antes (`R$ L1`) → Depois da compra (`R$ L1 - financiado`)**;
   - `Fatura do mês de vencimento`: quanto a fatura daquele cartão passa a representar com a nova parcela (**Antes → Depois**) e se cabe no saldo previsto e no orçamento de Cartão de Crédito daquele mês.

### 8.6. Roadmap de Implementação (para futuro `/goal`)
1. **Migration (`018_planning_modes_and_quotes.sql`):** Adicionar em `kc_financial_goals` as colunas `plan_type` (`'purchase' | 'trip' | 'shopping_list'`), `payment_structure` (`'upfront' | 'installments' | 'hybrid'`), `quotes_json` (`JSONB` armazenando cotações com link, itens de viagem/lista, forma de pagamento por cotação e índice da cotação vencedora) e `budget_category_id` (para listas vinculadas a orçamento).
2. **Motores (`goal-planner.js` + nova lib `planning-comparator.js`):**
   - Suportar `paymentStructure` (`upfront`, `installments`, `hybrid`) e `projectedPositions` detalhado (Antes → Depois para Conta, Caixinha e Cartão).
   - Função de ranking multi-cotação (`comparePlanningOptions`) avaliando viabilidade na data, fôlego de caixa mensal, juros totais e limite de cartão para apontar a cotação vencedora (`🏆`).
   - Cálculo de roteiro de viagem (itens mistos com pagamentos distintos agregados na mesma linha do tempo diária) e cálculo de lista vs. saldo restante do orçamento.
3. **Header & Bento Grid (`Dashboard.jsx` + `globals.css`):**
   - Alinhar `.topbar` ao grid principal em formato *Unified Command Bar* eliminando underspacing, e inserir o chip clicável `Saldo total em contas` ao lado das notificações.
   - Reordenar Linha 1 da aba `Planejamento` (2 KPIs + 3 Action Cards lado a lado) e renomear para **Planejamentos**.
4. **Wizard Modal Multi-Step (`PlanningWizardModal.jsx` + `EntryDrawer.jsx`):**
   - Modal amplo (`760px`) em 3 passos (1. Tipo/Objetivo, 2. Cotações com Link / Itens da Viagem / Itens da Lista + Forma de Pagamento unificada sem redundâncias, 3. Comparativo Vencedor + Raio-X da Posição Projetada das Contas/Caixinhas/Cartões + Efetivar Planejamento).
5. **Testes QA & Build:** Cobrir comparação de cotações (`Gol vs Cruze`), viagem dia 19 com itens parcelados no cartão + à vista, compra sem entrada com criação de Caixinha e precisão do painel `Antes → Depois`.
