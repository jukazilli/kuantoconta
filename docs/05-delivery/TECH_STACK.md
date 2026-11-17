# Tecnologias e bibliotecas — kuantoconta V1

| Camada | Ferramenta | Uso / justificativa | Situação |
|---|---|---|---|
| Web | Next.js 16 + React 19 | App Router, APIs same-origin, SSR, deployment na Vercel | Decidido para implementação |
| Linguagem | TypeScript (preferencial) | Tipos claros em estados e contratos; evitar regressões | Diretriz |
| Estilo | CSS + tokens próprios | Fidelidade ao protótipo Finexy sem copiar UI proprietária | Design definido |
| Ícones | lucide-react | Ícones consistentes e acessíveis | Decidido |
| Gráficos | **Apache ECharts 6** + `echarts-for-react` opcional | Linha de saldo, barra receitas/despesas, donut categorias, responsivo, tooltips BRL | Preferido para web real |
| Gráficos históricos | Plotly.js (HTML referência) | Protótipo autocontido original substituído por CDN apenas no arquivo Git de referência | Apenas legado |
| Banco | Neon PostgreSQL 18 | Títulos, baixas, contas, categorias, snapshots | Provisionado |
| Auth | Neon Auth / Better Auth gerenciado | Cookies/sessões, login e signup, sem senha em código próprio | Provisionado |
| Hospedagem | Vercel | Deploy preview e produção protegida | Projeto criado |
| SQL | `@neondatabase/serverless` e migrations versionadas | Consultas parametrizadas, sem segredos no cliente | Planejado |
| Testes | Node test runner / Playwright | Money math, datas, E2E, auth isolamento, visual QA | Planejado |
| Fontes | Inter + fallback system UI | Legibilidade consistente | Planejado |

**Por que ECharts e não Python no browser?** Nosso front-end é web interativo; ECharts funciona diretamente no navegador com renderização SVG/Canvas e múltiplos tipos de gráficos. Python/pyecharts pode ser usado futuramente para relatórios offline, sem necessidade de servidor Python nesta V1. Website oficial: https://echarts.apache.org/en/ .

**Evitar:** Tailwind sem critério visual, bibliotecas de gráficos redundantes, Redux antes de haver estado compartilhado complexo, cores/status hardcoded e pacote de autenticação customizado.

**Atualização técnica:** fixar versões após instalar e gerar lockfile, rodar auditoria de dependências e testes do build real antes de publicar.
