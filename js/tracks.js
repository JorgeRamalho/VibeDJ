const SECTIONS = [
  { from: 0, to: 8, name: "Intro", density: "intro" },
  { from: 8, to: 16, name: "Base", density: "groove" },
  { from: 16, to: 24, name: "Quebra", density: "break" },
  { from: 24, to: 32, name: "Drop", density: "drop" },
];

export const TRACKS = [
  {
    id: "quarto-escuro",
    title: "Quarto Escuro",
    artist: "Oficina Vibe",
    genre: "House",
    bpm: 122,
    camelot: "8A",
    keyLabel: "Lá menor",
    pc: 9,
    minor: true,
    root: 110,
    energy: 2,
    voice: "house",
    variant: 0,
    bars: 32,
    pair: true,
    blurb: "House de estudo. O kick marca os quatro tempos.",
  },
  {
    id: "sal-de-pista",
    title: "Sal de Pista",
    artist: "Oficina Vibe",
    genre: "House",
    bpm: 124,
    camelot: "8A",
    keyLabel: "Lá menor",
    pc: 9,
    minor: true,
    root: 110,
    energy: 3,
    voice: "house",
    variant: 1,
    bars: 32,
    pair: true,
    blurb: "O par do Quarto Escuro: mesmo tom, dois BPM acima.",
  },
  {
    id: "oficina-7",
    title: "Oficina 7",
    artist: "Oficina Vibe",
    genre: "Techno",
    bpm: 128,
    camelot: "4A",
    keyLabel: "Fá menor",
    pc: 5,
    minor: true,
    root: 87.31,
    energy: 4,
    voice: "techno",
    variant: 0,
    bars: 32,
    pair: false,
    blurb: "Kick seco e hat contínuo. Família mais rápida.",
  },
  {
    id: "mare-baixa",
    title: "Maré Baixa",
    artist: "Oficina Vibe",
    genre: "Afro house",
    bpm: 120,
    camelot: "9A",
    keyLabel: "Mi menor",
    pc: 4,
    minor: true,
    root: 82.41,
    energy: 3,
    voice: "afro",
    variant: 0,
    bars: 32,
    pair: false,
    blurb: "Percussão deslocada. O kick não está em todo tempo.",
  },
  {
    id: "vidro-quente",
    title: "Vidro Quente",
    artist: "Oficina Vibe",
    genre: "Melodic techno",
    bpm: 126,
    camelot: "7A",
    keyLabel: "Ré menor",
    pc: 2,
    minor: true,
    root: 73.42,
    energy: 3,
    voice: "melodic",
    variant: 0,
    bars: 32,
    pair: false,
    blurb: "Base techno com um acorde curto no drop.",
  },
  {
    id: "linha-de-corte",
    title: "Linha de Corte",
    artist: "Oficina Vibe",
    genre: "Drum and bass",
    bpm: 174,
    camelot: "11A",
    keyLabel: "Fá# menor",
    pc: 6,
    minor: true,
    root: 92.5,
    energy: 5,
    voice: "dnb",
    variant: 0,
    bars: 32,
    pair: false,
    blurb: "Break, não four-on-the-floor. Outra família de tempo.",
  },
];

export function totalSteps(track) {
  return track.bars * 16;
}

export function eventAt(track, step) {
  const total = totalSteps(track);
  const s = ((step % total) + total) % total;
  const bar = Math.floor(s / 16);
  const i = s % 16;
  const section = SECTIONS.find((item) => bar >= item.from && bar < item.to) ?? SECTIONS[0];
  const hits = voiceHits(track, section.density, i, bar);
  return {
    ...hits,
    section: section.name,
    density: section.density,
    bar,
    step: s,
  };
}

function on(i, n) {
  return i === n;
}

