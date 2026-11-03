# Pasta `css/`

Estilos em cascata, carregados na ordem: **tokens → base → academy** (e **simulator** na página do simulador).

## Arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `tokens.css` | Design tokens: cores, tipografia, espaçamento, variáveis CSS |
| `base.css` | Reset, tipografia global, layout comum, header/footer, utilitários |
| `academy.css` | Componentes das páginas de academia: hero, trilha, sala, conceitos, método |
| `simulator.css` | Layout e controles da cabine (dois decks + mixer) |

## Ordem de importação

```html
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/academy.css">
<!-- simulador.html apenas: -->
<link rel="stylesheet" href="../css/simulator.css">
```

Cache busting pontual (`?v=14`) pode ser aplicado em `academy.css` na home quando houver deploy frequente.
