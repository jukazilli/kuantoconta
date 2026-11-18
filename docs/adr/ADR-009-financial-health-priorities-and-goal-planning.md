# ADR-009 — Diagnóstico de saúde financeira, prioridades de caixa, recuperação e programação de objetivos

- **Status:** PROPOSTO — aguardando homologação de produto e engenharia; não autoriza migrations nem implementação automática
- **Data:** 17/11/2026
- **Repositório:** `jukazilli/kuantoconta`
- **Local:** `docs/adr/ADR-009-financial-health-priorities-and-goal-planning.md`
- **Dependência arquitetural:** [ADR-008 — Evento econômico, título, baixa e orçamento](./ADR-008-budgets-economic-events-and-projection.md) (**também proposta**)
- **Origem:** investigação de produto “kuantoconta — investigação ampliada: saúde financeira e planejamento inteligente”, consolidada em 17/11/2026
- **Escopo desta decisão:** contrato de domínio, comportamento esperado, invariantes e critérios de aceite. Os nomes físicos de tabelas, defaults e thresholds permanecem sujeitos ao gate de implementação.

---

## 1. Contexto e problema

O kuantoconta já dispõe de mecanismos iniciais de fluxo diário, projeção por período, limites de orçamento e patrimônio parcial. Esses mecanismos, isoladamente, **não determinam** se a pessoa consegue honrar compromissos, sair de uma situação de risco, formar reservas e assumir uma compra futura com segurança.

O produto deve responder, nesta ordem:

1. **Quanto devo e o que preciso pagar?**
2. **Quando minha situação financeira começa a melhorar?**
3. **Quanto posso direcionar para dívidas e reserva?**
4. **Quanto capital poderei acumular até dezembro?**
5. **Quando posso realizar uma compra sem comprometer o plano?**

A implementação atual em `apps/web/lib/finance.js` calcula, entre outros campos, `knownCash`, `minCash`, `firstNegative` e patrimônio parcial; `period.js` agrega cenários `contractual` e `within_budgets`; `budgets.js` calcula utilização mensal. Tais componentes **são bases reutilizáveis, não um diagnóstico homologado**. Em particular, `safeToSpendCents` atual não representa um valor automaticamente transferível: não incorpora toda proteção por objetivo, incerteza de receita e regras de alocação.

A ADR-008 separa fato econômico, título e baixa. Esta ADR **estende essa separação**, sem rediscutir suas decisões e sem presumir que o estado PROPOSTO da ADR-008 equivale à sua homologação.

### Objetivos

- Diagnóstico explicável e auditável, sem pontuação artificial 0–100 na V1.
- Visibilidade de riscos **por data**, não só pelo saldo no fim do mês.
- Estimar a primeira melhora, o começo possível dos aportes e a estabilidade sustentada como **marcos diferentes**.
- Alocar capacidade com prioridades explícitas e sem percentuais universais.
- Simular compras à vista ou parceladas, respeitando **todos** os vencimentos e compromissos protegidos.
- Distinguir valores realizados, contratuais, estimados, reservados e apenas simulados.
- Permitir mudança do estado da UI sem produzir alarmismo ou falsa sensação de segurança.

### Fora do escopo desta ADR

- Movimentação automática de dinheiro, execução de pagamentos, contratação de crédito ou recomendação personalizada de produtos financeiros.
- Nota pública de saúde financeira, “score” de crédito, classificação do Banco Central ou equivalência ao I-SFB.
- Conciliação completa de cartões e faturas rotativas, mantida para uma ADR específica conforme ADR-008.
- Redesenho visual definitivo da Home, migrações e alteração de código nesta etapa.
- Promessa de rentabilidade, inflação, renda futura ou crédito aprovado.

---

## 2. Alternativas consideradas e decisão

| Alternativa | Vantagem | Problema | Resultado |
|---|---|---|---|
| A. Classificar por percentual de endividamento ou saldo | Simples | Confunde financiamento administrável com inadimplência; ignora vencimentos e liquidez | **Rejeitada** |
| B. Criar score ponderado de 0 a 100 | Fácil de exibir | Pesos arbitrários e baixa explicabilidade; falsa precisão | **Adiada** |
| C. Motor determinístico de restrições, indicadores e marcos projetados | Explicável, testável e compatível com planejamento por data | Exige reconciliação e dados confiáveis | **Adotada como direção** |

