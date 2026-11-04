#!/usr/bin/env python3
"""
VibeDJ — analisador v0: BPM estimado + grade de cadeiras vazia (JSON).

Uso:
  python grade_v0.py caminho/para/audio.wav
  python grade_v0.py caminho/para/audio.wav -o saida.json

Requer librosa (opcional). Sem librosa, gera grade vazia e aviso no JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BLOCKS = [
    {"id": "intro", "label": "Intro", "compassos": "1–4"},
    {"id": "groove", "label": "Groove", "compassos": "5–8"},
    {"id": "break", "label": "Break", "compassos": "9–12"},
    {"id": "drop", "label": "Drop", "compassos": "13–16"},
]

CHAIRS = [
    "kick",
    "clap",
    "hat",
    "bass",
    "stab",
    "fx",
    "perc",
    "vocal",
]


def empty_grid() -> dict[str, list[int]]:
    return {chair: [0, 0, 0, 0] for chair in CHAIRS}


def estimate_bpm(path: Path) -> tuple[float | None, str]:
    try:
        import librosa
    except ImportError:
        return None, "librosa não instalado; pip install -r requirements.txt"

    try:
        y, sr = librosa.load(path, mono=True, duration=120)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo)
        if bpm <= 0:
            return None, "andamento não detectado"
        if bpm < 80 or bpm > 180:
            return round(bpm, 1), "BPM fora da faixa típica de pista; confira no ouvido"
        return round(bpm, 1), "estimativa automática"
    except Exception as exc:  # noqa: BLE001 — CLI tool
        return None, f"erro na leitura: {exc}"


def build_document(path: Path) -> dict:
    bpm, note = estimate_bpm(path)
    return {
        "tipo": "grade-cadeiras-vibedj",
        "versao": 1,
        "origem": "scripts/analisador/grade_v0.py",
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "arquivo": path.name,
        "meta": {
            "arquivo": path.name,
            "bpm_estimado": bpm,
            "notas": note,
        },
        "operacoes": {
            "0": "retirada_ou_ausente",
            "1": "estrutura_presente",
            "2": "troca_planejada",
        },
        "blocos": BLOCKS,
        "cadeiras": [{"id": c, "rotulo": c} for c in CHAIRS],
        "grade": empty_grid(),
        "aviso": "Grade vazia para marcar manualmente. Importe no lab ou edite no LMMS.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera JSON de grade VibeDJ a partir de áudio.")
    parser.add_argument("audio", type=Path, help="WAV, MP3, etc.")
    parser.add_argument("-o", "--output", type=Path, help="Arquivo JSON de saída")
    args = parser.parse_args()
    if not args.audio.is_file():
        print(f"Arquivo não encontrado: {args.audio}", file=sys.stderr)
        return 1
    doc = build_document(args.audio)
    text = json.dumps(doc, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        print(f"Gravado: {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
