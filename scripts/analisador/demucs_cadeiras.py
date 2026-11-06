#!/usr/bin/env python3
"""
Separa uma mix com Demucs e exporta WAVs nomeados para cadeiras VibeDJ.

Requer: pip install demucs
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

# Demucs 4-stem → cadeira (kick/clap/hat exigem stems finas ou renomeação manual)
DEMUCS_FOUR = {
    "bass.wav": "bass",
    "vocals.wav": "vocal",
    "other.wav": "stab",
    "drums.wav": "perc",
}

# Nomes extras comuns (UVR / renomeação manual)
NAME_HINTS = {
    "kick": "kick",
    "bd": "kick",
    "clap": "clap",
    "snare": "clap",
    "hat": "hat",
    "hihat": "hat",
    "hi-hat": "hat",
    "perc": "perc",
    "drums": "perc",
    "bass": "bass",
    "baixo": "bass",
    "vocal": "vocal",
    "vocals": "vocal",
    "vox": "vocal",
    "other": "stab",
    "stab": "stab",
    "fx": "fx",
    "transition": "fx",
}


def chair_from_stem_path(path: Path) -> str | None:
    stem = path.stem.lower()
    if stem in NAME_HINTS:
        return NAME_HINTS[stem]
    for key, chair in NAME_HINTS.items():
        if key in stem:
            return chair
    mapped = DEMUCS_FOUR.get(path.name.lower())
    if mapped:
        return mapped
    return None


def run_demucs(input_path: Path, work_dir: Path, model: str) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        model,
        "-o",
        str(work_dir),
        str(input_path),
    ]
    subprocess.run(cmd, check=True)
    track_name = input_path.stem
    separated = work_dir / model / track_name
    if not separated.is_dir():
        candidates = list(work_dir.glob(f"**/{track_name}"))
        if not candidates:
            raise SystemExit(f"Saída Demucs não encontrada em {work_dir}")
        separated = candidates[0]
    return separated


def export_chairs(separated_dir: Path, out_dir: Path, dry_run: bool) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"cadeiras": {}, "aviso_4stem": "drums.wav mapeia para perc; kick/clap/hat precisam stems finas."}
    seen: set[str] = set()
    for wav in sorted(separated_dir.glob("*.wav")):
        chair = chair_from_stem_path(wav)
        if not chair:
            continue
        if chair in seen:
            continue
        seen.add(chair)
        dest = out_dir / f"{chair}.wav"
        manifest["cadeiras"][chair] = {"origem": wav.name, "destino": dest.name}
        if not dry_run:
            shutil.copy2(wav, dest)
    if not manifest["cadeiras"]:
        raise SystemExit(f"Nenhum WAV reconhecido em {separated_dir}")
    manifest_path = out_dir / "manifest.json"
    if not dry_run:
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Demucs → WAVs por cadeira VibeDJ")
    parser.add_argument("input", type=Path, help="Mix (WAV/MP3/…) ")
    parser.add_argument("-o", "--out", type=Path, required=True, help="Pasta de saída com kick.wav, bass.wav, …")
    parser.add_argument("-n", "--model", default="htdemucs", help="Modelo Demucs (padrão: htdemucs)")
    parser.add_argument("--work", type=Path, default=None, help="Pasta temporária Demucs")
    parser.add_argument("--dry-run", action="store_true", help="Só mostra mapeamento, não copia")
    args = parser.parse_args()
    if not args.input.is_file():
        raise SystemExit(f"Arquivo não encontrado: {args.input}")
    work = args.work or (args.out / "_demucs_work")
    print(f"Rodando Demucs ({args.model})…")
    separated = run_demucs(args.input, work, args.model)
    print(f"Exportando cadeiras de {separated} → {args.out}")
    manifest = export_chairs(separated, args.out, args.dry_run)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    if not args.dry_run:
        print(f"Pronto. Importe a pasta {args.out} no laboratório (Importar pasta Demucs).")


if __name__ == "__main__":
    main()