**Decisão:** construir um **planejador financeiro com restrições de caixa e motor de prioridades**, composto por quatro responsabilidades independentes:

1. **Diagnóstico financeiro:** computa cobertura, pressão da dívida, liquidez, reserva e estado da pessoa.
2. **Projeção de recuperação:** localiza marcos futuros a partir do calendário financeiro e de condições de sustentação.
3. **Alocação de capacidade:** distribui valores elegíveis conforme obrigações protegidas, custos da dívida, liquidez e objetivos.
4. **Planejador de objetivos:** encontra a primeira data viável para compras/compromissos futuros, testando o fluxo completo.

A **reconciliação patrimonial** é uma responsabilidade transversal obrigatória para todos os motores.

---

## 3. Fluxo lógico e fronteiras

```text
Entradas normalizadas e com proveniência
   |-- contas/saldos e baixas       (caixa realizado)
   |-- títulos/recorrências         (compromissos/recebíveis)
   |-- eventos econômicos           (consumo/competência)
   |-- contratos de dívida          (principal, juros, parcelas)
   |-- orçamentos e provisões       (limites, não saldos)
   |-- reservas/ativos              (liquidez e finalidade)
   |-- objetivos e cenários         (não executados)
            |
            v
Calendário financeiro diário + integridade e qualidade dos dados
            |
            +--> Diagnóstico atual e fatores que explicam o estado
            +--> Recuperação: melhora / pode guardar / estabilidade
            +--> Capacidade alocável e prioridades
            +--> Simulador de compras e comparação de cenários
            |
            v
Visão Geral (agir agora) / Planejamento (evoluir no tempo)
```

### 3.1 Fontes de verdade e semântica

| Conceito | Fonte principal | Regra |
|---|---|---|
| Consumo e orçamento | `kc_economic_events` / regras de orçamento da ADR-008 | Evento econômico por `occurred_on`; **não** contar baixa como novo consumo |
| Agenda de obrigações | `kc_titles` e recorrências | Fluxo por `due_on`, abatido pelo quitado |
| Caixa realizado | `kc_wallets` e `kc_settlements` | Saldo ancorado + baixas após a âncora; reversão auditável |
| Dívida contratual | `kc_liabilities` evoluída ou contrato relacionado | Saldo devedor do principal por data; **não** somar todas as parcelas como dívida adicional |
| Reserva | Caixa/investimento elegível + destinação | Valor com liquidez e finalidade, sem criar dinheiro novo |
| Bens e investimentos | `kc_assets` ou entidade equivalente reconciliada | Evitar duplicidade com carteiras, ativos e saldos investidos |
| Cenário | Entrada virtual da simulação | Não altera títulos, baixas ou saldos reais |

**Estados de informação distintos:** `realizado`, `contratual`, `estimado`, `destinado/protegido` e `simulado`. Todo resultado deve ser rastreável às entradas, à data-base, às premissas e à versão da política aplicada.

**Três datas preservadas:** `occurred_on` (competência), `due_on` (exigibilidade) e `settled_on` (liquidação). Não reclassificar um pagamento como novo gasto.

### 3.2 Projeções e incerteza

- Horizonte **operacional recomendado: 12 meses**; simular horizontes maiores somente com premissas explícitas e confiança reduzida.
- Preservar as curvas da ADR-008: **`contractual`** para obrigações conhecidas e **`within_budgets`** para consumo adicional previsto dentro dos limites.
- A ADR-008 aloca o residual de orçamento no último dia do mês; essa convenção **não deve ser interpretada como prova de liquidez nos dias anteriores**. A verificação de vencimentos usa a curva contratual e a cobertura de despesas variáveis exige sensibilidade/cenário conservador explicitado.
- Uma receita esperada pode participar de uma **previsão condicionada**, mas **nunca** se torna caixa realizado disponível para um aporte hoje.
- Quando faltarem dados essenciais, apresentar `Dados para completar` / `Previsão limitada`, com os campos que faltam. Não estimar datas falsas.

---

## 4. Indicadores canônicos

Os valores monetários são persistidos em **centavos inteiros**, com datas de calendário no fuso `America/Sao_Paulo` e cálculos determinísticos.

