# Especificação funcional — kuantoconta
**Fonte principal:** [BRIEFING.md](BRIEFING.md). **Status:** contrato de implementação V1 desktop.

## Navegação principal
- **Visão geral:** posição em data selecionada, saldo, contas a pagar/receber, resultado do período, patrimônio, menor caixa previsto, gráfico diário e tabela mês a mês.
- **Movimentos:** carteira com filtros a pagar/a receber, pendente/baixado/parcial/vencido, data, categoria, conta, ações de baixar, editar e excluir.
- **Planejamento:** regras de títulos recorrentes/parcelados, origem do dinheiro, saldo disponível prudente, simulação sem gravar.
- **Cadastros:** contas com saldo de abertura datado; categorias/subcategorias; ativos/passivos opcionais.
- **Conta:** dados pessoais, termos, privacidade, exportar dados, exclusão e sair.

## Termos do domínio e suas fronteiras
- **Título:** obrigação ou direito futuro datado. A pagar é saída; a receber é entrada. Possui valor original, saldo aberto e vencimento.
- **Baixa:** liquidação de título; total ou parcial; possui data efetiva, valor e conta movimentada.
- **Conta:** carteira/corrente/poupança/dinheiro com saldo inicial em uma data. Não confundir conta bancária com título a pagar.
- **Receita/despesa:** efeito econômico; transferência interna e liquidação do principal de empréstimo NÃO são novas receitas ou novo consumo.
- **Dívida contratada:** obrigação de capital já assumida, distinta da soma de despesas recorrentes futuras.
- **Planejamento:** ocorrências geradas de regras + títulos avulsos; uma regra não pode recriar a mesma ocorrência.
- **Cenário:** overlay de mudanças hipotéticas, sem alterar dados confirmados.
- **Orçamento por categoria:** limite mensal virtual e opcional no nível da categoria principal de despesa (sem rollover automático e sem criar conta bancária fictícia).
- **Evento econômico (`occurred_on`):** fato de consumo/receita distinto do vencimento (`due_on`) e da baixa (`settled_on`); baixar ou reverter pagamento nunca duplica consumo no orçamento.

## Cálculos obrigatórios
- `resultado_periodo = recebimentos_por_data_prevista - pagamentos_por_data_prevista` (ou realizado, conforme modo).
- `caixa(D) = soma_saldos_iniciais_ancorados + baixas_reais_apos_ancora + titulos_pendentes_previstos_ate_D`; só incluir título em aberto na projeção.
- `sobra_mes = entradas_do_mes - saidas_do_mes`; negativo deve permanecer negativo.
- `total_a_pagar(D) = soma_saldos_pendentes_de_titulos_com_vencimento_ate_D`; oferecer também visão de todos os títulos conhecidos.
- `total_a_receber(D) = soma_saldos_pendentes_recebiveis_com_vencimento_ate_D`.
- `endividamento_contratado(D) = soma_saldos_devedores_de_dividas_contratadas_em_D`. Separar `parcelas_restantes_ate_ultima_quitacao` e juros futuros, quando conhecidos.
- `patrimonio_liquido(D) = caixa(D) + outros_ativos(D) - passivos(D)`, sem somar o mesmo dinheiro/obrigação duas vezes.
- `livre_para_gastar(D) = max(0, menor_saldo_futuro_no_horizonte - reserva_protegida)` SOMENTE se saldos e obrigações estiverem validados. O cartão não é caixa.
- Valores em **centavos inteiros** em toda a fronteira financeira; nunca somar float JS.
- Dia e fuso definidos por America/Sao_Paulo; mês e 31/12 são limites locais.
- Prévia mensal agregada deriva da mesma projeção diária. Meses com renda futura insuficiente revelam déficits antes da entrada seguinte.

## User stories priorizadas
**US-01** Como pessoa, quero registrar contas e saldo datado para estabelecer minha posição inicial.
**US-02** Quero registrar uma receita que se repete todo dia 5 para projetar os próximos meses.
**US-03** Quero registrar uma compra em 10 parcelas a partir da 4ª para visualizar somente 7 parcelas futuras.
**US-04** Quero baixar parcialmente uma conta sem perder o saldo restante.
**US-05** Quero clicar num mês ou selecionar uma data para ver exatamente quanto sobrará ou faltará.
**US-06** Quero visualizar meus gastos agrupados por categoria e descobrir o que pesa mais.
**US-07** Quero ver o patrimônio projetado até 31/12, com ativos e dívidas separados.
**US-08** Quero simular reduzir uma despesa sem alterar o planejamento original.
**US-09** Quero ter meus dados isolados, exportáveis e protegidos por login.

## Formulário único (a pagar / a receber)
Campos obrigatórios: descrição, valor em BRL, tipo, vencimento, conta, categoria. Avançados: subcategoria, tags, notas, situação, repetição, primeira parcela, total de parcelas, frequência, valor total vs. parcela, começar na parcela N, salvar e continuar.
- Não recorrente: um título.
- Fixa mensal: regra aberta com data inicial; gera ocorrências sob demanda com ID estável no horizonte.
- Parcelar/repetir: série finita com intervalo; distinguir **valor total do contrato** e **valor por parcela**; distribuir resíduos de centavos; começar na parcela N sem recadastrar parcelas pagas.
- Editar ocorrência: somente esta / esta e seguintes / série toda, preservando histórico de baixas.

## Estados
Vazio; carregando; salvo; erro de validação; sem conexão; falta saldo confiável; previsto; vencido; parcialmente quitado; quitado; sessão expirada. Não confirmar salvar antes do servidor persistir.

## Aceite V1 desktop
Cadastro/login/termos -> saldo inicial -> 1 receita mensal + 1 despesa mensal + dívida parcelada -> dashboard sem números fictícios -> seleção mês/data -> baixar 1 título -> resultado atualizado e auditável. Auditoria de duas contas distintas é bloqueante para publicação.
