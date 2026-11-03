# Pasta `meta/`

Metadados do site: PWA, rastreamento e indexação. Ficam fora da raiz para manter só `index.html` como página na raiz do repositório.

## Arquivos

| Arquivo | Função |
|---------|--------|
| `site.webmanifest` | Manifest PWA (`name`, `theme_color`, `start_url`, ícones) |
| `robots.txt` | Regras para crawlers; aponta para o sitemap |
| `sitemap.xml` | Lista de URLs públicas do site |

## Ligação no HTML

```html
<link rel="manifest" href="meta/site.webmanifest">
```

Nas páginas internas: `href="../meta/site.webmanifest"`.

## Caminhos no manifest

`start_url` e ícones usam caminhos **absolutos a partir da raiz do site** (`/index.html`, `/assets/…`) para funcionar independentemente de onde o manifest é servido.

## SEO na raiz do domínio

Muitos hosts esperam:

- `https://seu-dominio/robots.txt`
- `https://seu-dominio/sitemap.xml`

Com a pasta `meta/`, duas opções:

1. **Redirects (recomendado no Netlify)** — arquivo em `config/netlify.toml`:

   - `/robots.txt` → `/meta/robots.txt`
   - `/sitemap.xml` → `/meta/sitemap.xml`

   No painel Netlify, defina o repositório com publish directory na raiz do projeto e copie ou vincule `config/netlify.toml` para a raiz do deploy se o host exigir o toml na raiz.

2. **Cópia no pipeline** — script de deploy que copia `meta/robots.txt` e `meta/sitemap.xml` para a raiz do artefato publicado.

O `robots.txt` nesta pasta referencia `Sitemap: /meta/sitemap.xml`. Se você expuser o sitemap na raiz via redirect, pode alterar para `Sitemap: /sitemap.xml` para alinhar com ferramentas que assumem esse caminho.
