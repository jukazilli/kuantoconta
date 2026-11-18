# ADR-010 — Intenções de gasto, despesas, contas a pagar e orçamentos sem complexidade na UX

- **Status:** PROPOSTO — discussão e homologação de domínio/UX antes da implementação
- **Data:** 17/11/2026
- **Repositório:** `jukazilli/kuantoconta`
- **Relacionadas:** [ADR-008 — eventos econômicos, títulos e orçamento](./ADR-008-budgets-economic-events-and-projection.md) e [ADR-009 — saúde financeira e planejamento](./ADR-009-financial-health-priorities-and-goal-planning.md)
- **Escopo desta PR:** documento de decisão, sem mudança de UI, código ou banco
- **Princípio:** *O usuário escolhe o que aconteceu ou pretende fazer; o kuantoconta cuida das entidades contábeis e financeiras.*

---

## 1. Problema observado

O aplicativo já oferece registros `Pago` e `A pagar` para uma `Nova despesa`, datas de compra e de vencimento, orçamentos mensais por categoria, eventos econômicos, títulos e baixas. Falta uma forma clara e **não obrigacional** de representar a intenção de gastar no futuro.

Exemplo: o usuário define **R$ 600 de alimentação em dezembro** e diz “pretendo gastar R$ 300 no mercado em 01/12”.

- O limite **R$ 600** não é despesa, obrigação nem saldo bancário.
- O plano **R$ 300** não é compra feita nem dívida a pagar.
- A compra futura pode ser **R$ 280**, no débito; só então há despesa realizada e baixa bancária.
- Se a compra ocorrer hoje no crédito, a despesa **já ocorreu hoje**, mas a obrigação vence futuramente.
- O orçamento, a obrigação e a baixa devem permanecer reconciliados sem duplicar a compra.

O risco atual é classificar qualquer valor futuro como conta a pagar ou gasto realizado — ou, ao contrário, ignorar a intenção no planejamento e indicar uma sobra fictícia.

### Evidências no repositório (main verificada em 17/11/2026)

- `apps/web/app/dashboard/EntryDrawer.jsx`: formulário de `Nova despesa` com escolha `A pagar`/`Pago`, data da compra, vencimento, categoria e conta. Não há ação de intenção de gasto separada.
- `apps/web/lib/budgets.js`: `computeBudgetSummary` usa eventos econômicos como consumo do orçamento e usa títulos legados/recorrências virtuais sem evento como fallback. Hoje o mesmo termo `usedCents` pode misturar consumo efetivo com compromissos futuros inferidos.
- `apps/web/lib/period.js`: o cenário `within_budgets` insere o residual do teto no **último dia do mês**. Essa hipótese é inadequada como garantia de cobertura para compras programadas no início do mês.
- `apps/web/db/006_economic_events.sql`: `kc_economic_events` representa fato econômico; `kc_titles` representa vencimentos e `kc_settlements` representa baixa. Essa separação é uma base a preservar.
- `apps/web/db/008_financial_health_and_planning.sql`: saúde financeira, contratos e objetivos já possuem uma base específica.

**Nota de governança:** as ADRs 008/009 ainda possuem cabeçalhos de status “proposto” no arquivo, apesar de terem motivado entregas posteriores. A implementação deverá confrontar código, migrations, PRs e dados reais; nunca inferir que o texto histórico representa sozinho o estado executado.

---

## 2. Decisão de produto

**A interface será organizada por intenção humana, não pela terminologia do banco.**

Três opções simples ao tocar em **Adicionar**:

| Ação visível | Pergunta respondida | Resultado interno | Campos iniciais |
|---|---|---|---|
| **Gastei** | “Já comprei/consumi?” | Evento econômico real; baixa imediata ou título a pagar conforme pagamento | Valor, descrição, categoria; `Já paguei` / `Vou pagar depois` |
| **Vou gastar** | “Quero ou pretendo comprar?” | Plano de consumo futuro **não obrigacional** | Valor estimado, categoria, data ou mês previsto |
| **Tenho uma conta** | “Já tenho um pagamento devido?” | Título/recorrência de obrigação assumida, com competência econômica separada | Valor, descrição, vencimento; repetição opcional |

