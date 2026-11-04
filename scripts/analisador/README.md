# Analisador VibeDJ (v0)

Gera um JSON de **grade de cadeiras vazia** e, se `librosa` estiver instalado, um **BPM estimado**.

```bash
cd scripts/analisador
pip install -r requirements.txt
python grade_v0.py "C:\caminho\referencia.wav" -o grade.json
```

Importe o JSON manualmente no laboratório (copiar/colar notas e BPM na grade) ou use como rascunho no LMMS.

O navegador continua sendo a leitura principal (`js/analise.js`); este script é apoio offline no plano Tech House Reverse Lab.