| Indicador | Definição de negócio | Cuidado |
|---|---|---|
| `outstandingDebtCents` | Soma dos saldos devedores contratuais vigentes | Excluir parcelas já incorporadas ao saldo contratual; diferenciar dívida de conta a pagar |
| `monthlyDebtServiceCents` | Pagamentos de dívida exigíveis no mês: principal + juros + encargos conhecidos | Pagamento mínimo e custo total devem ser identificáveis |
| `incomeCommitmentRatio` | Serviço mensal da dívida / renda líquida **recorrente** | Renda nula, zero ou não recorrente ⇒ indicador indisponível, não percentual enganoso |
| `coverageByDueDate` | Caixa/projeções elegíveis em cada vencimento vs. obrigação protegida | Um saldo mensal positivo não compensa falta de caixa amanhã |
| `minProjectedCashCents` | Menor caixa diário no horizonte/cenário | Explicitar qual curva e data geraram o mínimo |
| `planMarginCents` | Receitas previstas − obrigações − consumo planejado − provisões | Margem mensal não equivale a dinheiro transferível hoje |
| `emergencyCoverageMonths` | Reserva líquida elegível não comprometida / custo essencial mensal | Se denominador desconhecido ⇒ não computar |
| `eligibleAllocationCents` | Valor que sobra após proteger caixa mínimo e obrigações até a próxima entrada confiável e demais travas | Não usar recebível incerto como caixa confirmado |
| `capitalFormationCents` | Aportes reais líquidos + valorização identificada, segregados por origem | Não confundir transferência própria com rendimento |
| `netWorthCents` | Caixa + ativos não duplicados − passivos contratuais em aberto | Com dívida sem reconciliação, exibir patrimônio parcial/incerto |

O motor deverá expor **explicações** e **proveniência** por indicador; nenhum número derivado deve ser interpretado como confirmado se depende de dados estimados.

---

## 5. Estados de saúde financeira

Os estados são **linguagem própria do kuantoconta**, e não diagnóstico oficial de Febraban, Banco Central, CFPB ou Financial Health Network.

| Prioridade | Estado | Condição conceitual para classificação | UX principal |
|---|---|---|---|
| Bloqueio de dados | **Dados para completar** (neutro) | Falta saldo ancorado, renda/despesa essencial, calendário de vencimentos ou dados de dívida necessários à conclusão | Mostrar lacunas e só indicadores verificáveis |
| 1 | **Vermelho — Contas em risco** | Conta essencial vencida sem solução; obrigação prioritária sem cobertura no vencimento; ou projeção contratual indica falta de caixa relevante | “Contas em risco” e ação imediata |
| 2 | **Laranja — Reorganizando** | Obrigações prioritárias cobertas, mas margem insuficiente/instável, pressão de dívida ou proteção ainda inadequada | “Reorganizando” |
| 3 | **Azul — Em equilíbrio** | Compromissos cobertos e capacidade recorrente de aporte com proteção inicial, mas reserva-alvo/capital ainda em construção | “Em equilíbrio” |
| 4 | **Verde — Protegido e acumulando** | Compromissos cobertos de forma sustentada, dívidas administráveis, reserva adequada ao perfil e formação efetiva de capital | “Protegido e acumulando” |

### 5.1 Regras obrigatórias

1. **Sem threshold universal inventado.** Critérios quantitativos de dívida “cara”, margem mínima, proteção inicial, reserva adequada e meses de sustentação serão configuráveis, versionados e aprovados em testes de produto.
2. **Risco de caixa sobrepõe média mensal:** falta de dinheiro antes do vencimento tem precedência sobre patrimônio ou saldo de dezembro.
3. **Dívida nominal não determina cor:** financiamento grande com parcelas administráveis e liquidez pode estar em azul/verde; dívida pequena inadimplente pode estar em vermelho.
4. **Investimento sem liquidez não garante verde.**
5. **Estado é calculado com razões legíveis**, por exemplo `ESSENTIAL_OVERDUE`, `DUE_DATE_GAP`, `LOW_INITIAL_RESERVE`, `MARGIN_UNSTABLE`.
6. **Histerese:** piora material e risco real podem rebaixar imediatamente; promoção exige cumprimento sustentado, com janela `K` definida e homologada. Receber salário e pagar contas no mesmo dia não deve gerar alternância cosmética.
7. **Dados insuficientes não são “saúde ruim” nem “saúde boa”.** Um risco já comprovado pode ser exibido mesmo com cobertura geral desconhecida; nesse caso mostrar risco comprovado e a limitação de completude.

