# Segurança, autenticação e privacidade — critérios de release

## Auth
Usar Neon Auth gerenciado (Better Auth). Não usar JWT não verificado, password hashing caseiro, auth client como única proteção, token em localStorage nem endpoint financeiro público. Cookies de sessão httpOnly/Secure/SameSite conforme SDK e HTTPS em produção. Validar no servidor a sessão em cada chamada, não confiar no `user_id` enviado no body.

## Cadastro e termos
Checkbox de aceite desmarcado e links acessíveis ANTES da criação da conta. Armazenar no banco `user_id`, `terms_version`, `privacy_version`, `accepted_at` após autenticação. Bloquear acesso aos dados financeiros se registro de aceite exigido não existir. Os termos regulam o contrato; o tratamento indispensável para operar o serviço pode usar execução contratual como base legal, **não pressupor consentimento genérico LGPD**. Qualquer finalidade opcional (ex. marketing) exige escolha específica e separada.

## Dados
Serviço de dados sensíveis em repo público: não commitar valores financeiros de usuários, senha, .env, segredo, amostras reais de bancos nem logs com dados pessoais. Projetos diferentes Neon/Vercel; TLS na conexão, variáveis de ambiente criptografadas e logs redigidos. Conta encerrada deve poder solicitar exportação/exclusão dos dados, sujeita a retenção legal aplicável.

## Revisão antes de cadastro público
1. Identificação real do controlador + e-mail de contato preenchidos nos Termos e no Aviso de Privacidade; não inventar esses dados.
2. Verificação de e-mail, recuperação de senha, rate-limits e antiabuso, proteção contra enumeração de contas.
3. Validar sessão expirada, API sem sessão, acesso cruzado por usuário e inserção concorrente.
4. Respostas financeiras `private, no-store`, cookies seguros, CSP adequada, CSRF/origin checks nas mutações; nenhuma resposta financeira em cache PWA.
5. Política documentada de backup e restauração, retenção e exclusão/exportação.
6. Revisão jurídica final das políticas. Rascunho não é certificação LGPD.

## Testes bloqueantes
- Conta A nunca consegue listar ou alterar wallets/títulos/baixas da conta B, mesmo com UUID conhecido.
- Um usuário sem aceitação ativa da versão legal não acessa API financeira.
- Token inexistente/expirado -> 401; origem não autorizada -> 403.
- Pagamentos duplicados não alteram saldo duas vezes.
- Cadastro de 10 parcelas iniciando na quarta gera exatamente sete, sem mutar meses anteriores.
- API e cookies não geram dados financeiros em caches compartilhados.
