# Briefing oficial — kuantoconta
**Versão:** 1.0 · **Status:** direção de produto aprovada como premissa · **Marco inicial:** 16/11/2026

## 1. O que é
**kuantoconta** é uma plataforma pessoal de **consciência, planejamento e evolução financeira**. A pessoa cadastra receitas, gastos, dívidas, contas e patrimônio, entende para onde o dinheiro vai e visualiza, em qualquer data, como sua situação evoluiria **se cumprisse o planejamento informado**.

Não é banco, corretora, emissor de crédito, ERP empresarial nem consultoria financeira personalizada. O nome público é **kuantoconta**, sempre em minúsculas como padrão de marca; a finalidade do produto é a mesma do Meu Gestor que originou este projeto.

## 2. Missão inalterada
**Ajudar pessoas a formar patrimônio por meio da conscientização de quanto ganham, quanto gastam, para onde vai o dinheiro e como podem chegar ao fim do exercício (31 de dezembro) se seguirem seu planejamento.**

### Promessa central
> Veja sua vida financeira hoje, descubra quanto pode gastar sem comprometer contas futuras e enxergue quanto poderá acumular até o fim do ano.

### Proposta de valor
Não basta mostrar um saldo. O aplicativo conecta **comportamento financeiro** a **resultado futuro verificável**: quando uma despesa muda, a sobra dos meses e o patrimônio projetado devem mudar imediatamente, com explicação dos títulos responsáveis.

## 3. Problema e público
Problema: pessoas enxergam transações isoladas, mas não entendem o conjunto de seus compromissos nem o efeito deles no saldo e patrimônio futuros. Falta visibilidade sobre datas, parcelas, recorrências e mudanças de hábitos.

Público inicial: pessoas adultas que recebem salário ou renda variável e precisam gerenciar contas a pagar, a receber, parcelamentos e dívidas sem planilhas complexas. Foco inicial no Brasil, BRL, pt-BR, fuso America/Sao_Paulo e ano-calendário.

## 4. Perguntas que o produto PRECISA responder
1. Quanto dinheiro tenho hoje — e qual conta contém esse valor?
2. Quanto tenho a pagar e a receber neste mês e até uma data futura?
3. Para onde meu dinheiro está indo, por categorias e subcategorias?
4. Quanto sobra ou falta em cada mês, e em qual dia posso ficar negativo?
5. Quanto posso gastar hoje **com prudência**, preservando contas e reserva?
6. Quanto de dívidas já assumidas ainda resta e quando será a última parcela?
7. Quanto teria de saldo e de patrimônio líquido em 31/12 se seguir o plano?
8. O que muda se eu reduzir um gasto, antecipar uma quitação ou aumentar a renda?

## 5. O que NÃO muda com as referências
- **TOTVS:** inspiração de domínio: títulos, baixas, naturezas e fluxo de caixa.
- **Minhas Finanças:** inspiração de UX de cadastro, recorrência e parcelamento.
- **Finexy:** inspiração visual desktop: superfície clara, cartões compactos, navegação em pills, destaque coral/laranja, tipografia e gráficos profissionais.
- Nenhuma delas define a missão, oferece licença de copiar código/ativos ou altera nossa independência. Não reproduzir marcas, ilustrações proprietárias ou interface 1:1.

## 6. Princípios de produto
- **Fácil de alimentar:** poucos campos obrigatórios; formas avançadas progressivas.
- **Uma verdade financeira:** carteiras de títulos e movimentos alimentam os mesmos cálculos.
- **Previsto ≠ realizado ≠ simulado:** estado sempre visível e com origem auditável.
- **Nenhuma promessa inventada:** sem saldo, receita ou dívida presumidos. Mostrar «A calcular».
- **Sem duplicidade:** pagamento de fatura, transferência ou amortização não é novo consumo.
- **Controle do titular:** editar, corrigir, exportar e solicitar exclusão de dados.
- **Privacidade desde a fundação:** isolamento entre usuários e transparência sobre tratamento.
- **Desktop primeiro; mobile depois:** estrutura responsiva planejada, desktop é o primeiro gate de homologação.

## 7. Critérios de sucesso do MVP
- Uma pessoa consegue cadastrar saldo, uma receita mensal, uma despesa fixa e uma compra parcelada em até poucos passos.
- O dashboard produz **resultado mensal** e **saldo acumulado diário** até a data solicitada, com exemplos de testes reproduzíveis.
- Para 31/12, exibe saldo projetado, patrimônio líquido (quando há ativos/passivos confiáveis) e dívida restante, com explicação.
- Ao aumentar uma despesa em R$ 100/mês por 12 meses, a projeção final diminui R$ 1.200, se não houver outros eventos ou juros.
- O sistema nunca diz «pode gastar» quando faltam saldo ou compromissos materiais.
- Nenhum usuário acessa dados financeiros de outro usuário por alterar IDs ou URLs.

## 8. Escopo inicial / fora de escopo
**MVP:** autenticação e aceite dos termos; contas com saldo inicial; títulos a pagar/receber; único, recorrente e parcelado; baixas; categorias; fluxo mensal/diário; saldo e patrimônio projetados; categorias de gastos; simulação não persistente; gráficos desktop.

**Posterior:** app nativo, PWA instalável, Open Finance, importação OFX/CSV, cartões com reconciliação de fatura, empréstimos com CET e SAC/Price, múltiplas moedas, IA, notificações e aconselhamento de investimento.

## 9. Guardrails
Nenhuma UI, gráfico bonito ou funcionalidade secundária pode prejudicar a confiança nos números. O desempenho e a segurança devem ser medidos; previsões são hipóteses dependentes de dados atualizados, **não garantias financeiras**.