### 5.2 Política de avaliação proposta

Avaliar primeiro **integridade e suficiência** da base, depois **gatilhos de risco**, depois **capacidade sustentada** e finalmente **reserva/capital**. A classificação acompanha o **cenário e o grau de confiança**; não juntar o melhor cenário de receita com o pior cenário de despesa de modo invisível.

Parâmetros para homologar: `K` (meses de estabilidade), `minimumCashFloorCents`, `initialReserveTarget`, `fullReserveTargetMonths`, critério de `expensiveDebt`, limites de volatilidade e materialidade de atraso. **Esta ADR não fixa valores numéricos sem validação.**

---

## 6. Recuperação e primeiros aportes: três marcos distintos

O motor percorre o calendário diário para cada mês do horizonte e calcula:

1. **`firstCoveredMonth`:** primeiro mês no qual obrigações prioritárias têm cobertura por data, sem atrasos essenciais não solucionados.
2. **`firstSavingMonth`:** primeiro mês com **capacidade projetada positiva** para reserva/aporte, após restrições e compromissos prioritários; não é transferência autorizada hoje.
3. **`firstStableMonth`:** primeiro mês a partir do qual cobertura, margem mínima e robustez permanecem válidas por **K meses consecutivos**, conforme política homologada.

**Teste de um mês coberto:** obrigações protegidas cobertas **em cada vencimento** e caixa não inferior ao piso protegido nas datas relevantes. Para estabilidade sustentada, repetir a condição na janela de K meses e testar variações plausíveis nas entradas e no consumo. Caso não existam K meses observáveis no horizonte, **não declarar estabilidade sustentada**.

**Exemplo somente ilustrativo:** renda mensal R$ 2.700, essenciais + limites R$ 1.950, dívida R$ 650/mês até abril e R$ 250/mês a partir de maio ⇒ margens aritméticas de R$ 100 e R$ 500, respectivamente. A capacidade real de aportar dependerá do caixa em cada data, da reserva protegida e da confiabilidade das entradas. A mensagem apropriada pode ser **“Mais margem a partir de maio”**; **“Plano estável a partir de julho”** exige cálculo adicional, não pode ser deduzido só da margem.

**Sem data viável:** retornar `null` e motivos (`INSUFFICIENT_CASH`, `UNKNOWN_INCOME`, `HORIZON_TOO_SHORT` etc.). Exibir **“O plano ainda não fecha”**, nunca inventar um mês otimista.

**Atualização:** baixa, nova obrigação, mudança de salário, alteração de limite, reserva ou contrato de dívida disparam novo cálculo dos marcos; os lançamentos realizados permanecem intocados.

---

## 7. Capacidade alocável e motor de prioridades

### 7.1 Diferença mandatória

- **Margem do mês:** resultado planejado do período.
- **Caixa confirmado:** recursos efetivos já disponíveis.
- **Capacidade alocável hoje:** parcela do caixa confirmado que pode ser comprometida **sem abrir falta nas obrigações protegidas antes da próxima receita confiável**, considerando piso mínimo e reservas vinculadas.
- **Capacidade futura projetada:** depende de recebimentos e condições futuras; nunca deve aparecer como transferência disponível agora.

Formulação conceitual para uma alocação candidata `A` hoje:

```text
Para todas as datas d da janela de proteção:
  saldo_projetado_com_alocacao(d) >= piso_de_caixa_protegido(d)
  todas_as_obrigacoes_prioritarias_em_d(d) estão cobertas

A_hoje = maior valor não negativo que atende às restrições
          usando caixa efetivo e receitas futuras com confiança admitida pela política
```

Uma receita ainda não recebida pode ajudar a explicar a **capacidade futura**, mas não criar **disponibilidade hoje**. A janela de proteção e o tratamento de receitas confirmadas ainda por receber precisam de homologação específica.

### 7.2 Ordenação de prioridades

1. **Preservar essenciais e mínimos contratuais** (moradia, alimentação essencial, serviços críticos, parcelas mínimas e provisões inevitáveis).
2. **Regularizar atrasos e risco imediato**, evitando novo ciclo de encargos/insuficiência.
3. **Avaliar dívida de custo elevado versus colchão inicial de emergência**, considerando taxa efetiva/CET, custo de atraso, liquidez e preferência informada.
4. **Ampliar reserva e formar capital**, apenas sobre capacidade realmente disponível.
5. **Financiar objetivos aprovados** com o excedente não comprometido.

