# Exclusão por escopo — títulos parcelados e recorrências mensais
Data: 17/11/2026 · branch `feat/scoped-cancel-financial-series` · PR base #11.

## Motivação
Ao excluir um item de série, perguntar qual alcance o usuário deseja: **somente este**, **este e todos os seguintes** ou **todos**. A decisão preserva caixa realizado e as auditorias; não deve remover um lançamento financeiro confirmado por acidente.

## Regras de domínio
- **Avulso:** apenas "Somente este". Título totalmente baixado não pode ser excluído isoladamente até que o usuário reverta a baixa.
- **Parcelado:** `series_id` identifica as parcelas e `installment_index` estabelece sua ordem. "Este" cancela somente a parcela selecionada; "este e seguintes" cancela pelo índice; "todos" cancela toda a série. Não muda `installment_total` dos títulos históricos.
- **Fixa mensal:** `kc_recurring_rules` é a fonte de ocorrências calculadas sob demanda. "Somente este" materializa um marcador de cancelamento para aquele mês; "este e seguintes" define `paused_at` na data da ocorrência; "todos" define `paused_at` na data inicial da regra. Ocorrências já materializadas seguem a mesma política.
- **Sem baixas:** a obrigação é arquivada por `cancelled_at`, sem `DELETE`.
- **Baixa parcial:** não apaga a liquidação. Cancela somente o saldo pendente, reduzindo `amount_cents` ao valor efetivado e armazenando o valor anterior, saldo cancelado e escopo em `kc_title_cancellation_events`.
- **Totalmente baixado:** permanece na carteira/histórico. Em um cancelamento de série, essas ocorrências são ignoradas, mas não impedem cancelar as pendências da série. Não se apagam pagamentos históricos.
- **Reversão após cancelamento parcial:** mantém o restante cancelado. Se toda a baixa restante for revertida, o título passa a ser marcador de cancelamento; a obrigação não ressurge.
- **Auditoria:** eventos físicos em `kc_title_cancellation_events`; alterações da regra em `kc_recurring_cancellation_events`. A aplicação grava somente o necessário e não duplica centenas de ocorrências até 2099.
- **Propriedade e autorização:** todas as consultas e updates usam `user_id` da sessão do servidor. Funções com transação e bloqueios. O cliente não envia `user_id`, apenas identificador e escopo.
- **Consistência:** os cards, fluxo diário, gráfico e carteira computam sobre títulos ativos e liquidações realizadas. Excluir pendências reduz contas a pagar/receber futuras; não altera o caixa realizado.
- **Compatibilidade:** a operação antiga `cancel` é encaminhada ao procedimento auditável de um título; a operação antiga `stop_recurring` passa pelo procedimento de escopo `future`.
- **Não recuperável pela interface nesta fase:** cancelamentos continuam auditáveis no banco, mas não há ação "desfazer exclusão". A confirmação informa o efeito e exige escolha deliberada.

## Exemplos de aceite

**Receita parcelada em seis vezes de R$ 2.400**
- Excluir parcela 3/6: mantém 1, 2, 4, 5, 6; o resultado financeiro do mês 3 perde R$ 2.400.
- Excluir parcela 3/6 e seguintes: mantém parcelas 1–2 e retira pendências 3–6.
- Excluir todos: retira pendências 1–6. Parcela 1 já recebida permanece realizada; o caixa recebido não é removido.

**Despesa fixa R$ 308/mês até 2099**
- Excluir novembro/2026: fevereiro/2027 e os outros meses continuam.
- Excluir a partir de novembro/2026: após outubro/2026 não há novas obrigações.
- Excluir todos: nenhuma obrigação futura gerada. Se outubro/2026 foi pago, fica no histórico e no saldo.

**Título parcialmente pago, R$ 1.000, baixa R$ 400**
- Cancelar: R$ 600 de pendência desaparecem da previsão, mas R$ 400 continuam no caixa realizado, com evento auditável do valor anterior.
- Reverter a baixa de R$ 400: caixa retorna à posição anterior, título não reaparece como R$ 1.000 em aberto.

## QA antes de merge
- [ ] Testes automatizados: escopo only/future/all, séries, recorrência, auditoria, cancelamento parcial e reversão.
- [ ] Migration 004 aplicada em Neon e sintaxe verificada, sem apagar dados.
- [ ] Preview protegido compilado.
- [ ] Sessão de QA: conta A não cancela itens da conta B.
- [ ] Correções de datas 28/29/30/31 nas recorrências.
- [ ] Mesma apuração do período antes/depois em todos os cards e gráficos.
- [ ] Confirmar telas de modal em 1440px, 390px e navegação por teclado.
- [ ] PR permanece draft até homologação.
