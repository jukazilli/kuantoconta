# kuantoconta

**Seu dinheiro, seu plano, seu patrimônio.**

O **kuantoconta** é uma plataforma de consciência e planejamento financeiro pessoal. Sua missão é ajudar pessoas a **formar patrimônio** ao mostrar com clareza quanto **ganham**, quanto **gastam**, **para onde vai o dinheiro** e como **poderão terminar o ano se mantiverem o planejamento**.

> **Status:** fundação e V1 desktop em desenvolvimento. Projeto independente do Meu Gestor original. Repositório público: não subir dados pessoais ou segredos.

## Documentos canônicos

| Artefato | Papel |
|---|---|
| [Briefing do produto](docs/01-product/BRIEFING.md) | **Fonte de verdade da missão, público, proposta de valor e objetivos** |
| [PRD / requisitos](docs/01-product/PRD.md) | Contratos do MVP e fórmulas |
| [HTML V1 aprovado](references/meu-gestor-v1.html) | Protótipo histórico; Plotly por CDN neste arquivo de referência |
| [JSON da imagem Finexy](docs/02-design/FINEXY_REFERENCE.json) | Estrutura visual extraída; fonte: imagem enviada na conversa |
| [Design system](docs/02-design/DESIGN_SYSTEM.md) | Tokens, hierarquia, componentes, gráficos e UI |
| [Fluxos UX](docs/02-design/UX_FLOWS.md) | Login, cadastro, parcelamento, baixa e projeção |
| [Arquitetura](docs/03-architecture/ARCHITECTURE.md) | Stack, fronteiras, domínio e persistência |
| [Segurança e privacidade](docs/03-architecture/SECURITY.md) | Regras de isolamento e release |
| [Decisões](docs/03-architecture/DECISIONS.md) | ADRs de missão/design/stack |
| [Termos de Uso — minuta](docs/04-legal/TERMS_OF_USE_DRAFT.md) | Termos com campos pendentes de identificação |
| [Aviso de Privacidade — minuta](docs/04-legal/PRIVACY_NOTICE_DRAFT.md) | LGPD, finalidades, direitos e fornecedores |
| [Roadmap](docs/05-delivery/ROADMAP.md) | Etapas F0–F7 e critérios de homologação |
| [Bibliotecas](docs/05-delivery/TECH_STACK.md) | Next.js, Neon, Auth, Vercel, ECharts, Lucide |
| [Testes](docs/05-delivery/QUALITY_GATES.md) | Gates financeiros, UX e segurança |

## Perguntas respondidas pelo produto
Quanto tenho hoje? Quanto ainda preciso pagar ou receber? Para onde vai meu dinheiro? Em quais meses ficarei no positivo ou negativo? Quanto posso gastar de maneira prudente? Quanto terei de **saldo e patrimônio projetados em 31/12** se cumprir o plano?

## Prioridades
1. Primeiro **desktop**, inspirando-se na composição Finexy sem copiá-la literalmente.
2. Backend e login **reais**, usando Neon e Vercel separados do projeto anterior.
3. Carteira de contas a pagar/receber, títulos, baixas e recorrências.
4. Gráficos confiáveis e projeção por data; depois simulações.
5. Só após homologação desktop: mobile, refinamentos e PWA.

**Aviso legal:** minutas de termos/privacidade requerem identificar o controlador, confirmar contato e retenção e passar por revisão antes de cadastro público.
