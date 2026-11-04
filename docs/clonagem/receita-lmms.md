# Da receita JSON da mesa ao LMMS

Depois de **Copiar receita da track nova** ou **Copiar leitura JSON**, use este roteiro para a **faixa final** no LMMS.

## 1. Ler o JSON

Campos úteis da receita (`tipo: track-nova-transplante`):

| Campo | Uso no LMMS |
|-------|-------------|
| `nome` | Nome do projeto |
| `doador_a.arquivo` / `doador_b.arquivo` | Referência muda (volume baixo) |
| `doador_a.bpm_estimado` | Tempo do projeto (média com B se diferir) |
| `orgaos.<id>.origem` | `doador_a`, `doador_b` ou `vazio` |
| `orgaos.<id>.leitura` | Nota na faixa (o que aquele papel fazia na origem) |

IDs de cadeira: `kick`, `clap`, `hat`, `bass`, `stab`, `fx`, `perc`, `vocal`.

## 2. Projeto base

Siga [lmms-16-compassos.md](./lmms-16-compassos.md):

- BPM da receita (não fixe 124 se o JSON disser outro).
- 16 compassos, 4/4.
- Blocos: intro 1–4, groove 5–8, break 9–12, drop 13–16.

## 3. Uma faixa por cadeira

| Cadeira LMMS | Se `origem` = doador_a | Se doador_b | Se vazio |
|--------------|------------------------|-------------|----------|
| Kick | Sample **seu** inspirado no stem A de kick | Idem B | Silêncio ou ghost |
| Clap | … | … | … |
| Hi-hat | … | … | … |
| Baixo | MIDI ou sample seu | … | … |
| Stab | … | … | … |
| FX | … | … | … |
| Perc / vocal | … | … | … |

**Não** exporte stems comerciais da referência como master. Use stems só para ouvir função; o som que exporta é **substituído** por timbre seu (troca na grade = ↻).

## 4. Espelhar a grade web

Na [grade de cadeiras](../../pages/laboratorio.html#grade):

- **Presente (●)** = cadeira ocupa o bloco na track nova.
- **Troca (↻)** = mesmo tempo, **outro** sample/synth.
- **Vazio (·)** = buraco de arranjo (retirada).

A receita da mesa diz **de qual doador veio o papel**; a grade diz **se você mantém, troca ou tira** por seção.

## 5. Export

- Mix no LMMS → **Export as WAV/MP3** (só o projeto novo).
- Compare com a **leitura final montada** do lab (preview), não com a referência alheia.

## 6. Pacote completo

O botão **Pacote completo** na mesa junta leitura de arquivo, grade, bancada sintética e transplante — útil para arquivar o exercício, não substitui o `.mpt` do LMMS.
