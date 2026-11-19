# Kuantoconta — contrato visual da referência

**Tela:** Visão geral · **referência raster:** 1448 × 1086 px · **artefato principal:** `kuantoconta_dashboard_referencia.html`.

## Fonte e evidência

A referência é uma **imagem renderizada**, não um arquivo Figma/HTML com metadados de fontes. Não é tecnicamente possível recuperar com certeza absoluta a família e os pesos originais apenas por inspeção do PNG. **Poppins** (400, 500, 600, 700) foi escolhida por proximidade visual e por constar na referência Moniex discutida no projeto. O arquivo HTML usa Google Fonts quando conectado e mantém fallback Inter/system-ui.

## Composição

- Canvas cinza-lilás quase branco, sem grandes elementos coloridos.
- Logo isolada no canto superior esquerdo; preview e avatar à direita.
- Ações `+ Adicionar` e `Criar` abaixo da marca, alinhadas à esquerda.
- Seletor de datas e navegação `< novembro >` à direita; filtro em um botão separado.
- Bento assimétrico: três cards compactos **A pagar**, **A receber**, **Endividamento**, acima de **Próximos compromissos**; **Limites mensais** ocupa a coluna direita da primeira linha.
- Segunda linha: **Despesas por categoria** (rosca neutra com um único segmento laranja), **Receitas e despesas** (barras) e **Saldos em conta**.
- Navegação principal em pill flutuante centralizada próxima ao rodapé, sem rail lateral e sem Cadastros.

## Hierarquia de cores

A cor laranja (`#FE6803`, valor representativo amostrado da imagem) identifica controles primários, elementos selecionados e uma série de gráfico. O grafite (`#16171C`) comunica títulos e dinheiro. Cinza (`#737789`) sinaliza conteúdo auxiliar. Cards permanecem brancos/cinza-claro. Evitar verde/vermelho/azul por padrão: a semântica financeira deve depender primeiro de rótulos e sinais claros, usando estado cromático adicional apenas quando necessário.

## Interações do HTML

Os chevrons alternam o mês, o ícone de filtro abre uma pequena lista, e `Adicionar` e `Criar` exibem menus demonstrativos; os dados não são persistidos. A navegação inferior documenta as rotas do produto e informa quando a área não integra este protótipo. Nenhuma consulta é feita ao banco ou ao motor financeiro.

## Fidelidade e limites

A estrutura, proporções e cores foram ajustadas por comparação visual ao PNG no viewport de 1448 × 1086 px. Fidelidade *pixel a pixel* não pode ser garantida: sombras, antialiasing, fonte efetiva e detalhes do screenshot original dependem do renderizador. Os gráficos do PNG incluem **valores ilustrativos não conciliados** entre si (por exemplo, o total de despesas no donut e as despesas do mês), e não devem ser replicados como dados reais na aplicação.
