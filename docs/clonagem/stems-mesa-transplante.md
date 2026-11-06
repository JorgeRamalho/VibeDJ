# Stems na mesa de transplante (UVR / Demucs)

Use stems **só para estudo e montagem no laboratório**. O master final liberável continua sendo recriação sua no LMMS (samples/MIDI), conforme [metodo-cadeiras.md](./metodo-cadeiras.md).

## Fluxo no navegador

No painel do doador, **Separar stems** baixa dois modelos ONNX e roda no próprio navegador. O áudio não sai da máquina.

1. O recorte são 16 compassos a partir do primeiro ataque, no BPM já estimado. Se a leitura não tiver confiança, o andamento é 124.
2. HT-Demucs devolve `drums`, `bass`, `vocals` e `other`.
3. DrumSep v2 recebe só `drums` e devolve kick, snare, cymbals e toms.
4. Cadeiras que você já anexou à mão não são substituídas. Stab e transição continuam no filtro da mix, porque `other` misturaria as duas se fosse para as duas cadeiras.

| Saída | Cadeira |
|---|---|
| kick | Kick |
| snare | Clap |
| cymbals | Hi-hat |
| toms | Percussão |
| bass | Baixo |
| vocals | Vocal / chop |
| other | nenhuma |

Os pesos não estão no repositório. O navegador baixa na hora e guarda na Cache API.

## Fluxo no PC, quando o navegador não der conta

1. Carregue as **mixes** doadoras A e B na mesa (inventário heurístico).
2. Separe stems no PC com **Ultimate Vocal Remover**, **Demucs** ou similar.
3. Em cada doador, abra **Stems** e anexe um arquivo por **cadeira** (kick, clap, hi-hat, …).
4. Monte a receita na matriz (retirar de A ou B).
5. **Leitura final** → modo **Track montada** → **Gerar track e ler resultado**.
6. Escolha **WAV** ou **MP3** e baixe. Opcional: LMMS com [receita-lmms.md](./receita-lmms.md).

## Mapeamento Demucs de quatro stems, sem DrumSep

| Arquivo Demucs (4 stems) | Cadeira na mesa |
|--------------------------|-----------------|
| `drums` | ainda junta kick, clap, hat e perc — passe pelo DrumSep antes de anexar |
| `bass` | Baixo |
| `vocals` | Vocal / chop |
| `other` | não anexe em stab e transição ao mesmo tempo |

Com **6 stems** (htdemucs): use `drums` para percussão, exporte kick/hat manualmente se o UVR permitir, ou anexe WAVs já renomeados por elemento.

Guia completo: [isolamento-fino.md](./isolamento-fino.md).

## Híbrido

- Cadeira **com** stem → montagem usa o arquivo anexado.
- Cadeira **sem** stem → montagem usa **filtro na mix** (como antes).

A leitura final JSON indica quantos elementos vieram de stem vs filtro (`fontes_montagem`).

## FFmpeg (alternativa ao MP3 no browser)

Se o MP3 no lab falhar (rede), converta o WAV:

```bash
ffmpeg -i track-nova.wav -codec:a libmp3lame -b:a 192k track-nova.mp3
```
