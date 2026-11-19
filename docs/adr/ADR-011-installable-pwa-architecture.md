# ADR-011 — Arquitetura de PWA Instalável com Política Zero-Cache Financeiro

- **Status:** Aceito e implementado
- **Data:** 2026-11-19
- **Contexto:** Preparar o `kuantoconta` (`apps/web`, Next.js 16 App Router) para instalação como Progressive Web App (Android, iOS e Desktop) preservando integralmente a fronteira de segurança definida em `docs/03-architecture/SECURITY.md`.

## Decisão

Adotar uma arquitetura **PWA nativa do Next.js App Router + Service Worker próprio (zero dependências extras)** com política estrita de **Zero-Cache de Dados Financeiros**.

### Componentes da arquitetura
1. **Web App Manifest (`apps/web/app/manifest.js`)**
   - Servido nativamente em `/manifest.webmanifest`.
   - `display: "standalone"`, `start_url: "/dashboard?source=pwa"`, `scope: "/"`, `theme_color: "#f2f3fb"`, `background_color: "#f2f3fb"`.
   - Ícones rasterizados PNG determinísticos (`192x192`, `512x512`, `maskable` 192/512 e `apple-touch-icon` 180x180) + `icon.svg`, gerados via `apps/web/scripts/generate-pwa-icons.mjs`.
2. **Service Worker Security-First (`apps/web/public/sw.js`)**
   - **Nunca intercepta nem armazena em cache**: `/api/*`, `/auth/*`, `/oauth/*`, `/.well-known/*`, `/dashboard`, `/legal/accept`, payloads RSC (`_rsc` / `rsc: 1`), requisições não-`GET`, cross-origin ou respostas com `Cache-Control: private` / `no-store` ou `Set-Cookie`.
   - **Armazena em cache apenas ativos estáticos públicos**: `/_next/static/*`, `/icons/*`, `/banks/*` e o shell público `/offline`.
   - **Navegações (`mode === "navigate"`)**: estritamente *network-only*, servindo `/offline` apenas quando não houver conectividade.
3. **Fallback Offline (`apps/web/app/offline/page.jsx`)**
   - Tela pública e leve explicando que os dados financeiros exigem conexão ativa por segurança e precisão, com ação imediata de reconexão.
4. **Headers HTTP (`apps/web/next.config.mjs`)**
   - `/sw.js` servido com `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /` e `X-Content-Type-Options: nosniff`.
   - `/manifest.webmanifest` com `Cache-Control: public, max-age=0, must-revalidate`.
5. **Camada Cliente (`apps/web/app/components/PwaProvider.jsx` + `InstallAppCard.jsx` + `apps/web/lib/pwa.js`)**
   - Registra `/sw.js` com `updateViaCache: "none"`.
   - Captura `beforeinstallprompt` para instalação em 1 clique no card **Aplicativo instalável (PWA)** na aba **Perfil**.
   - Exibe instruções nativas para iOS Safari ("Compartilhar → Adicionar à Tela de Início").
   - Monitora conectividade (`online`/`offline`) e atualizações do Service Worker (`SKIP_WAITING`).
   - Limpa caches estáticos (`CLEAR_CACHES`) ao acionar **Sair da conta** como camada adicional de defesa em profundidade.
6. **Ajustes de Viewport e Standalone (`apps/web/app/layout.jsx` + `globals.css`)**
   - `viewportFit: "cover"`, `appleWebApp: { capable: true, statusBarStyle: "default", title: "kuantoconta" }`.
   - Respeito a `env(safe-area-inset-*)` e `overscroll-behavior-y: contain` em `@media (display-mode: standalone)`.

## Matriz de cache

| Recurso | Estratégia | Cache PWA |
| --- | --- | --- |
| `/api/*` (ex.: `/api/portfolio`, `/api/auth/*`, `/api/mcp`) | Network-only (bypass total) | Proibido |
| `/auth/*`, `/oauth/*`, `/.well-known/*` | Network-only (bypass total) | Proibido |
| `/dashboard`, `/legal/accept` (HTML/RSC) | Network-only com fallback `/offline` | Proibido |
| `/_next/static/*`, `/icons/*`, `/banks/*` | Cache-first (somente 200 `basic` público) | Permitido (`kc-static-v1`) |
| `/offline` | Precached | Permitido (`kc-static-v1`) |

## Verificação
- Suite automatizada em `apps/web/lib/pwa.test.mjs` valida manifest, integridade dos PNGs, política zero-cache, headers de `/sw.js` e detecção de plataforma/standalone.
- Build de produção (`npm run build`) valida geração de `/manifest.webmanifest` e `/offline`.
