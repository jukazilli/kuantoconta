# Quality gates e testes financeiros

## Domínio
- Testar 1/31 em meses curtos, bissexto, fuso America/Sao_Paulo e virada do exercício.
- Valores BRL em centavos; R$ 100/3 parcelas deve somar exatamente R$ 100.
- Parcela 4/10 gera 7 ocorrências (4–10), e valor total previsto restante correto.
- Receitas futuras não tornam saldo atual maior.
- Baixa parcial de R$ 30 em título de R$ 100 deixa R$ 70 em aberto e movimenta caixa apenas R$ 30.
- Estorno não apaga histórico financeiro; só registra reversão.
- Transferência entre contas próprias não aumenta receita nem patrimônio.
- Empréstimo: pagamento principal reduz caixa e passivo; apenas juros alteram patrimônio econômico.
- Fluxo detecta déficit no dia de vencimento mesmo que mês termine positivo.
- Se faltam saldo e obrigações, «pode gastar» permanece «A calcular».
- Cenário não modifica títulos/baixas reais.

## Segurança / privacidade
- Login/cadastro e reentrada após recarga; sair invalida sessão.
- Termos checkbox desmarcado, links abrindo, versão/horário gravados.
- API retorna 401 não autenticado, 403 sem aceite; mutações validam origem e usuário.
- Conta A não lê/edita dados da B.
- Dados no navegador não são armazenados em caches compartilhados; arquivos de build não contêm segredos.
- Logs sem transações nominativas nem senhas.
- Verificar direitos de acesso, exportação, exclusão e revisão do Aviso de Privacidade.

## UX desktop
- Testar 1440×900, 1280×800 e 1024×768; tabela rolável com cabeçalho fixo quando necessário.
- Tooltips gráficos formatados BRL e com interpretação de previsto/realizado.
- Todos os inputs e botões têm labels, foco visível, teclado e erros acessíveis.
- As ações de baixa e gravação reportam sucesso APENAS após confirmação do servidor.
- Nenhum dado fictício apresentado como pertencente à pessoa autenticada.

## Produção
- Confirmar regras de conexão Neon/Vercel, quotas e domínio; custom SMTP quando necessário.
- Analisar transporte/armazenamento do consentimento, owner/contact e bases legais; não abrir cadastro público com minutas.
- Ambiente preview protegido até aprovação e homologação.
