# VibeDJ — documentação do repositório

Documentação de **estrutura**, **convenções de caminho** e **referência por arquivo**. O código-fonte do site está nas pastas `assets/`, `css/`, `js/`, `pages/` e `meta/`; a entrada pública na raiz é só `index.html`.

## Leitura recomendada

| Documento | Conteúdo |
|-----------|----------|
| [estrutura-do-projeto.md](./estrutura-do-projeto.md) | Árvore completa, princípios da raiz enxuta, mapa de URLs |
| [pastas/pages.md](./pastas/pages.md) | Páginas internas (HTML) |
| [pastas/assets.md](./pastas/assets.md) | Imagens e ícones |
| [pastas/css.md](./pastas/css.md) | Folhas de estilo |
| [pastas/js.md](./pastas/js.md) | Scripts (módulos ES) |
| [pastas/meta.md](./pastas/meta.md) | SEO, PWA e publicação |

## Princípios

1. **Raiz enxuta** — apenas `index.html` como página na raiz do projeto.
2. **Separação por tipo** — HTML de seções em `pages/`, estáticos em `assets/`, `css/`, `js/`, metadados em `meta/`.
3. **Caminhos relativos** — da raiz (`index.html`) use `pages/…`, `css/…`, `assets/…`, `meta/…`; de `pages/*.html` use `../` para subir um nível.
4. **Configuração fora da raiz** — ajustes de IDE (`.vscode/`) e deploy (`config/`) não poluem a listagem da raiz.

## Desenvolvimento local

Abra a raiz do projeto no Live Server (porta sugerida: 5501 em `.vscode/settings.json`) e acesse `http://127.0.0.1:5501/index.html`.

## Deploy

Para buscadores encontrarem `robots.txt` e `sitemap.xml` na raiz do domínio, use os redirects descritos em [pastas/meta.md](./pastas/meta.md) ou copie os arquivos de `meta/` conforme o host.