**Orçamento NÃO será uma quarta opção de lançamento**. É configuração opcional em **Limites por categoria**, criada/alterada uma vez e utilizada automaticamente.

**Ponto essencial:** o usuário não precisa conhecer “competência”, “evento econômico”, “título”, “settlement”, “passivo” ou “CET” para registrar uma padaria de R$ 10. Esses conceitos permanecem no domínio e nas áreas avançadas.

### 2.1 O que a interface decide automaticamente

- `Gastei + Já paguei` ⇒ cria compra econômica e baixa na conta, na mesma transação.
- `Gastei + Vou pagar depois` ⇒ cria compra econômica **na data da compra** e obrigação **na data do pagamento**, sem baixar a conta ainda.
- `Vou gastar` ⇒ cria somente plano/estimativa; não altera consumo realizado, contas a pagar ou caixa real.
- `Tenho uma conta` ⇒ cria obrigação assumida, com vencimento e recorrência opcionais; reconhece o consumo quando o fato econômico ocorrer na competência correta, **não apenas porque a obrigação foi cadastrada**.
- Selecionar categoria com limite mensal ⇒ vinculação automática ao orçamento por categoria/competência, sem pergunta adicional.
- Sem orçamento na categoria ⇒ registrar normalmente; orçamento não é pré-requisito de despesa.

### 2.2 “Mercado é o quê?”

**Mercado é a natureza de consumo (categoria/subcategoria Alimentação/Mercado), não um tipo fixo de lançamento.**

- “Vou ao mercado em 01/12 e acho que gastarei R$ 300” ⇒ `Vou gastar`.
- “Fui ao mercado hoje e paguei R$ 280 no débito” ⇒ `Gastei / Já paguei`.
- “Comprei R$ 300 no cartão hoje e pagarei em janeiro” ⇒ `Gastei / Vou pagar depois`.
- “Recebi uma cobrança de fornecedor por compra já efetuada” ⇒ conta a pagar já associada à despesa; não lançar novo consumo.
- “Meu aluguel de dezembro vence dia 05” ⇒ `Tenho uma conta`, com repetição, natureza Moradia; o consumo de moradia é reconhecido na competência de dezembro e o caixa só muda na liquidação.

### 2.3 Regra de simplicidade

**Máximo de três escolhas na entrada**, cada uma com 2–3 campos principais e data predefinida pelo contexto. Campos avançados aparecem sob demanda, não como um formulário cheio de opções obrigatórias.

---

## 3. Quatro conceitos internos, três ações externas

| Conceito de domínio | É dinheiro já gasto? | É obrigação exigível? | Afeta saldo real hoje? | Afeta previsão? |
|---|---|---|---|---|
| **Orçamento mensal** | Não | Não | Não | Somente como teto/cenário, não como cobrança |
| **Intenção/estimativa de gasto** | Não | Não | Não | Sim, como saída **hipotética e datada** |
| **Despesa realizada (evento econômico)** | Sim, consumo ocorrido | Pode gerar obrigação se não quitada | Só se houver baixa | Sim, sem dobrar o pagamento futuro |
| **Conta a pagar** | Não necessariamente* | Sim, obrigação já assumida | Não até a baixa | Sim, por vencimento |
| **Pagamento/baixa** | Não é uma segunda despesa | Quita obrigação | Sim | Substitui pendência, não adiciona novo consumo |

*Uma conta a pagar pode estar vinculada a uma despesa **já realizada** ou a obrigação de período futuro, como aluguel contratado. Distinguir evento de consumo e exigibilidade, sem presumir que toda obrigação futura equivale a um consumo já ocorrido.*

**Invariantes:**
1. Planejar não gera dívida, consumo realizado ou baixa.
2. Comprar/consumir não implica que a conta tenha sido paga.
3. Pagar não cria uma nova despesa para o orçamento.
4. O orçamento é limite mensal, não carteira fictícia nem saída financeira.
5. Datas são distintas: `planned_for` (intenção), `occurred_on` (fato econômico), `due_on` (exigibilidade) e `settled_on` (caixa).
6. Previsão/compromisso/consumo referidos ao **mesmo fato subjacente** não podem ser somados como se fossem três gastos.

