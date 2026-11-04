# Pasta `js/`

Scripts ES modules, sem bundler. Cada página importa apenas o que precisa.

## Arquivos

| Arquivo | Escopo | Descrição |
|---------|--------|-----------|
| `nav.js` | Global | Marca link ativo (`data-nav` / `data-page`); menu mobile |
| `carousel.js` | Home | Carrossel de cenas (`data-reel`) |
| `widgets.js` | Conceitos | Widgets interativos (roda Camelot, contador de frase, etc.) |
| `inventario-elementos.js` | Laboratório | Inventário kick/clap/hat/… e plano de transplante |
| `leitura-audio-core.js` | Laboratório | Decodificar áudio, BPM, faixas espectrais (rápido) |
| `transplante-lab.js` | Laboratório | UI doador + receptor |
| `clonagem-model.js` | Laboratório | Grade de cadeiras, export JSON, pacote completo |
| `grade-cadeiras.js` | Laboratório | UI da matriz presença / troca / retirada |
| `analise.js` | Laboratório | Leitura de áudio local (forma de onda, BPM, camadas) |
| `laboratorio.js` | Laboratório | Groove 16 comp., decisões, relatório (`clonagem-model.js`) |
| `estudo.js` | Sala (se referenciado) | Lógica auxiliar da sala de estudos |
| `engine.js` | Simulador | Motor de áudio sintético e timing |
| `tracks.js` | Simulador | Definição de faixas, passos e formas de onda |
| `simulator.js` | Simulador | UI da cabine, liga DOM ao engine |

## Grafo de imports

```text
simulator.js → engine.js, tracks.js
engine.js    → tracks.js
laboratorio.js → clonagem-model.js
grade-cadeiras.js → clonagem-model.js
transplante-lab.js → leitura-audio-core.js, inventario-elementos.js, clonagem-model.js
analise.js → inventario-elementos.js
```

Demais arquivos são entry points carregados via `<script type="module" src="…">`.

## Convenções

- Manter imports no topo do módulo (sem imports inline).
- Novos módulos do simulador podem ficar nesta pasta ou, se crescer, em subpasta `js/simulator/` com atualização dos paths nos HTML.
