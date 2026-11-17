# Homologação guiada da V1 desktop — ambiente protegido

**Status:** roteiro para teste manual. Não é homologação concluída.
**Branch:** `feat/foundation-desktop-v1`; PR #9.
**Projeto Vercel:** `kuantoconta`; o endereço de preview está registrado na PR.
**Regra de segurança:** utilizar somente **dados fictícios**, pois os Termos e o Aviso de Privacidade ainda estão em minuta e testes de isolamento não foram encerrados.

## 1. Primeiro acesso
1. Entre no link da prévia protegida após autenticar-se na Vercel.
2. Se houver opção `Criar acesso`, use **uma conta de teste criada exclusivamente para QA**; o ambiente de produção tem `SIGNUP_ENABLED=false`.
3. Verifique que o checkbox «Li e aceito os Termos de Uso e declaro ciência do Aviso de Privacidade» começa desmarcado; links abrem as versões em revisão.
4. Sem marcar o checkbox, o formulário não deve concluir cadastro.
5. Após criar conta e registrar aceite, o dashboard abre vazio, sem números financeiros inventados.
6. Sair e entrar novamente deve manter os dados desta conta e o aceite versionado.

## 2. Cenário numérico fictício para conferência
1. **Conta:** «Conta teste», saldo de abertura **R$ 2.000,00**.
2. **Receita:** «Salário teste», **R$ 4.000,00**, não recorrente, vencimento em **05/12/2026**.
3. **Despesa:** «Aluguel teste», **R$ 1.500,00**, não recorrente, vencimento em **01/12/2026**.
4. Selecione a projeção em **31/12/2026**. Sem outras movimentações, a projeção deve indicar **R$ 4.500,00**: 2.000 − 1.500 + 4.000.
5. Cadastre «Compra teste», **R$ 1.000,00** como **valor total**, **10 parcelas**, **começar na 4ª**, vencimento inicial **10/12/2026**. Deve criar **sete títulos**: 4/10 até 10/10, cada um de **R$ 100,00**.
6. A soma dos compromissos pendentes registrados deve passar para **R$ 2.200,00** (1.500 + 700), e o saldo previsto para **31/12/2026** deve passar para **R$ 4.400,00** (considerando só a parcela de dezembro).
7. Marque baixa **parcial de R$ 40,00** na primeira parcela, com data de efetivação atual. O saldo realizado deve cair em R$ 40,00 e o restante dessa parcela deve ser **R$ 60,00**; a previsão para 31/12 continua R$ 4.400,00, pois a liquidação já substitui R$ 40,00 da previsão.
8. Baixe mais **R$ 60,00** na mesma parcela. O título deverá ficar quitado, sem duplicar R$ 100,00 no caixa projetado.
9. Tente baixar valor acima do restante de um título em outra parcela. O servidor deve rejeitar a operação, sem alterar o saldo.
10. Limpe filtros, navegue por **Movimentos**, **Planejamento**, **Cadastros** e retorne à **Visão geral**. Os números devem reconciliar.

**Data:** se os testes forem realizados após 2026-12-31, atualize as datas fictícias para meses futuros e recalcule as expectativas, sempre em centavos.

## 3. Segurança e qualidade visual
- Com duas contas de teste, os dados cadastrados em A não podem aparecer ou ser alterados em B.
- O endpoint financeiro sem sessão deve retornar 401; com sessão sem aceite, 403.
- Nenhum lançamento deve indicar «salvo» quando a rede estiver desconectada.
- Verifique desktops 1440×900, 1280×800 e 1024×768; cards não devem se sobrepor e tabelas devem rolar horizontalmente apenas se necessário.
- Campos devem manter foco, rótulos e navegação por teclado. Conferir saldo negativo e valores grandes.
- **Não homologar** «Quanto posso gastar» como funcional enquanto o cadastro de compromissos confirmados/reserva e o cálculo prudente não forem concluídos.
- **Não homologar** patrimônio líquido automático de empréstimos enquanto faltarem cronogramas de amortização e juros.

## 4. Registro de bugs
Registrar cada inconsistência como issue com passos, resultado esperado, resultado observado, viewport, navegador e versão de deploy. Evitar mudanças de escopo ou redesign silencioso durante o diagnóstico.

## 5. Gate para integração
A PR #9 fica Draft até testes reais de sessão, aceite, isolamento de duas contas e lançamento/baixa, revisão do briefing/desktop e resolução dos bloqueios de privacidade.
