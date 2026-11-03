# Pasta `assets/`

Mídia estática referenciada por `index.html` e `pages/*.html`. Preferir nomes descritivos em kebab-case.

## Arquivos versionados

| Arquivo | Uso |
|---------|-----|
| `favicon.svg` | Favicon (`link rel="icon"`) |
| `logo.svg` | Logo no cabeçalho |
| `hero-perspectiva.jpg` | Hero da home |
| `cena-dj.jpg` | Carrossel — cabine |
| `cena-pista.jpg` | Carrossel — pista |
| `cena-estudo.jpg` | Carrossel — estudo |
| `cena-confraternizacao.jpg` | Carrossel — confraternização |

## Referências no HTML (ainda sem arquivo local)

Estes caminhos aparecem no markup ou no manifest; inclua os arquivos aqui quando estiverem prontos:

| Caminho esperado | Referência |
|------------------|------------|
| `logo-mark.jpg` | Apple touch icon, manifest PWA, `estudio.html` |
| `alto-falante.jpg` | Seção simulador na home |
| `detalhe-jog.jpg` | `estudio.html` |
| `hero-cabine.jpg` | Meta `og:image` na home |

## Convenções

- Fotos de conteúdo: JPG, dimensões declaradas no `<img>`.
- Ícones vetoriais: SVG.
- Query `?v=N` em imagens quando precisar invalidar cache do CDN/navegador.