---

## 4. Exemplo completo: alimentação de dezembro

- Limite mensal em Alimentação: **R$ 600**.
- Em 17/11, cadastro plano de mercado: **R$ 300 para 01/12**.
- Em 01/12, compro **R$ 280** e pago no débito.
- O plano original é conciliado com a despesa, sem compra duplicada.

| Momento | Realizado | A pagar na categoria, ainda não realizado | Planejado restante | Sem destino no limite |
|---|---:|---:|---:|---:|
| Antes da compra | R$ 0 | R$ 0 | R$ 300 | R$ 300 |
| Após compra de R$ 280 e encerramento do plano | R$ 280 | R$ 0 | R$ 0 | R$ 320 |

**A compra reduziu o caixa em R$ 280 uma vez.** O orçamento ainda possui R$ 320 de limite não consumido. A previsão inicial de R$ 300 não deve sobreviver como **outro** gasto futuro de R$ 300.

**Se só parte do plano foi atendida** (ex.: R$ 100 hoje e ainda faltam as compras da semana), o usuário pode marcar `Ainda vou gastar o restante`; então plano restante = R$ 200, e os R$ 100 de consumo realizado contam uma vez.

**Se a compra ficou R$ 350:** os R$ 350 são realizados, e o plano original fica atendido; diferença de R$ 50 é consumo adicional, **não** outra previsão.

**Se foi desistência:** `Cancelar plano` remove o efeito apenas da projeção, sem estorno bancário fictício.

**Se a data passou e nada foi lançado:** manter “Previsto · precisa revisar” e oferecer `Registrar compra` / `Adiar` / `Cancelar`. **Nunca** converter automaticamente previsão em conta vencida ou despesa realizada.

---

## 5. Orçamento: uso simples, detalhamento opcional

O orçamento opera por **categoria principal e mês de competência** (`kc_budget_rules`/`kc_budget_periods` da ADR-008), inclusive quando a compra será paga em outro mês.

Definições para a categoria `c` no mês `m`:

- `L` = limite configurado.
- `R` = **consumo econômico já realizado** no mês, incluindo compra no crédito ainda não paga.
- `C` = **compromissos da categoria que ainda não foram reconhecidos como consumo**, com competência atribuível ao mês; não contar títulos vinculados a eventos já incluídos em `R`.
- `P` = **estimativas não obrigacionais ainda não atendidas**, depois de abater valores conciliados.
- `U = L - R - C - P` = limite **sem destino**. Pode ser negativo; não truncar a ultrapassagem no modelo de dados.
- `RestanteDoLimite = L - R` = teto ainda não consumido. Também pode ser negativo.

**Importante:** `U` não equivale a saldo disponível em banco e `RestanteDoLimite` não equivale a “pode gastar hoje”.

### 5.1 Hierarquia visual do card

**Padrão compacto (sem nova burocracia):**

> **Alimentação** — Limite R$ 600  
> **Gasto R$ 0** · **R$ 300 ainda sem destino**  
> *R$ 300 já planejados*

Ao expandir, exibir `Gasto`, `Contas comprometidas`, `Planejado`, `Restante do limite` e `Sem destino` — só as linhas relevantes, evitando zero em excesso. Exibir previsão e compromisso como **estados distintos**, com rótulos e eventual legenda; não chamar ambos de “gasto”.

**Se não há planos nem compromissos**, o cartão é igual ao modelo simples: limite, gasto e restante.

**Se o limite foi excedido:** mostrar excesso real ou previsto com rótulo apropriado, sem ajustar o teto silenciosamente.

**Se não há orçamento definido:** apresentar apenas os gastos/contas da categoria; criar orçamento é convite opcional, não bloqueio.

### 5.2 Orçamento diário

