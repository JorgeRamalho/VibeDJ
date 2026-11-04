# Stems na mesa de transplante (UVR / Demucs)

Use stems **só para estudo e montagem no laboratório**. O master final liberável continua sendo recriação sua no LMMS (samples/MIDI), conforme [metodo-cadeiras.md](./metodo-cadeiras.md).

## Fluxo recomendado

1. Carregue as **mixes** doadoras A e B na mesa (inventário heurístico).
2. Separe stems no PC com **Ultimate Vocal Remover**, **Demucs** ou similar.
3. Em cada doador, abra **Stems UVR/Demucs (opcional)** e anexe um arquivo por **cadeira** (kick, clap, hi-hat, …).
4. Monte a receita na matriz (retirar de A ou B).
5. **Leitura final** → modo **Track montada** → **Gerar track e ler resultado**.
6. Escolha **WAV** ou **MP3** e baixe. Opcional: LMMS com [receita-lmms.md](./receita-lmms.md).

## Mapeamento Demucs → cadeiras (sugestão)

| Arquivo Demucs (4 stems) | Cadeira na mesa |
|--------------------------|-----------------|
| `drums` | Kick + clap + hat + perc (ideal: stems mais finas) |
| `bass` | Baixo |
| `vocals` | Vocal / chop |
| `other` | Stab, transição, resto |

Com **6 stems** (htdemucs): use `drums` para percussão, exporte kick/hat manualmente se o UVR permitir, ou anexe WAVs já renomeados por órgão.

## Híbrido

- Cadeira **com** stem → montagem usa o arquivo anexado.
- Cadeira **sem** stem → montagem usa **filtro na mix** (como antes).

A leitura final JSON indica quantos órgãos vieram de stem vs filtro (`fontes_montagem`).

## FFmpeg (alternativa ao MP3 no browser)

Se o MP3 no lab falhar (rede), converta o WAV:

```bash
ffmpeg -i track-nova.wav -codec:a libmp3lame -b:a 192k track-nova.mp3
```
