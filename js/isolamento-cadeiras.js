/**
 * Caminho de isolamento fino: stems IA (UVR/Demucs) > extração espectral > filtro.
 */

import { CHAIRS } from "./clonagem-model.js";

export const QUALIDADE_STEM = 100;
export const QUALIDADE_FILTRO = 38;

/** Ordem importa: padrões específicos antes de drums/other genéricos. */
const FILE_TO_CHAIR = [
  { id: "kick", re: /(?:^|[/\\_.-])(kick|bd|bassdrum|808_kick)(?:[/\\_.-]|$)/i },
  { id: "clap", re: /(?:^|[/\\_.-])(clap|snare|rim|rimshot)(?:[/\\_.-]|$)/i },
  { id: "hat", re: /(?:^|[/\\_.-])(hat|hihat|hi-?hat|cymbal|ride)(?:[/\\_.-]|$)/i },
  { id: "bass", re: /(?:^|[/\\_.-])(bass|baixo|sub(?:_?bass)?)(?:[/\\_.-]|$)/i },
  { id: "vocal", re: /(?:^|[/\\_.-])(vocal?s?|vox|voice|speech)(?:[/\\_.-]|$)/i },
  { id: "stab", re: /(?:^|[/\\_.-])(stab|chord|keys|piano|synth|other)(?:[/\\_.-]|$)/i },
  { id: "fx", re: /(?:^|[/\\_.-])(fx|riser|sweep|impact|noise|transition|transicao)(?:[/\\_.-]|$)/i },
  { id: "perc", re: /(?:^|[/\\_.-])(perc|shaker|conga|tom|drums?|bateria)(?:[/\\_.-]|$)/i },
];

/** Demucs 4-stem: drums não isola kick — marque no manifesto. */
const DEMUCS_FOUR_STEM = {
  bass: "bass",
  vocals: "vocal",
  other: "stab",
  drums: "perc",
};

/**
 * @param {string} pathOrName
 * @returns {string | null} chair id
 */
export function matchFileToChair(pathOrName) {
  const base = String(pathOrName || "").replace(/\\/g, "/");
  for (const rule of FILE_TO_CHAIR) {
    if (rule.re.test(base)) return rule.id;
  }
  const lower = base.toLowerCase();
  for (const [stem, chair] of Object.entries(DEMUCS_FOUR_STEM)) {
    if (lower.includes(stem)) return chair;
  }
  return null;
}

/**
 * @param {Float32Array} mono
 * @param {number} rate
 * @param {string} [stemName]
 */
export function createStemLayer(mono, rate, stemName = "") {
  return {
    mono,
    rate,
    source: "stem",
    qualidade: QUALIDADE_STEM,
    stemName,
  };
}

/**
 * @param {Record<string, { source?: string, qualidade?: number }> | null} layers
 */
export function isolationSummary(layers) {
  const summary = { stem: 0, extracao: 0, filtro: 0, total: CHAIRS.length, media_qualidade: 0 };
  if (!layers) return summary;
  let qualSum = 0;
  let qualN = 0;
  CHAIRS.forEach((chair) => {
    const layer = layers[chair.id];
    if (!layer) return;
    switch (layer.source) {
      case "stem":
        summary.stem += 1;
        break;
      case "filtro":
        summary.filtro += 1;
        break;
      default:
        summary.extracao += 1;
        break;
    }
    if (layer.qualidade != null) {
      qualSum += layer.qualidade;
      qualN += 1;
    }
  });
  summary.media_qualidade = qualN ? Math.round(qualSum / qualN) : 0;
  return summary;
}

/**
 * @param {Record<string, import("./extracao-elementos.js").ElementLayer>} layers
 * @param {Record<string, import("./extracao-elementos.js").ElementLayer>} extractionBase
 * @param {Record<string, import("./extracao-elementos.js").ElementLayer>} imports
 */
export function mergeStemImports(layers, extractionBase, imports) {
  const out = { ...layers };
  for (const chair of CHAIRS) {
    const stem = imports[chair.id];
    if (!stem) continue;
    out[chair.id] = stem;
  }
  return out;
}

/**
 * Restaura extração automática quando o stem de uma cadeira é removido.
 * @param {Record<string, import("./extracao-elementos.js").ElementLayer>} layers
 * @param {Record<string, import("./extracao-elementos.js").ElementLayer} | null} extractionBase
 * @param {string} chairId
 */
export function restoreChairFromBase(layers, extractionBase, chairId) {
  if (!extractionBase?.[chairId]) return layers;
  return { ...layers, [chairId]: extractionBase[chairId] };
}

/**
 * @param {string} idPrefix e.g. "a" | "leitura"
 */
export function renderStemsPanelHtml(idPrefix) {
  const rows = CHAIRS.map(
    (chair) => `<li class="stems-row">
      <label class="stems-row__label">${chair.label}
        <input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" data-stem-${idPrefix}-${chair.id}>
        <span class="stems-row__name" data-stem-label-${idPrefix}-${chair.id}>Nenhum</span>
      </label>
    </li>`,
  ).join("");
  return `<details class="stems-panel" data-stems-${idPrefix} hidden>
    <summary>Isolamento fino — stems UVR / Demucs</summary>
    <p class="stems-panel__hint">Stems de IA substituem a extração da cadeira (qualidade máxima). Importe a pasta Demucs ou anexe um WAV por elemento. Guia: <a href="../docs/clonagem/isolamento-fino.md">isolamento fino</a>.</p>
    <div class="stems-panel__actions">
      <button type="button" class="btn btn--ghost btn--sm" data-import-demucs-${idPrefix}>Importar pasta Demucs</button>
      <input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" multiple webkitdirectory data-demucs-folder-${idPrefix} hidden>
      <span class="stems-panel__status" data-stems-status-${idPrefix} aria-live="polite"></span>
    </div>
    <ul class="stems-list">${rows}</ul>
  </details>`;
}

export function shortStemName(name, max = 28) {
  if (!name) return "—";
  if (name.length <= max) return name;
  return `${name.slice(0, 12)}…${name.slice(-10)}`;
}