Caso exista um orçamento diário derivado, apresentar como **sugestão do limite da categoria, não garantia de caixa**. A base para gasto opcional adicional pode considerar `max(0, U) / dias restantes`, mas a recomendação final deve ser limitada pelas restrições de caixa, prioridades e compromissos do motor ADR-009. Não dividir automaticamente valor já planejado ou comprometido como se estivesse livre.

---

## 6. Compromissos futuros e a diferença entre reconhecer consumo e pagar

### 6.1 Compra no crédito em dezembro, cobrança em janeiro

- `01/12: R$ 300` comprados no mercado ⇒ `R = 300` no orçamento de **dezembro**.
- `10/01: R$ 300` a pagar ⇒ título no fluxo de caixa de **janeiro**.
- `10/01: R$ 300` pagos ⇒ baixa de caixa uma vez; não altera o consumo econômico de dezembro.

Não contar fatura consolidada como segunda despesa quando as compras individuais já existem. O motor completo de cartão/fatura continua fora do escopo conforme ADR-008; o fluxo genérico de pagamento posterior deve continuar íntegro, sem prometer conciliação completa de cartão.

### 6.2 Aluguel ou conta contratual de dezembro

- Em novembro o usuário conhece uma **obrigação** de R$ 1.200 vencendo 05/12.
- O compromisso entra na **projeção de caixa de 05/12**, independentemente de quando foi cadastrado.
- Se Moradia tem orçamento de dezembro, o valor **já comprometido** deve ser reservado no card; não é automaticamente etiquetado como “gasto pago”.
- Quando o consumo de moradia do período for reconhecido, o compromisso se converte em **gasto realizado do período**, sem alterar o total do uso econômico da categoria e sem lançar baixa.
- No pagamento, a baixa movimenta caixa e reduz o título em aberto. Não soma novo gasto.

**Gate de domínio:** definir, por espécie de obrigação, quando ocorre o reconhecimento do evento econômico (ex.: competência de aluguel do mês) sem inferir a data da compra a partir do vencimento. Em dados legados sem `occurred_on` confiável, preservar proveniência `legacy_inferred`; não reescrever histórico como verificado.

### 6.3 Regra de categoria

Uma categoria (`Alimentação`, `Moradia`) **não implica automaticamente** “recorrência”, “cartão”, “conta a pagar” ou “gasto na hora”. A situação é definida pela ação e pelo meio de pagamento.

---

## 7. Motor de previsão: não somar o mesmo dinheiro três vezes

O calendário deve distinguir:

1. **Caixa realizado:** saldo + baixas reais após âncora.
2. **Caixa contratual:** pagamentos/recebimentos exigíveis por vencimento, considerando o que já foi liquidado.
3. **Caixa com planos:** curva contratual + **intenções ainda não realizadas/conciliadas** com datas e hipóteses explícitas.
4. **Cenário de uso integral do limite:** curva com planos + **resíduo não destinado** dos orçamentos, mantendo incerteza e piso de caixa protegidos.

Regras técnicas:

- Gastos já realizados **e pagos** não geram nova saída futura.
- Gastos realizados **não pagos** são saídas futuras **apenas via título**, sem adicionar uma segunda saída pelo evento econômico.
- Obrigações futuras já previstas em `kc_titles` não podem entrar outra vez como estimativas não vinculadas.
- Intenções não concretizadas entram **apenas** no cenário com planos; não contaminam `contractual`, `kc_settlements` ou dívida atual.
- Para um limite R$ 600, plano R$ 300 e R$ 0 realizado, cenário `com planos` considera R$ 300 e cenário `limite completo` considera no máximo outros R$ 300 **adicionais** (não R$ 900).
- Sem orçamento, intenções ainda podem ser projetadas, independentemente de limite.
- Para intenções **sem dia especificado**, mostrar previsão mensal com confiança condicionada; o cálculo de risco por vencimento deve usar cenário conservador ou solicitar data só quando indispensável para concluir algo. Nunca inventar o dia.
- O uso do residual de limite **exclusivamente no último dia do mês** presente em `period.js` é uma convenção de cenário, **não prova** de liquidez intramensal. Para saúde financeira, capacidade de aporte e compras, exigir nova política de distribuição temporal ou proteção conservadora antes dos vencimentos — com premissa visível.
- Não subtrair orçamento como dinheiro efetivamente gasto nem criar “saldo de orçamento” fictício.

