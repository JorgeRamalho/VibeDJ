# Pasta `js/`

Scripts ES modules, sem bundler. Cada página importa apenas o que precisa.

## Arquivos

| Arquivo | Escopo | Descrição |
|---------|--------|-----------|
| `nav.js` | Global | Marca link ativo (`data-nav` / `data-page`); menu mobile |
| `carousel.js` | Home | Carrossel de cenas (`data-reel`) |
| `widgets.js` | Conceitos | Widgets interativos (roda Camelot, contador de frase, etc.) |
| `estudo.js` | Sala (se referenciado) | Lógica auxiliar da sala de estudos |
| `engine.js` | Simulador | Motor de áudio sintético e timing |
| `tracks.js` | Simulador | Definição de faixas, passos e formas de onda |
| `simulator.js` | Simulador | UI da cabine, liga DOM ao engine |

## Grafo de imports

```text
simulator.js → engine.js, tracks.js
engine.js    → tracks.js
```

Demais arquivos são entry points carregados via `<script type="module" src="…">`.

## Convenções

- Manter imports no topo do módulo (sem imports inline).
- Novos módulos do simulador podem ficar nesta pasta ou, se crescer, em subpasta `js/simulator/` com atualização dos paths nos HTML.
