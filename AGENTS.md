# VibeDJ — guia para agentes e contribuidores

Academia de música eletrônica para DJs: trilha, conceitos, sala, simulador de cabine e **laboratório de engenharia reversa** (clonagem de arquitetura, não de gravação).

## Onde está o quê

| Área | Caminho |
|------|---------|
| Home | `index.html` |
| Páginas | `pages/*.html` |
| Estilos globais | `css/tokens.css`, `css/base.css`, `css/academy.css` |
| Laboratório | `pages/laboratorio.html`, `css/laboratorio.css`, `js/analise.js`, `js/grade-cadeiras.js`, `js/laboratorio.js`, `js/isolamento-cadeiras.js`, `js/stems-import.js`, `js/extracao-elementos.js` |
| Simulador | `pages/simulador.html`, `js/simulator.js` |
| Clonagem (docs) | `docs/clonagem/` |
| Analisador CLI (opcional) | `scripts/analisador/` |
| Backend local de stems | repositório `vibedj-stems` (HTTP em `127.0.0.1:8777`, cliente em `js/stems-backend.js`) |

## Clonagem musical — regras do projeto

1. **Arquitetura, não obra**: copiar forma, frase, papéis de mix e entradas/saídas de camadas. Não replicar melodia protegida, sample identificável ou master alheio.
2. **Três operações por cadeira**: estrutura (presente, som seu) · troca · retirada. No lab web: manter · substituir · rejeitar.
3. **Grade de cadeiras**: matriz papéis × seções (intro, groove, break, drop). Estado em `localStorage` (`vibedj-grade-v1`). Módulo `js/clonagem-model.js`.
4. **Pacote JSON**: `mergeLabPacket()` junta leitura de arquivo (`window.__vibedjLastAnalise`), grade e relatório da bancada sintética (`window.__vibedjLabReport`).
5. **Eventos**: `vibedj:analise` após decodificar áudio; `vibedj:lab-ready` quando a bancada monta.

## Convenções de código

- ES modules em `js/`, imports no topo (sem inline imports).
- Switch com `never` no default em unions (TypeScript rule aplicável a padrões JS).
- Textos de interface em **português (BR)**; identificadores e JSON em snake_case ou camelCase consistentes com arquivos existentes.
- Cache bust em CSS/JS via `?v=` ao alterar folhas críticas (`academy.css`, `laboratorio.css`).

## Material de estudo do usuário

- PDF *Elementos da música eletrônica* → resumo em `docs/clonagem/elementos-musica-eletronica.md`
- Plano Tech House Reverse Lab + método das cadeiras → `docs/clonagem/metodo-cadeiras.md`
- Passo LMMS 16 compassos → `docs/clonagem/lmms-16-compassos.md`

Ao implementar features de clonagem, leia esses três arquivos antes de alterar o lab.

## Deploy

Netlify: `config/netlify.toml`. Render/Linux: paths case-sensitive; bind `0.0.0.0:$PORT` se houver server.
