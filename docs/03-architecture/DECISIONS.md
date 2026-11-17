# Registro de decisões (ADRs condensadas)

**ADR-001 — Nome e missão (aprovado):** kuantoconta. Missão patrimonial por conscientização e projeção até fim do ano, sem alteração em relação ao Meu Gestor.

**ADR-002 — Referência visual (aprovado para exploração):** Finexy desktop com componentes próprios, sem reutilizar logo/ativos proprietários. Prototipagem histórica em HTML preservada.

**ADR-003 — Modelo financeiro (decidido):** títulos a pagar/receber e baixas inspirados em processos TOTVS; cadastro de recorrência/parcelamento inspirado nas imagens do Minhas Finanças; duas referências complementares à missão.

**ADR-004 — Fronteira de aplicação (decidido):** repo GitHub `jukazilli/kuantoconta`, Neon e Vercel dedicados. Nada de migração do `meu-gestor-financeiro`.

**ADR-005 — Runtime (direção inicial):** Next.js 16 + Neon PostgreSQL + Neon Auth + Vercel; Lucide + ECharts. Python não é obrigatório para gráficos web; pyecharts é alternativa para relatórios server-side.

**ADR-006 — Segurança (bloqueante):** não abrir cadastro público até identificação do controlador, termos/privacidade finais, verificação de login e testes de isolamento. Concordância com termos registrada no servidor.

**ADR-007 — Sequenciamento (aprovado):** primeira homologação desktop, depois mobile e PWA.
