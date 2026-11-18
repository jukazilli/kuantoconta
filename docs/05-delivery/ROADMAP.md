# Roadmap de implementação — kuantoconta
**Missão imutável:** conscientizar sobre ganhos/gastos/destino do dinheiro e mostrar como o patrimônio evoluiria até 31/12 mantendo o planejamento.

## Regras de execução
- Desktop primeiro; mobile/PWA só após validação da experiência desktop e preservando contratos de dados.
- Branches pequenas, Issues por entrega e PRs Draft para revisão. Não mesclar PR sem testes/políticas aprovadas.
- Protótipo `references/meu-gestor-v1.html` permanece intacto como referência; nova marca não deve alterar a versão histórica.
- Repositório **público**: nunca adicionar segredos, dados financeiros reais ou informações privadas de pessoas.

## Etapas e critérios de aceite
| Etapa | Escopo | Evidência |
|---|---|---|
| **F0 — Briefing + referências** | missão, PRD, HTML, JSON visual, tokens, fluxos e decisões | Documentos versionados, PR Draft |
| **F1 — Segurança/infra** | projeto Neon e Vercel isolados, Auth, SQL migrations, Termos/Privacidade e gating de aceite | API sem sessão = 401; termos no banco; nenhuma credencial no Git |
| **F2 — Design desktop** | shell Finexy-inspired, topo pills, rail, cards, gráficos ECharts e telas de login | 1440px e 1280px sem overflow, consistência de hierarquia |
| **F3 — Domínio financeiro** | contas, categorias, títulos a pagar/receber, únicas/recorrentes/parceladas, baixas | 10 parcelas da 4ª; baixas parciais; sem dupla contagem |
| **F4 — Dashboard** | fluxo diário, resultado mensal, endividamento, patrimônio/data, categorias | Todos KPIs reconciliam com títulos; déficit não some |
| **F5 — Simulação** | alterar hipótese, recalcular e comparar sem alterar fatos | Undo/limpar simulação; diferença explicada |
| **F6 — Homologação beta desktop** | testes com duas contas, exportação, segurança e revisão jurídica | checklist completo, PR aprovada, deploy protegido |
| **F7 — Mobile e PWA** | layout responsivo, safe area, input iOS, manifest, SW seguro e instalável | iOS/Android sem cache financeiro privado |

## Dependências
F0 → F1 → F2+F3 → F4 → F5 → F6 → F7. A estrutura visual pode ser feita em paralelo com a API, mas a publicação de conta real depende de F1 e revisão legal.

## Não confundir
- «Build Vercel READY» ≠ teste de login, homologação jurídica ou segurança certificada.
- «Saldo projetado» ≠ valor garantido.
- «Soma das contas a pagar» ≠ passivo contratual nem patrimônio líquido.
- «Aceitar Termos» ≠ consentimento irrestrito para qualquer tratamento LGPD.