As camadas superiores funcionam como **restrições fortes**, não apenas pesos de um score. Dentro da camada 3, a política poderá propor divisão, mas nunca adotar um **70/30** ou **80/20** fixo universal.

Exemplos ilustrativos para R$ 100 de capacidade real:
- Essencial descoberto ⇒ prioridade integral à cobertura; nenhum aporte de investimento.
- Dívida cara e reserva zero ⇒ comparar amortização integral ou divisão com proteção inicial, exibindo custo/benefício e restrições.
- Dívida administrável e reserva abaixo da meta ⇒ priorizar proteção antes de objetivos opcionais.
- Reserva adequada, dívida cara ausente e caixa estável ⇒ permitir destinação a capital/objetivos.

**O motor recomenda e simula; não movimenta contas nem altera contratos sem ação explícita.**

---

## 8. Programador de compras e objetivos (analogia PCP/MRP)

A analogia é arquitetural: dinheiro disponível por data corresponde à disponibilidade de material; obrigações são demandas; piso/reserva são estoque de segurança; compras futuras representam necessidades a programar.

### 8.1 Entradas por objetivo

- Descrição, custo total, categoria, prioridade e data desejada (opcional).
- Modalidade: à vista, entrada + parcelas, ou alternativas comparáveis.
- Entrada, número e datas das parcelas, juros/encargos e **CET/total efetivo** quando aplicável.
- Restrições de caixa, reserva vinculada, compromissos já aprovados, condições de crédito **informadas/confirmadas**, e tolerância a cenários.
- Origem dos valores: usuário, contrato, estimativa ou hipótese de simulação.

### 8.2 Algoritmo de viabilidade

1. Congelar `snapshot/asOf`, política e premissas para execução reprodutível.
2. Construir calendário diário de caixa, títulos, limites, provisões, dívidas, reservas e objetivos protegidos.
3. Enumerar datas candidatas futuras em ordem crescente dentro do horizonte configurado.
4. Injetar **virtualmente** entrada/compra e **todas as parcelas** com datas e valores efetivos.
5. Recalcular as curvas e rejeitar qualquer candidata que viole vencimento essencial, piso de caixa, reserva protegida ou objetivo de precedência superior.
6. Validar integralmente o prazo financeiro: se uma parcela ultrapassar o horizonte disponível, **estender a simulação com premissas explícitas** ou retornar `HORIZON_INSUFFICIENT`, nunca aprovar parcialmente.
7. Selecionar a **primeira data viável**, com justificativas, cenário e grau de confiança; caso não exista, explicar gargalo e possíveis ajustes.
8. Comparar cenários sem registrar pagamento, título ou compra reais.

### 8.3 Exemplo de bloqueio de falsa viabilidade

Saldo hoje R$ 700; aluguel R$ 600 vence amanhã; salário só no dia 15. **Não** autorizar entrada de R$ 500 no notebook hoje, embora a conta mostre saldo superior à entrada. O motor identifica que a data rompe a cobertura do aluguel.

Compra ilustrativa de R$ 2.500 com entrada R$ 500 e 10 parcelas de R$ 200 só pode receber “Cabe no plano a partir de [mês calculado]” após a aprovação da entrada **e das 10 parcelas**, sem pressupor juros inexistentes ou crédito aprovado.

**Cenários comparáveis:** à vista, parcelado, entrada maior, adiar compra e reduzir orçamento de categoria. Replanejamento afeta apenas simulações e compromissos futuros editáveis; **nunca reescreve baixas realizadas**.

---

## 9. Projeção patrimonial e prevenção de dupla contagem

1. **Amortização do principal:** diminui caixa **e** passivo pelo componente principal; não é perda patrimonial equivalente ao pagamento total. Juros/taxas são custo econômico separado.
2. **Aporte para reserva:** transferência ou destinação entre valores próprios; não cria despesa nem ativo adicional fictício.
3. **Aplicação/investimento:** não duplicar o saldo aplicado em `kc_wallets` e `kc_assets`; registrar posse e liquidez de forma reconciliável.
4. **Compra de bem:** se ativo patrimonial reconhecido, criar/atualizar o bem sem duplicar o gasto e sem presumir que preço de compra = valor justo permanente.
5. **Títulos futuros:** são agenda de pagamento/recebimento; distinguir obrigações contratuais já incluídas no passivo de despesas futuras não incorridas.
6. **Orçamentos:** são limites, não saídas realizadas nem saldos segregados.
7. **Cenários:** não alteram ledger realizado, dívida real ou patrimônio efetivo até confirmação transacional.