**Consequência para ADR-009:** diagnóstico e `goal-planner` não devem recomendar uma compra ou aporte considerando livres recursos já destinados a planos futuros, sem avaliar pelo menos um cenário prudente e suas premissas.

---

## 8. Transições e conciliação amigáveis

### 8.1 Caminho principal

```text
[+ Adicionar]
  ├─ Gastei
  │   ├─ Já paguei         → evento econômico + baixa
  │   └─ Vou pagar depois  → evento econômico + título
  ├─ Vou gastar            → plano não obrigacional
  └─ Tenho uma conta       → obrigação assumida/recorrência

[Plano]
  ├─ Registrar compra      → vincular evento e reduzir/encerrar plano
  ├─ Adiar                → ajustar data prevista
  └─ Cancelar             → retirar de cenários, preservar trilha
```

### 8.2 Vinculação de previsão com compra

Ao registrar uma compra próxima da data e categoria de uma previsão, sugerir discretamente:

> “Essa compra corresponde ao mercado previsto para 01/12?”  
> `Sim, usar previsão` · `Não, é outra compra`

**Não unir automaticamente** apenas porque data/valor/categoria coincidem. Vinculação é explícita, auditável e idempotente. Se entrada do fluxo partir do próprio plano, pré-preencher valores e vincular por padrão com opção clara de modificar.

Permitir conciliação **parcial** quando uma previsão de R$ 300 virar duas compras de R$ 100 e R$ 180; o usuário pode encerrar o plano ou manter os R$ 20 futuros. Nunca criar nova despesa econômica somente para fechar diferença.

### 8.3 Estados internos do plano

`planned`, `partially_fulfilled`, `fulfilled`, `cancelled`. O aviso `precisa revisar` é uma **sinalização de atraso**, não classificação como conta vencida. Edição do plano não modifica eventos realizados; lançamento financeiro não pode retroativamente reaparecer como intenção ao ser revertido.

---

## 9. Modelo de dados proposto (não executar migration nesta PR)

**Alternativas consideradas:**

| Alternativa | Avaliação |
|---|---|
| A. Armazenar intenção como `kc_titles` pendente | **Rejeitada:** produz obrigação falsa e contamina saúde financeira/endividamento |
| B. Criar `kc_economic_events` com status `planned` | **Rejeitada para V1:** mistura fatos econômicos com hipóteses e complica invariantes da ADR-008 |
| C. Plano separado com vínculo opcional à despesa (`kc_spending_plans`) | **Recomendada:** separa hipótese de fato realizado e permite transição sem dupla contagem |

**Entidade lógica `kc_spending_plans`:**
- `id`, `user_id`, `description`, `category_id`, `subcategory_id`.
- `estimated_amount_cents`, `planned_for` (data opcional) e/ou `planned_month` (obrigatório).
- `expected_payment_on` opcional, se diferir do dia da compra; sem presumir cartão/crédito.
- `status`, `created_at`, `updated_at`, `cancelled_at`, `source` e `idempotency_key`.
- Regras de propriedade `user_id` e FKs compostas para categoria/subcategoria.

**Entidade lógica `kc_spending_plan_applications`:**
- `plan_id`, `economic_event_id`, `allocated_cents`, `user_id`, `created_at`.
- Soma de `allocated_cents` deve ficar dentro do valor realizado elegível; validar transacionalmente.
- Total de compras conciliadas reduz apenas o **plano residual**, sem afetar o consumo realizado original.
- Regras de unicidade/idempotência e prevenção de vínculo de compras entre usuários, categorias incompatíveis ou eventos cancelados.

**Lógica do saldo do plano:** `remainingPlan = max(0, estimated_amount - sum(valid allocations))` se plano está ativo; ao cancelar/concluir, restante projetado vira 0, preservando histórico e associações.

