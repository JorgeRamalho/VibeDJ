/** Modelo compartilhado: grade de cadeiras, blocos de seção, export JSON. */

export const GRADE_STORAGE = "vibedj-grade-v1";
export const ANALISE_EVENT = "vibedj:analise";

/** 0 = vazio · 1 = presente (estrutura) · 2 = troca planejada */
export const CELL = Object.freeze({ OFF: 0, ON: 1, SWAP: 2 });

export const BLOCKS = [
  { id: "intro", label: "Intro", compassos: "1–4", hint: "Poucas camadas. Espaço para outra faixa." },
  { id: "groove", label: "Groove", compassos: "5–8", hint: "Chão completo: kick, clap, hat, baixo." },
  { id: "break", label: "Break", compassos: "9–12", hint: "Chão sai. Hat, stab, subida." },
  { id: "drop", label: "Drop", compassos: "13–16", hint: "Retorno do chão + stab." },
];

export const CHAIRS = [
  { id: "kick", label: "Kick", lab: true },
  { id: "clap", label: "Clap", lab: true },
  { id: "hat", label: "Hi-hat", lab: true },
  { id: "bass", label: "Baixo", lab: true },
  { id: "stab", label: "Stab", lab: true },
  { id: "fx", label: "Transição", lab: true },
  { id: "perc", label: "Percussão", lab: false },
  { id: "vocal", label: "Vocal / chop", lab: false },
];

const DIDACTIC = {
  intro: ["kick", "hat"],
  groove: ["kick", "clap", "hat", "bass"],
  break: ["hat", "stab", "fx"],
  drop: ["kick", "clap", "hat", "bass", "stab", "fx"],
};

export function createEmptyGrid() {
  return Object.fromEntries(CHAIRS.map((chair) => [chair.id, BLOCKS.map(() => CELL.OFF)]));
}

export function didacticGrid() {
  const grid = createEmptyGrid();
  BLOCKS.forEach((block, col) => {
    const active = DIDACTIC[block.id] || [];
    CHAIRS.forEach((chair) => {
      grid[chair.id][col] = active.includes(chair.id) ? CELL.ON : CELL.OFF;
    });
  });
  return grid;
}

export function cycleCell(value) {
  switch (value) {
    case CELL.OFF:
      return CELL.ON;
    case CELL.ON:
      return CELL.SWAP;
    case CELL.SWAP:
      return CELL.OFF;
    default:
      return CELL.OFF;
  }
}

export function cellLabel(value) {
  switch (value) {
    case CELL.ON:
      return "Presente · estrutura";
    case CELL.SWAP:
      return "Troca planejada";
    default:
      return "Vazio · retirada";
  }
}

export function cellSymbol(value) {
  switch (value) {
    case CELL.ON:
      return "●";
    case CELL.SWAP:
      return "↻";
    default:
      return "·";
  }
}

export function loadGradeState() {
  try {
    const raw = localStorage.getItem(GRADE_STORAGE);
    if (!raw) return defaultGradeState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.grid) return defaultGradeState();
    return normalizeState(parsed);
  } catch {
    return defaultGradeState();
  }
}

export function saveGradeState(state) {
  localStorage.setItem(GRADE_STORAGE, JSON.stringify(normalizeState(state)));
}

function defaultGradeState() {
  return {
    grid: createEmptyGrid(),
    meta: { arquivo: "", bpm_estimado: null, notas: "" },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(state) {
  const grid = createEmptyGrid();
  CHAIRS.forEach((chair) => {
    const row = state.grid && state.grid[chair.id];
    if (Array.isArray(row)) {
      BLOCKS.forEach((_, col) => {
        const v = row[col];
        grid[chair.id][col] = v === CELL.ON || v === CELL.SWAP ? v : CELL.OFF;
      });
    }
  });
  return {
    grid,
    meta: {
      arquivo: state.meta?.arquivo ?? "",
      bpm_estimado: state.meta?.bpm_estimado ?? null,
      notas: state.meta?.notas ?? "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function exportGradeDocument(state) {
  return {
    tipo: "grade-cadeiras-vibedj",
    versao: 1,
    operacoes: {
      "0": "retirada_ou_ausente",
      "1": "estrutura_presente",
      "2": "troca_planejada",
    },
    blocos: BLOCKS.map((b) => ({ id: b.id, compassos: b.compassos, rotulo: b.label })),
    cadeiras: CHAIRS.map((c) => ({ id: c.id, rotulo: c.label, bancada_sintetica: c.lab })),
    meta: state.meta,
    grade: state.grid,
    atualizado_em: state.updatedAt,
  };
}

export function readGradeForReport() {
  return exportGradeDocument(loadGradeState());
}

export function mergeLabPacket(labReport, analiseReport) {
  const base = {
    pacote: "vibedj-laboratorio-completo",
    gerado_em: new Date().toISOString(),
    leitura_arquivo: analiseReport || null,
    grade_cadeiras: readGradeForReport(),
    bancada_sintetica: labReport,
  };
  if (typeof window !== "undefined" && window.__vibedjTransplante) {
    base.transplante = window.__vibedjTransplante;
  }
  return base;
}