O produto deve distinguir **capital disponível**, **reserva protegida**, **patrimônio líquido** e **capacidade futura**, com rótulos distintos e sem soma indevida.

---

## 10. Modelo de dados — responsabilidades a evoluir

As entidades abaixo são **necessidades lógicas**, não ordens para executar uma migration específica.

| Responsabilidade | Base existente | Evolução proposta |
|---|---|---|
| Caixa e calendário | `kc_wallets`, `kc_settlements`, `kc_titles`, `kc_recurring_rules` | Âncoras consistentes, recorrências confirmadas/estimadas, obrigações prioritárias e proveniência |
| Fato econômico/orçamento | `kc_economic_events` e `kc_budget_*` previstos na ADR-008 | Natureza essencial/opcional, provisões, consumo com ausência de dupla contagem |
| Dívidas | `kc_liabilities` | Saldo devedor em data, vínculo ao contrato, taxa/custo, amortização de principal, juros e calendário de parcelas |
| Reservas e ativos | `kc_assets` / caixa | Finalidade, disponibilidade, prazo de resgate, proteção, histórico e vínculo sem duplicidade |
| Perfil de planejamento | Configurações do usuário | Piso mínimo, despesas essenciais, preferências de prioridade e metas de reserva |
| Objetivos | A modelar | Condições de compra, prioridade, preço, custos, modalidades e datas desejadas |
| Cenários e execução | `compute` / `computeRange` | Snapshot, versão de política, horizonte, premissas, motivos de rejeição, indicadores de confiança e resultados reproduzíveis |

**Requisitos de persistência e segurança:** escopo por `user_id` derivado exclusivamente da sessão; chaves/relacionamentos compatíveis com FKs compostas; moeda em centavos inteiros, datas sem ambiguidade, operações idempotentes, transações atômicas, auditoria de revisões e nenhuma alteração silenciosa de fatos realizados.

**Observação:** decidir **estender `kc_liabilities` ou introduzir tabelas de contratos/amortização** somente depois de inspecionar schema e casos reais; não criar estruturas redundantes prematuramente.

---

## 11. Contrato de saída para UI e serviços

O serviço de domínio deve devolver dados estruturados, não frases embutidas na lógica financeira. Exemplo **conceitual**, sem schema final homologado:

```json
{
  "asOf": "YYYY-MM-DD",
  "policyVersion": "proposed-v1",
  "dataQuality": {
    "status": "complete | partial | insufficient",
    "missingFields": [],
    "assumptions": []
  },
  "diagnosis": {
    "state": "unknown | red | orange | blue | green",
    "reasonCodes": [],
    "indicators": {},
    "scenario": "contractual | within_budgets | conservative"
  },
  "milestones": {
    "firstCoveredMonth": null,
    "firstSavingMonth": null,
    "firstStableMonth": null,
    "confidence": "high | conditional | insufficient"
  },
  "allocation": {
    "eligibleTodayCents": null,
    "projectedMonthlyCents": null,
    "proposals": []
  },
  "goals": {
    "firstFeasibleDate": null,
    "isFeasible": false,
    "rejectionReasons": []
  }
}
```

Datas e valores `null` são **intencionais** quando não verificáveis. Políticas de confidencialidade e retenção de snapshots serão detalhadas na implementação; não registrar dados bancários sensíveis em logs de depuração.

---

## 12. Consequências na experiência (não é mock homologado)

**Visão Geral — “Como estou e o que preciso fazer agora?”**

- Estado atual e motivo principal; compromissos em risco; contas a vencer; dívidas restantes; limites do mês; próxima mudança **se verificável**.
- Situação crítica ⇒ priorizar ação concreta e vencimento, sem ocultar valor devido.
- Texto curto e não julgador: `Contas em risco`, `Reorganizando`, `Em equilíbrio`, `Protegido e acumulando`.