**No domínio de título recorrente:** manter o uso de `kc_recurring_rules` / `kc_titles` para **obrigações**, mas diferenciar as ocorrências que representam compromissos econômicos ainda não reconhecidos. Não classificar uma recorrência de aluguel como `kc_spending_plan` por padrão.

**Cautelas de migração:** aditiva, segura para dados existentes, sem backfill retroativo que converta títulos antigos em planos presumidos; qualquer sugestão assistida de reconciliação exige aceite do usuário. Todas as rotas mantêm autenticação, segregação por usuário e transações ACID.

**Não persistir agregado `usedCents` como valor principal da verdade**: separar cálculo em `realizedCents`, `committedUnrealizedCents`, `plannedRemainingCents`, `unallocatedCents` e `remainingLimitCents`. Caso precise compatibilidade, expor `usedCents` como alias documentado, sem reutilizá-lo com nova semântica silenciosa.

---

## 10. UX detalhada e padrões de microcopy

### 10.1 Primeira experiência

- Mostrar **“Gastei”** como primeira ação para registro cotidiano.
- Preencher **data de hoje** e última conta usada quando existir; categoria sugerida pelo histórico pode ser editada.
- Inputs mínimos de `Gastei`: **Valor**, **onde/com o quê**, **Categoria**; seletor simples `Já paguei / Vou pagar depois`.
- Em `Já paguei` exibir a conta usada; em `Vou pagar depois` mostrar vencimento.
- No fluxo `Vou gastar`, aceitar mês estimado e oferecer dia opcional; conta de débito não obrigatória, já que a compra não existe.
- No fluxo `Tenho uma conta`, pedir vencimento e valor; repetição em `Mais opções` ou seletor simples `Repete todo mês?`.
- Orçamentos são opcionais e não bloqueiam registro se inexistentes.
- Não solicitar que o usuário selecione “Despesa econômica” versus “Título”.

### 10.2 Rótulos de cartões

Preferir:
- `Gasto até agora`.
- `Já planejado`.
- `Contas comprometidas` (quando houver vínculo conhecido).
- `Ainda sem destino` (do limite).
- `Restante do limite`.
- `Vai faltar dinheiro em [data]` somente se houver risco calculado com dados suficientes.

Evitar:
- “Valor livre” e “Pode gastar hoje” como sinônimos de limite não utilizado.
- “Dívida” para previsão de mercado.
- “Pago” para um gasto apenas reservado ou contratado.
- “Orçamento consumido” quando o valor veio de recorrência futura não realizada.

### 10.3 Progressividade

Card compacto: **limite, gasto e próximo valor planejado**. Expandir revela discriminação, datas e ações. Se três níveis confundirem o usuário, testar hierarquia por tarefa antes de reduzir a precisão do motor. Não adicionar banners didáticos permanentes, novos menus ou microtextos excessivos sem necessidade demonstrada.

### 10.4 UI não é o banco de dados

Todos os conceitos contábeis permanecem internos. A ação `Gastei` pode criar mais de uma entidade na mesma transação; o usuário percebe **um lançamento**. Uma compra planejada reconciliada é **a mesma intenção atendida**, não dois itens duplicados na lista.

---

## 11. Histórias de usuário

- **US-01:** Como usuário, quero registrar R$ 10 na padaria em poucos campos, para não precisar conhecer tipos financeiros.
- **US-02:** Como usuário, quero planejar R$ 300 de mercado para dia 01/12 sem gerar conta a pagar nem despesa realizada.
- **US-03:** Como usuário, quero registrar uma compra no crédito hoje e pagá-la depois, para ver o consumo no mês da compra e o caixa no mês do pagamento.
- **US-04:** Como usuário, quero criar aluguel recorrente com vencimento, sem confundir o compromisso com dinheiro pago.
- **US-05:** Como usuário, quero que uma compra do mercado substitua ou reduza o valor planejado, para não inflar o orçamento.
- **US-06:** Como usuário, quero ver quanto do limite já gastei e quanto ainda pretendo gastar, sem acreditar que isso é saldo no banco.
- **US-07:** Como usuário, quero adiar ou cancelar uma compra planejada sem apagar fatos financeiros realizados.
- **US-08:** Como usuário, quero que o diagnóstico e o simulador de compras considerem meu gasto previsto sem tratá-lo como dívida.