function voiceHits(track, density, i, bar) {
  switch (track.voice) {
    case "house":
      return houseHits(track.variant, density, i, bar);
    case "techno":
      return technoHits(density, i, bar, false);
    case "melodic":
      return technoHits(density, i, bar, true);
    case "afro":
      return afroHits(density, i, bar);
    case "dnb":
      return dnbHits(density, i);
    default: {
      const unknown = track.voice;
      throw new Error(`Voz de faixa desconhecida: ${unknown}`);
    }
  }
}

function houseHits(variant, density, i, bar) {
  const broken = density === "break";
  const intro = density === "intro";
  const full = density === "groove" || density === "drop";
  const kick = broken ? 0 : i % 4 === 0 ? 1 : 0;
  const clap = intro || broken ? 0 : on(i, 4) || on(i, 12) ? 0.9 : 0;
  let hat = i % 2 === 1 ? 0.62 : 0.16;
  if (variant === 1) {
    hat = i % 2 === 0 ? 0.28 : 0.5;
    if (on(i, 14) && full) hat = 0.95;
  }
  if (broken) hat *= 0.45;
  let bass = 0;
  if (full) {
    bass = variant === 1
      ? on(i, 0) || on(i, 3) || on(i, 8) || on(i, 11) ? 0.86 : 0
      : on(i, 2) || on(i, 6) || on(i, 10) || on(i, 14) ? 0.9 : 0;
  }
  const stab = density === "drop" && on(i, 0) && bar % 2 === 0 ? 0.8 : 0;
  return { kick, hat, clap, bass, stab, perc: 0 };
}

function technoHits(density, i, bar, melodic) {
  const kick = density === "break" ? 0 : i % 4 === 0 ? 1 : 0;
  const hat = density === "break" ? (i % 4 === 2 ? 0.28 : 0) : 0.2 + (i % 2 === 1 ? 0.38 : 0);
  const clap = density === "drop" && (on(i, 4) || on(i, 12)) ? 0.5 : 0;
  const bass = density === "groove" || density === "drop" ? (i % 4 === 0 ? 0.72 : 0) : 0;
  const stab = melodic && (density === "drop" || density === "groove") && on(i, 0) && bar % 2 === 0 ? 0.9 : 0;
  return { kick, hat, clap, bass, stab, perc: 0 };
}

function afroHits(density, i, bar) {
  const kick = density === "break" ? 0 : on(i, 0) || on(i, 8) || (density !== "intro" && on(i, 10)) ? 1 : 0;
  const hat = 0.18;
  const perc = density === "intro" ? 0.22 : on(i, 3) || on(i, 6) || on(i, 11) || on(i, 14) ? 0.7 : 0.28;
  const clap = density === "intro" ? 0 : on(i, 12) ? 0.75 : density === "drop" && on(i, 4) ? 0.4 : 0;
  const bass = density === "groove" || density === "drop" ? (on(i, 3) || on(i, 11) || on(i, 14) ? 0.82 : 0) : 0;
  const stab = density === "drop" && on(i, 0) && bar % 4 === 0 ? 0.45 : 0;
  return { kick, hat, clap, bass, stab, perc };
}

function dnbHits(density, i) {
  const kick = density === "break" ? 0 : on(i, 0) || on(i, 10) ? 1 : 0;
  const clap = on(i, 4) || on(i, 12) ? 0.95 : 0;
  const hat = i % 2 === 0 ? 0.42 : 0.18;
  const bass = density === "groove" || density === "drop" ? (on(i, 2) || on(i, 7) || on(i, 14) ? 0.88 : 0) : 0;
  const perc = on(i, 6) ? 0.35 : 0;
  return { kick, hat, clap, bass, stab: 0, perc };
}

export function waveformOf(track) {
  const total = totalSteps(track);
  const data = new Float32Array(total * 3);
  for (let step = 0; step < total; step += 1) {
    const event = eventAt(track, step);
    data[step * 3] = Math.min(1, event.kick + event.bass * 0.85);
    data[step * 3 + 1] = Math.min(1, event.clap * 0.95 + event.stab * 0.8 + event.perc * 0.35);
    data[step * 3 + 2] = Math.min(1, event.hat * 0.9);
  }
  return data;
}
