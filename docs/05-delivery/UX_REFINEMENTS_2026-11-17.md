# Ajustes de UX — validação 17/11/2026
## Entradas da revisão
Screenshot da V1 kuantoconta + referências visuais de listas, edição e menu do app Minhas Finanças.

## Decisões
1. **Entrada monetária:** mostrar máscara R$ com centavos automáticos (`30800` → `308,00`); enviar `308.00` à API; armazenamento sempre em centavos inteiros. Não depender de `type=number` para aceitar separadores; `type=text inputMode=numeric` sanitiza letras.
2. **Categorias governadas:** seleção obrigatória, com botão `+` que grava uma categoria do titular. Subcategoria selecionável dependente da categoria principal, jamais texto livre; `+` abre criação controlada. Dados do cliente A invisíveis ao cliente B.
3. **Período:** intervalo `[hoje, último dia do mês]` por padrão; início e fim independentes, validação de ordem, atalho fim do ano. KPIs de entrada/saída mostram só valores no intervalo, não somatório de uma série inteira.
4. **Carteira:** usar lista com grupos temporais e resumo do lançamento, status e `⋯` para opções. Ao clicar abre detalhes com histórico e saldo. Evitar tabela pesada em mobile. Ações editar (somente a ocorrência), duplicar, baixar parcial/total e excluir somente se não houver baixas.
5. **Sem mutação retroativa de títulos já baixados:** alterações permitidas somente quando novo total >= baixado; mudança de carteira impedida com baixas. Histórico financeiro permanece.
6. **Saldos legados errados:** alterações de formato não devem corrigir valores antigos automaticamente, porque não há como saber a intenção sem confirmação. Editar manualmente os títulos incorretos. 
7. **MVP V1 desktop:** prioridade visual desktop; responsividade progressiva, sem desviar o projeto.
## Critérios de aceite
- Digitar `30800` produz `308,00` e salva R$ 308; `308` produz R$ 3,08. Ao reabrir a edição de R$ 308, mostra `308,00`.
- Dez salários de R$ 2.400 em dez meses: selecionar um mês mostra R$ 2.400, enquanto relatório de dez meses soma R$ 24.000.
- Uma subcategoria exige categoria, aparece no seletor apenas quando associada àquela categoria, e é armazenada no banco.
- Abrir título mostra conta, categoria, subcategoria, parcela, vencimento, total, baixado e saldo pendente.
- Botão `⋯` tem editar, duplicar, baixa, excluir condicionais; nenhuma lixeira permanente.
- Intervalo inicial: 17/11/2026 a 30/11/2026 no dia de referência; mudar para dezembro não mistura receitas de janeiro.