---

## 12. Critérios de aceite bloqueantes

| ID | Cenário | Resultado esperado |
|---|---|---|
| LC-01 | Orçamento Alimentação R$ 600 criado | Zero título, baixa e evento econômico |
| LC-02 | Plano de mercado R$ 300 em 01/12 | Não altera caixa, dívida, títulos ou `realizedCents` |
| LC-03 | Compra de R$ 280 no débito vinculada ao plano R$ 300 | Realizado R$ 280; previsão residual 0 se usuário encerrar; caixa -R$ 280 uma vez |
| LC-04 | Plano R$ 300; compra R$ 100, usuário mantém restante | `realizedCents` R$ 100; `plannedRemainingCents` R$ 200 |
| LC-05 | Plano R$ 300; compra R$ 350 | Consumo R$ 350; previsão encerrada; não criar despesa extra de R$ 50 |
| LC-06 | Plano cancelado sem compras | Sai da projeção; nenhum estorno/baixa |
| LC-07 | Plano vencido não concretizado | Sinalizar revisão; nunca gerar inadimplência |
| LC-08 | Compra R$ 300 em 01/12, vencimento 10/01 | Consumo dezembro; título janeiro; baixa janeiro; sem dupla contagem |
| LC-09 | Aluguel dezembro R$ 1.200 vencendo dia 05 | Compromisso por vencimento, não despesa paga antes da baixa; reconhecimento econômico separado |
| LC-10 | Evento econômico já reconhecido e ainda não pago | Conta a pagar não volta a consumir orçamento |
| LC-11 | Categoria sem limite | Permitir planos e despesas sem exigir orçamento |
| LC-12 | Limite R$ 600, plano R$ 300 e nenhum gasto | Cenário com plano R$ 300; cenário limite completo não excede R$ 600 no total |
| LC-13 | Limite R$ 600, aluguel comprometido R$ 200, plano R$ 300 | Residual adicional R$ 100, não R$ 600; sem duplicar aluguel |
| LC-14 | Plano de gasto 01/12 e aluguel vencendo 02/12 | Diagnóstico/compra simulada não podem ignorar gasto do dia 01 por lançá-lo no dia 31 |
| LC-15 | Plano sem data exata | Não inventar cobertura intramensal; declarar hipótese/incerteza |
| LC-16 | Compra paga, baixa revertida por erro | Corrigir caixa; consumo econômico permanece até estorno econômico separado |
| LC-17 | Lançamentos legados/recorrências virtuais | Não promover automaticamente planejamento para gasto verificado; proveniência mantida |
| LC-18 | Dois usuários diferentes | Planos, vínculos, orçamento e compras estritamente segregados |
| LC-19 | Duplo clique ou requisição repetida | Plano e compra idempotentes; sem associação duplicada |
| LC-20 | Atualização da previsão após compra parcial | Não altera compra/baixa já realizada |
| LC-21 | Compra lançada sem associar previsão existente | Sugerir conciliação, não alterar silenciosamente; projeção sinaliza potencial duplicidade |
| LC-22 | Categoria Alimentação com compras efetivas e previsões | `RestanteDoLimite` e `SemDestino` consistentes com fórmulas; valores negativos visíveis |
| LC-23 | Fluxo padrão de R$ 10 pago na padaria | Registro sem perguntas de orçamento, evento/título/competência ou status técnico |
| LC-24 | Aluguel conta mensal + pagamento | Uma obrigação por competência/vencimento, sem duplicar por materialização de recorrência |
| LC-25 | Capacidade de aporte e compra programada | Considerar cenário prudente com gastos planejados; indicar hipótese ao usuário |

**Requisitos de testes:** unitários do domínio, integração transacional, regressão dos motores `finance.js` / `period.js` / `budgets.js` / `health-diagnosis.js` / `goal-planner.js`, testes de UI (incluindo teclado/mobile) e verificação E2E de dois usuários. Não ajustar número para fazer cenário “passar”; distinguir resultado confirmado, estimado e condicionado.

