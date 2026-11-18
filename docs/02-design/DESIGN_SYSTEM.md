# Design system — kuantoconta desktop V1
Fonte: [FINEXY_REFERENCE.json](FINEXY_REFERENCE.json), referência HTML em [../../references/meu-gestor-v1.html](../../references/meu-gestor-v1.html). **Identidade nova e própria**.

## Direção visual
Fintech editorial clara; canvas `#F6F6F5`, texto `#1B1C18`, coral `#FA6A43` em 1–2 KPIs realmente relevantes, acentos verdes em resultados positivos, vermelho para déficit, cinza pálido em cards secundários. Evitar saturação e copiar o logotipo da referência.

### Tokens
```css
:root {
  --kc-canvas:#F6F6F5; --kc-surface:#FFFFFF; --kc-soft:#F2F2F1;
  --kc-ink:#1B1C18; --kc-muted:#7B7E79; --kc-border:#E8E9E6;
  --kc-accent:#FA6A43; --kc-accent-2:#FF9265;
  --kc-success:#169966; --kc-danger:#D65A50;
  --kc-radius-card:24px; --kc-radius-inner:16px;
  --kc-shadow:0 8px 40px rgba(32,36,31,.04);
}
```

### Hierarquia
1. Saudações e seletor de período: contexto.
2. Saldo atual/projetado: indicador primário com rótulo inequívoco.
3. A pagar, a receber, sobra do mês e endividamento: indicadores de decisão.
4. Gráficos ECharts: saldo acumulado (linha/área), entradas × saídas (barras), categorias (donut/barras).
5. Tabela de títulos recentes, interativa, com status e ações.

### Componentes
`AppShell`, `TopNavigation` (pills), `IconRail`, `PageHeader`, `PeriodPicker`, `BalanceHero`, `MetricCard`, `ChartPanel`, `PaymentsTable`, `Money`, `StatusChip`, `Drawer`, `BottomSheet` (mobile depois), `EntryForm`, `RepeatPicker`, `InstallmentsConfig`, `EmptyState`, `Dialog`, `Skeleton`, `PrivacyNotice`.

### Tipografia
Inter como primeira fonte, fallbacks system-ui. Desktop: H1 38–48; KPIs 30–42; conteúdo 14–16; legenda 12–13; números tabulares. Formulários sempre >=16px, inclusive Safari iOS para evitar zoom automático. Espaçamento 4/8/12/16/24/32.

### Ícones e gráficos
Lucide React, traço consistente 1.8–2 px; não desenhar ícones improvisados. ECharts para app real, com importações modulares, tooltip legível e formatos BRL; Plotly permanece apenas no HTML de referência.

### Regras de UX e acessibilidade
- Estado selecionado claramente visível; contraste WCAG AA no conteúdo, foco visível, teclado e screen readers.
- Não esconder saldo negativo nem apresentar estimativas como saldos confirmados.
- Cards podem expandir detalhes sem navegar a páginas artificiais; ao expandir reordenar outros cards quando relevante, sem deixar buracos.
- Usar transições 150–240 ms e respeitar prefers-reduced-motion.
- Desktop é o **primeiro alvo de homologação**; planejar adaptação futura para mobile, sem colocá-la como pré-requisito para a primeira revisão de UI.
- Mínimo 44px de área de toque nos controles principais.
- Sem slogans/microcopys instrucionais redundantes e sem gráficos fictícios em conta real.
