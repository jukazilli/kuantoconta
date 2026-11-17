# UX de cadastro, navegação e projeção

## Objetivo do fluxo
Cadastro sem linguagem contábil complexa. A referência funcional de formulário enviada pelo responsável foi o aplicativo Minhas Finanças; referência de domínio de títulos e baixas é TOTVS. Reconstruir **nossos próprios componentes**.

## F01 — Primeiro acesso
1. Apresentar promessa central do produto e botão criar conta.
2. Exibir links para Termos de Uso e Aviso de Privacidade, versão e checkbox **desmarcado**: «Li e aceito os Termos de Uso e declaro ciência do Aviso de Privacidade».
3. Coletar nome, e-mail e senha; chamar Neon Auth; registrar aceite autenticado no nosso banco com versão/data; liberar dashboard só após aceite. Nunca registrar aceite fictício nem criar conta sem tratamento transparente.
4. Primeiro acesso: saldo inicial e data, conta principal e, opcionalmente, primeira receita e despesa. Permitir pular dados; nesse caso projeção numérica exibe «A calcular».

## F02 — Criar a pagar / a receber
Layout de formulário em **drawer** lateral no desktop, com seções compactas: descrição; valor; repetição; vencimento; estado pendente/efetivado; categoria/subcategoria; conta; tags; salvar e continuar opcional.

A repetição abre seleção:
- **Não recorrente:** um título.
- **Parcelar ou repetir:** abre painel secundário com «Começar na parcela», «Total de parcelas», «Frequência», «Valor total» e «Valor da parcela».
- **Fixa mensal:** regra recorrente de prazo indeterminado a partir de um vencimento.

Exemplo de 10×R$100 iniciando na parcela 4: registrar 7 parcelas futuras de R$100; não cadastrar as 1–3 já pagas. Valor original R$1000; total previsto restante R$700. A prévia mostra 4/10..10/10 antes de salvar.

**IMPORTANTE:** lançamento de dívida financeira ≠ despesa de consumo nova. Quando o usuário cadastra saldo devedor existente com parcelas, a amortização liquida passivo, e juros só viram despesa financeira quando especificados. MVP inicial simplificado mostra contas/compromissos; a contabilização completa de empréstimos requer tela especializada.

## F03 — Carteira de movimentos
Tabs «A pagar» e «A receber» com filtros; colunas descrição, categoria, conta, vencimento, valor original, saldo pendente, estado, ações.
- Clicar título: detalhes e histórico de baixas.
- Baixa: total/parcial, conta e data efetiva, atualização imediata do saldo e do pendente.
- Editar série: somente esta, esta e próximas, todas as ocorrências **não liquidadas**, nunca sobrescrever movimentação efetivada sem estorno explícito.

## F04 — Dashboard
Seletor de data: hoje, fim do mês, 31 de dezembro e data personalizada. O motor retorna posição na data, gráfico com saldo ao longo do período, receitas e pagamentos e destino das despesas.
- Card de dinheiro livre só apresenta valor quando há base suficiente; senão «A calcular».
- Clicar «A pagar» abre títulos responsáveis; clicar «Sobra mensal» abre receitas/despesas que a compõem.
- Distinção visual obrigatório: **realizado**, **previsto**, **hipotético**.

## F05 — Simular
Cenário temporário: adição de despesa, antecipação/adiamento de título ou ajuste de renda; mostrar saldo/patrimônio base versus modificado, sem INSERT/UPDATE de lançamentos reais.

## Acessibilidade
Todos os campos com labels; foco visível; esc para fechar drawer; Enter para salvar sem duplicar; confirmações para excluir; dinheiro no formato R$ 0,00; fonte de inputs >=16px; leitor de tela lê rótulos e estado sem depender só de cor.

## Desktop antes de mobile
H1/abas/card grid primeiro em 1440 e 1280; QA em 1024, 768 e 390 depois da aprovação desktop. Mobile será PWA posterior, mantendo a semântica dos formulários.