---

## 13. Sequenciamento de implementação (após homologação)

| Etapa | Entrega mínima | Sem tocar |
|---|---|---|
| **LC-00 — Gate de domínio e UX** | Homologar ações, títulos, estados, conversão parcial, fórmula e reconhecimento do aluguel | Sem migration |
| **LC-01 — Contrato e schema** | Entidade aditiva de planos/vínculos, proveniência, migração idempotente e testes | Não modificar fatos legados |
| **LC-02 — Cálculo de categorias** | Métricas de realizado, comprometido, planejado e sem destino; compatibilidade com orçamento existente | Sem redesenho amplo |
| **LC-03 — Projeções** | Cenários contratual, com planos e limite completo; data de consumo vs. data de caixa; integração ADR-009 | Não lançar previsão como dívida |
| **LC-04 — Fluxos mínimos** | Adicionar: Gastei / Vou gastar / Tenho uma conta; conversão assistida em um gesto | Sem novos formulários técnicos |
| **LC-05 — Cards e microinterações** | Card compacto, expansão, alertas e confirmação de plano | Preservar design system atual |
| **LC-06 — Regressão e homologação** | LC-01..LC-25; cenários de dados antigos e segurança; preview para validação | Não merge automático na main |

**Politica de migrations futuras:** o executor poderá criar e testar migrations aditivas em **ambiente local/preview isolado**, verificando a conexão antes de executar. Não migrar produção sem aprovação separada.

---

## 14. Decisões abertas para homologar antes da execução

1. **Reconhecimento do aluguel/serviços:** no início da competência, em data parametrizada, ou mediante confirmação? Evitar confundir obrigação com pagamento e “despesa paga” com “despesa incorrida”.
2. **Planos sem dia definido:** tratar como risco conservador desde o início do mês, distribuir sob hipótese declarada ou pedir data apenas quando inviabilizar cálculo seguro?
3. **Conciliação parcial:** predefinir “encerrar plano” ou “manter o restante” quando a compra real for inferior à previsão? Proposta: perguntar só quando houver diferença e intenção não óbvia.
4. **Detecção sugestiva de duplicidade:** qual tolerância de datas/valor/categoria pode gerar sugestão sem forçar vínculo?
5. **Plano com pagamento posterior:** expor data de pagamento em “Mais opções” ou tratar como caso posterior ao registro real?
6. **Orçamento diário e compromissos recorrentes:** em que cenário o limite diário é mostrado como meta versus alerta de caixa? Parâmetros devem ser definidos na política.
7. **Gasto real sem confirmação de categoria:** permitir rápida correção sem reescrever baixas registradas?
8. **Migração de fallback legado:** como migrar `usedCents` atual sem converter compromisso futuro em fato econômico verificado?

**Não homologar automaticamente defaults financeiros incertos.** Preferir lacuna explícita e comportamento conservador a “sobra disponível” inventada.

---

## 15. Consequências, limites e decisão final

**Benefícios:** reduz carga cognitiva; permite planejar mercado sem criar dívida; mantém consumo no mês correto; protege a análise de saúde financeira de falsas sobras e duplicidades; mantém limites mensais opcionais; encaixa no motor já desenvolvido.

**Custos:** uma entidade nova de planos, conciliação de intenção versus fato, mais cenários de projeção e testes de recorrência. A complexidade deve ficar no serviço de domínio, não no formulário.

**Não incluído agora:** conciliação completa de faturas/cartões, OCR de recibos, importação bancária automática, motor de IA de categorização, distribuição universal do limite por dia, rearranjo total da Home.

**Decisão arquitetural proposta:** manter **`kc_economic_events` para fatos**, **`kc_titles` para obrigações**, **`kc_settlements` para caixa**, **`kc_budget_*` para limites** e criar **`kc_spending_plans` para intenções**. Conectar por vínculo explícito, sem dupla contagem e com três ações humanas como entrada. A UX deve mostrar **um gesto simples**; o motor executa quantas operações internas forem necessárias com segurança.
