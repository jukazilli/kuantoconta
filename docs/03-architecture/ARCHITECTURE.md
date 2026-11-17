# Arquitetura técnica — kuantoconta

## Stack homologável para a V1 desktop
- **Framework:** Next.js 16 App Router (React 19, JavaScript/TypeScript progressivo).
- **Hosting:** Vercel em projeto próprio `kuantoconta` (acesso protegido nas prévias).
- **Banco canônico:** Neon PostgreSQL `kuantoconta`, projeto separado de `meu-gestor-express`.
- **Autenticação:** Neon Auth (Managed Better Auth), sem implementar armazenamento de senha próprio.
- **Consulta Postgres:** `@neondatabase/serverless` apenas no servidor; SQL parametrizado, transactions atômicas.
- **Charts:** Apache ECharts 6, importação modular em componente client-only, tooltip BRL e tamanho responsivo.
- **Ícones:** lucide-react; Inter/system-ui.
- **Testes:** Node test runner para cálculo, Playwright para UI e isolamento de conta quando habilitado.

## Módulos
```text
apps/web/
  app/ (dashboard, movimentos, cadastros, simulacoes, conta, legal)
  app/api/ (auth, acceptance, wallets, titles, settlements, projections)
  components/ (shell, KPI, charts, form, tables)
  lib/auth/ ; lib/db/ ; lib/finance/
  public/
docs/
  01-product / 02-design / 03-architecture / 04-legal / 05-delivery
references/meu-gestor-v1.html
```

## Fronteiras de segurança
Browser → Next Route Handlers/Server Components → Neon Postgres. URL/senha Postgres só no servidor. Sessão validada a cada requisição e o ID de usuário vem exclusivamente do auth, jamais de formulário. Todos os SELECT/UPDATE/DELETE filtram por user_id. Log de aceite legal antes de liberar qualquer API financeira.

## Entidades nucleares
- `user_consents`: user_id, versions, accepted_at, user_agent (mínimo).
- `wallets`: titular, nome, saldo inicial em centavos, data de referência, moeda.
- `categories`: titular, nome, direction, parent_id opcional, `canonical_key`, `active`.
- `budget_rules` / `budget_periods`: limites mensais opcionais por categoria principal de despesa com versionamento otimista.
- `economic_events`: fato econômico (`occurred_on`, `amount_cents`, `event_kind`, `competence_source`) separado da agenda de títulos.
- `title_series`: titular, direção, descrição, total, tipo recorrência, frequência, data de início, limite opcional.
- `titles`: titular, série opcional, `economic_event_id` opcional, ID ocorrência, valor, vencimento, categoria, conta, estado.
- `settlements`: baixa individual e imutável, vinculada a título/conta, valor e data; lançamento de caixa derivado.
- `assets`: patrimônio adicional não duplicado no saldo de conta.
- `liabilities`: dívidas contratadas separadas de despesas recorrentes futuras.
- `scenarios`: V1 não persistidos.

## Saldo inicial e baixa
Saldo declarado é snapshot com data. A projeção não soma baixas anteriores ao snapshot. Movimentos posteriores são aplicados uma vez. Baixa parcial reduz o valor pendente; valores em centavos BIGINT com CHECK positivos e restrição de nunca ultrapassar saldo original. Operações concorrentes requerem trava/transaction no banco.

## Projeção e patrimônio
`saldo_projetado(d)` = saldo real ancorado + baixas reais após âncora + títulos pendentes com vencimento <= d, atribuindo títulos vencidos e não pagos ao primeiro dia da projeção com etiqueta de atraso.

`resultado_periodo` = entradas previstas/efetivadas — saídas previstas/efetivadas, sem dupla contagem de pagamento já efetivado.

`endividamento` deve oferecer dois conceitos: compromissos pendentes (soma contas a pagar em intervalo) e passivo contratado em aberto (dívida atual). No MVP não chamar mera soma de contas mensais futuras de «passivo contábil».

`patrimonio_liquido(d)` = saldo projetado + ativos fora das carteiras − passivos assumidos ainda abertos. Transferências próprias não alteram patrimônio. Cenários não afetam caixa efetivo.

## Estratégia de desenvolvimento e deploy
1. Primeira PR versiona briefing, design, UX, arquitetura, risco, termos e backlog.
2. PRs seguintes implementam autenticação/aceite, schema, carteira e motor; cada alteração em branch própria e prévia Vercel isolada.
3. CI com teste de domínio, teste HTTP sem sessão 401, build Next, validação E2E em dois usuários antes de tornar público.
4. Desktop primeiro, sem interromper arquitetura responsiva; mobile/PWA depois.

## Infraestrutura provisionada
Neon project `wispy-art-88764903`, branch `br-muddy-hat-bd5tnd2m`; Vercel project `prj_YNbLsB9ZudyWkEIfwBsCpOm7B8gL`. Não gravar URLs de banco ou credenciais em Git.
