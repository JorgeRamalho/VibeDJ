# Estrutura do projeto VibeDJ

Padrão adotado para manter a **raiz limpa**, facilitar navegação no repositório e documentar cada artefato.

## Árvore de diretórios

```text
Projeto-VibeDJ/
├── index.html              # Única página HTML na raiz (home / entrada)
├── pages/                  # Demais páginas do site
├── assets/                 # Imagens, ícones, mídia estática
├── css/                    # Estilos globais e por área
├── js/                     # JavaScript modular (ES modules)
├── meta/                   # Manifest PWA, robots, sitemap
├── docs/                   # Documentação do repositório (este material)
├── config/                 # Configuração de deploy (ex.: Netlify)
└── .vscode/                # Preferências locais do editor (opcional)
```

## Mapa de URLs (servidor estático)

| URL pública | Arquivo no disco |
|-------------|------------------|
| `/index.html` | `index.html` |
| `/pages/trilha.html` | `pages/trilha.html` |
| `/pages/sala.html` | `pages/sala.html` |
| `/pages/conceitos.html` | `pages/conceitos.html` |
| `/pages/metodo.html` | `pages/metodo.html` |
| `/pages/estudio.html` | `pages/estudio.html` |
| `/pages/simulador.html` | `pages/simulador.html` |
| `/meta/site.webmanifest` | `meta/site.webmanifest` |
| `/meta/robots.txt` | `meta/robots.txt` |
| `/meta/sitemap.xml` | `meta/sitemap.xml` |

## Convenção de links

### A partir de `index.html` (raiz)

```html
<link rel="stylesheet" href="css/base.css">
<img src="assets/logo.svg" alt="">
<a href="pages/trilha.html">Trilha</a>
<link rel="manifest" href="meta/site.webmanifest">
<script type="module" src="js/nav.js"></script>
```

### A partir de `pages/*.html`

```html
<link rel="stylesheet" href="../css/base.css">
<img src="../assets/logo.svg" alt="">
<a href="../index.html">Início</a>
<a href="simulador.html">Simulador</a>
<link rel="manifest" href="../meta/site.webmanifest">
<script type="module" src="../js/nav.js"></script>
```

Links entre páginas na mesma pasta (`pages/`) permanecem **sem** prefixo (`trilha.html`, `sala.html#…`).

## Decisões de organização

| Decisão | Motivo |
|---------|--------|
| Só `index.html` na raiz | Entrada clara do site; demais rotas agrupadas |
| `pages/` para HTML interno | Evita dezenas de `.html` soltos na raiz |
| `meta/` para SEO/PWA | Separa metadados de conteúdo e facilita redirects no deploy |
| `docs/` + `pastas/*.md` | Inventário por arquivo, onboarding e revisão |
| `config/` fora da raiz | Toml e futuros pipelines não misturam com a home |

## Evolução futura (opcional)

- **URLs limpas** (`/trilha` em vez de `/pages/trilha.html`) via redirects no host.
- **Build leve** (Vite) mantendo a mesma árvore lógica.
- **Partials HTML** para cabeçalho/rodapé repetidos (requer gerador estático ou SSI).