**Planejamento — “Como minha situação evolui e o que posso realizar?”**

- Evolução mensal da dívida, proteção, patrimônio/capital e disponibilidade; marcos de recuperação; capacidade de aporte; cenários de compras.
- Mensagens condicionais: `Mais margem a partir de maio`, `Pode começar a guardar em maio`, `Plano estável a partir de julho`, `Cabe no plano a partir de setembro` e `Ainda não cabe no plano`. Os meses são **exemplos**, não resultados.
- Separar **previsto** de **realizado** e oferecer motivo/hipóteses ao expandir o card.

**Cores e acessibilidade:** vermelho, laranja, azul e verde afetam indicadores e pontos de atenção, **não a tela inteira**. Manter estrutura, tipografia, contraste e rótulos consistentes. Cor nunca será o único sinal; preservar ícone/texto e acessibilidade. A histerese deve evitar alternância frequente sem motivo real.

---

## 13. Invariantes e critérios de aceite (gate bloqueante)

| ID | Cenário | Resultado obrigatório |
|---|---|---|
| FH-01 | Dívida nominal alta, parcelas administráveis, caixa e reserva adequados | **Não** atribuir vermelho somente pelo saldo devedor |
| FH-02 | Saldo R$ 700; aluguel R$ 600 amanhã; compra com entrada R$ 500 hoje | **Rejeitar** compra por falta de cobertura por data |
| FH-03 | Receita esperada no dia 15 e não recebida | Não transformar em caixa **confirmado** para aporte hoje |
| FH-04 | Conta essencial em atraso + margem mensal R$ 100 | Priorizar regularização; não propor investimento automático |
| FH-05 | Dívida cara + reserva zero + capacidade real positiva | Comparar amortização e proteção inicial com justificativa, sem 70/30 fixo |
| FH-06 | Parcela quitada com parte principal e parte juros | Abater principal do passivo; registrar custo dos juros separadamente |
| FH-07 | Aporte de R$ 100 à reserva na mesma instituição | Patrimônio não aumenta artificialmente; caixa total próprio permanece reconciliado |
| FH-08 | Investimento líquido já consta como ativo e também como conta | Evitar dupla contagem no patrimônio |
| FH-09 | Compra com entrada e 10 parcelas | Verificar **todos** os vencimentos e encargos, não somente a entrada |
| FH-10 | Última parcela fora do horizonte verificado | Estender com premissas ou rejeitar por horizonte insuficiente |
| FH-11 | Nenhuma data de compra viável | Exibir “Ainda não cabe no plano”, sem data inventada |
| FH-12 | Queda de renda / nova despesa | Recalcular estados, marcos, alocações e objetivos; preservar fatos já realizados |
| FH-13 | Informações estruturais incompletas | Exibir estado neutro/limitação, sem verde e sem recuperação fabricada |
| FH-14 | Recebimento e pagamento no mesmo dia | Não oscilar entre vermelho e verde por mudança cosmética de caixa |
| FH-15 | Conta essencial realmente descoberta após mudança | Rebaixar e destacar risco imediatamente |
| FH-16 | Orçamento já inclui título fixo | Não somar a despesa duas vezes na projeção |
| FH-17 | Residual `within_budgets` lançado no fim do mês | Não usar esse artifício para garantir liquidez antes de vencimentos |
| FH-18 | Atualização de cenário de compra | Não gerar `kc_titles`/`kc_settlements` reais até confirmação explícita |
| FH-19 | Renda recorrente zero/desconhecida | Não calcular proporção de renda comprometida com divisor zero |
| FH-20 | Dados de dois usuários distintos | Nenhum indicador, reserva, dívida ou cenário pode atravessar `user_id` |

**Testes exigidos:** testes unitários puros de domínio, fixtures de calendário/dívida, testes de propriedade para prevenção de dupla contagem, regressão de `finance.js`/`period.js`/`budgets.js`, transações atômicas e E2E com dois usuários. Usar políticas parametrizadas para que alterações de threshold não invalidem os invariantes financeiros.

---

## 14. Etapas e gates de implementação

