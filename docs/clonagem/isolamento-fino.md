# Isolamento fino (stems + extração)

Três níveis de qualidade no laboratório, do mais fraco ao mais forte:

| Nível | Fonte no JSON | Uso |
|-------|----------------|-----|
| Filtro | `filtro` (~38%) | Fallback rápido por banda na mix |
| Extração | `extracao` (~58–97%) | HPSS fino no browser (pulso de BPM, menos bleed kick↔baixo) |
| Stem IA | `stem` (100%) | WAV de UVR/Demucs anexado ou pasta importada |

Regra do projeto: estudar **arquitetura** (papéis, frase, mix), não copiar obra protegida.

## Fluxo recomendado

1. **Leitura** — abra a mix; o lab extrai as oito cadeiras automaticamente.
2. **PC** — rode Demucs ou UVR no arquivo inteiro (ver CLI abaixo).
3. **Importar** — em **Isolamento fino — stems UVR / Demucs**, use **Importar pasta Demucs** ou anexe um WAV por cadeira.
4. **JSON** — o campo `isolamento` resume quantas cadeiras estão em stem vs extração; `elementos_wav` indica `fonte` e `qualidade` por cadeira.
5. **Mesa** — mesmo painel em cada doador; a montagem da track nova prioriza stem quando existir.

## Nomes de arquivo reconhecidos

O importador mapeia pelo nome (caminho incluído):

- `kick`, `bd`, `clap`, `snare`, `hat`, `hihat`, `bass`, `baixo`, `vocal`, `vox`
- Demucs 4-stem: `drums` → perc, `bass` → baixo, `vocals` → vocal, `other` → stab

Para kick/clap/hat separados, prefira modelos **6 stems** (htdemucs) ou exports UVR já renomeados (`kick.wav`, `hat.wav`, …).

## CLI Demucs → cadeiras

```bash
cd scripts/analisador
pip install demucs
python demucs_cadeiras.py "C:\mix\referencia.wav" -o "C:\mix\stems-vibedj"
```

A pasta de saída traz WAVs nomeados por cadeira + `manifest.json`. Importe essa pasta no lab (webkitdirectory).

## Limites

- Extração no browser analisa até **4 minutos** centrais em faixas longas; stems cobrem o arquivo inteiro.
- `drums` do Demucs 4-stem **não** isola kick sozinho — use stems finas ou edição manual.
- Stems ajudam a **ouvir e montar**; não devolvem projeto DAW nem MIDI.

Ver também: [stems-mesa-transplante.md](./stems-mesa-transplante.md), [metodo-cadeiras.md](./metodo-cadeiras.md).
