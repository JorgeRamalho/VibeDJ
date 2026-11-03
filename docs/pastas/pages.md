# Pasta `pages/`

Páginas HTML do site, exceto a home. Todas compartilham cabeçalho, navegação e rodapé no markup; o estado ativo do menu usa `data-page` no `<body>` e `js/nav.js`.

## Arquivos

| Arquivo | `data-page` | Função |
|---------|-------------|--------|
| `trilha.html` | `trilha` | Trilha em sete estações (ouvido → pista) |
| `sala.html` | `sala` | Sala de estudos: aulas, checklist, laboratório |
| `conceitos.html` | `conceitos` | Conceitos (Camelot, frase, widgets interativos) |
| `metodo.html` | `metodo` | Método PISTA e sessão de estudo |
| `estudio.html` | `estudio` | Identidade visual e estúdio da marca |
| `simulador.html` | `simulador` | Cabine Agulha V1 / Cabine M2 (UI + áudio sintético) |

## Dependências típicas

- CSS: `../css/tokens.css`, `../css/base.css`, `../css/academy.css` (+ `../css/simulator.css` no simulador)
- JS: `../js/nav.js` em todas; `../js/carousel.js` só na home; `../js/widgets.js` em conceitos; `../js/simulator.js` (+ engine/tracks) no simulador
- Assets: `../assets/*`

## Navegação cruzada

Links internos entre páginas usam caminhos relativos na mesma pasta (ex.: `conceitos.html#camelot`, `trilha.html#maos`). Links para a home: `../index.html`.