| Gate | Entrega | Saída exigida |
|---|---|---|
| **FH-00 — Homologação de domínio** | Confirmar ADR-008 como dependência, definir thresholds/qualidade e 20 testes de aceitação | Política versionada aprovada; **sem migration antes do gate** |
| **FH-01 — Reconciliação de dados** | Contratos/saldos de dívida, componentes de juros, liquidez e reservas, entradas com proveniência | Sem dupla contagem; migração aditiva e backfill auditável |
| **FH-02 — Diagnóstico** | Indicadores, razão da classificação, dados insuficientes e histerese | Testes FH-01..FH-05, FH-13..FH-17, FH-19..FH-20 |
| **FH-03 — Recuperação e capacidade** | Calendário, três marcos, restrições por vencimento e propostas de alocação | Testes de caixa e de ausência de promessas falsas |
| **FH-04 — Objetivos e cenários** | Programador de compras, busca de data e comparação | Testes FH-02, FH-09..FH-12, FH-18 |
| **FH-05 — UX e telemetria** | Visão Geral vs. Planejamento, cores contextualizadas e explicações | Testes de acessibilidade e validação de interpretação |
| **FH-06 — Homologação final** | Cenários reais anonimizados + casos extremos | Aprovação antes de uso como orientação financeira real |

**Regra de entrega:** implementar cada gate em issues/PRs separadas, sem refatoração ampla não relacionada; disponibilizar prévia isolada, não alterar `main` sem revisão e não redesenhar a Home como substituto para o motor.

---

## 15. Questões pendentes para homologar

1. Quais despesas contam como **essenciais** e como sinalizar que uma classificação foi inferida?
2. Qual piso de caixa, colchão inicial, meta de reserva (em meses) e diferença entre reserva líquida versus resgate condicionado?
3. Como caracterizar dívida **cara** com taxa, CET, mora, quitação antecipada e custo de oportunidade?
4. Quantos meses `K` de melhora sustentada e qual cenário adverso mínimo devem sustentar uma promoção de estado?
5. Como ponderar renda variável, bônus, inadimplência de recebíveis e despesas sazonais?
6. Como estimar vencimentos de gasto variável quando a ADR-008 projeta residual apenas no último dia?
7. Como apresentar compromissos de cartão enquanto a conciliação de fatura está fora do escopo?
8. Quais dados mínimos permitem relatório parcial e quais bloqueiam classificação ou data?
9. Como implementar o contrato de dívida: evolução de `kc_liabilities` ou entidades especializadas?
10. Como versionar políticas, snapshots, explicações e alterações do usuário sem armazenar dados desnecessários?

**Não resolvidos ≠ autorização tácita.** Esses pontos devem gerar decisões explícitas antes do gate FH-00 ser aprovado.

---

## 16. Consequências e riscos

**Benefícios:** diferencia endividamento de risco de inadimplência; evita recomendar aportes inviáveis; oferece recuperação estimada e compras programadas; dá sentido funcional aos quatro estados da UI; cria critérios testáveis para Gemini/Codex.

**Custos:** maior complexidade de domínio, contratos de dívida, sensibilidade a dados incompletos, simulação diária mais cara, necessidade de testes/observabilidade e governança de hipóteses. Pode haver **nenhuma previsão confiável**, e a UI deve representar essa condição.

**Risco de produto:** apresentar “saúde normalizada” ou “pode gastar hoje” com dados insuficientes. **Mitigação:** datas condicionais, explicação de premissas, calibração dos thresholds, retorno nulo e restrições por vencimento.

---

## 17. Relação com documentos e referências

- [ADR-008 — Eventos econômicos, títulos, baixas, orçamentos e projeção](./ADR-008-budgets-economic-events-and-projection.md) — dependência **proposta**; preserva suas invariantes.
- `docs/03-architecture/ARCHITECTURE.md` — descrição do núcleo atual e das regras de saldo, patrimônio e segurança.
- `apps/web/lib/finance.js`, `period.js` e `budgets.js` — implementação existente a ser evoluída, não substituída indiscriminadamente.
- Investigação ampliada fornecida pelo produto, 17/11/2026 — base de hipóteses, cenários, cópias de UX e critérios de aceitação.
- Referências conceituais citadas na investigação: I-SFB (Febraban/Banco Central), Financial Health Network, CFPB, FDIC e NFCC. **Não** há adoção de score, cores ou limites oficiais dessas instituições nesta ADR.

**Conclusão:** a próxima etapa é **homologar a lógica financeira e os parâmetros**; somente depois abrir as issues de implementação e transformar os resultados em componentes visuais definitivos.
