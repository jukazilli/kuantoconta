# kuantoconta — aplicação desktop
Next.js 16 + Neon PostgreSQL + Neon Auth + Vercel + Apache ECharts.

**F0/F1/F2 em desenvolvimento, não homologado.**
Preview protegida para teste; não cadastrar dados pessoais/financeiros reais até conclusão das minutas e segurança.

## Execução local
- Instalar Node.js 22 e dependências: `npm install`.
- Configurar `.env.local` a partir de `.env.example`, sem versionar credenciais.
- Executar migrations `db/001_init.sql` e `db/002_settlement_function.sql` apenas em projeto Neon próprio, quando infraestrutura/env confirmadas.
- `npm test`, `npm run build`, `npm run dev`.

## Regras de proteção
- Banco, sessões e aceite sempre do lado servidor.
- Produção `SIGNUP_ENABLED=false` até identificar controlador, finalizar termos/privacidade e homologar email verification, rate limit, export/exclusão e E2E com duas contas.
- Preview `SIGNUP_ENABLED=true` somente atrás de proteção Vercel para contas de teste.
- Sem seed fictícia na conta real, sem dados de usuário no repositório.
- Formulários e projeções em evolução: parcelas, baixas parciais e saldos ancorados por data.
