/**
 * Importação de stems (arquivo ou pasta Demucs) para camadas de cadeiras.
 */

import { CHAIRS } from "./clonagem-model.js";
import { decodeAudioFile } from "./leitura-audio-core.js";
import {
  createStemLayer,
  isolationSummary,
  matchFileToChair,
  mergeStemImports,
  restoreChairFromBase,
  shortStemName,
} from "./isolamento-cadeiras.js";

/**
 * @param {File[]} files
 * @param {AudioContext} ctx
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<Record<string, ReturnType<typeof createStemLayer>>>}
 */
export async function decodeStemFiles(files, ctx, onProgress = () => {}) {
  /** @type {Record<string, ReturnType<typeof createStemLayer>>} */
  const imports = {};
  const list = [...files].filter((f) => f && f.size > 0);
  let index = 0;
  for (const file of list) {
    const chairId = matchFileToChair(file.name);
    if (!chairId) continue;
    index += 1;
    onProgress(`Lendo stem ${index}: ${file.name} → ${chairId}…`);
    const decoded = await decodeAudioFile(file, ctx);
    imports[chairId] = createStemLayer(decoded.mono, decoded.rate, decoded.name);
    await wait(0);
  }
  return imports;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   idPrefix: string,
 *   getCtx: () => AudioContext,
 *   getLayers: () => Record<string, object> | null,
 *   setLayers: (layers: Record<string, object>) => void,
 *   getExtractionBase: () => Record<string, object> | null,
 *   setExtractionBase?: (base: Record<string, object>) => void,
 *   onUpdated?: () => void,
 *   onStemMeta?: (chairId: string, layer: ReturnType<typeof createStemLayer> | null) => void,
 * }} config
 */
export function bindStemsPanel(config) {
  const { root, idPrefix } = config;
  const panel = root.querySelector(`[data-stems-${idPrefix}]`);
  if (!panel) return;

  const folderInput = root.querySelector(`[data-demucs-folder-${idPrefix}]`);
  const importBtn = root.querySelector(`[data-import-demucs-${idPrefix}]`);
  const statusEl = root.querySelector(`[data-stems-status-${idPrefix}]`);

  importBtn?.addEventListener("click", () => folderInput?.click());
  folderInput?.addEventListener("change", () => {
    const files = folderInput.files ? [...folderInput.files] : [];
    folderInput.value = "";
    void importFolder(config, files);
  });

  CHAIRS.forEach((chair) => {
    const input = root.querySelector(`[data-stem-${idPrefix}-${chair.id}]`);
    input?.addEventListener("change", () => {
      void loadSingleStem(config, chair.id, input);
    });
  });

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  async function importFolder(cfg, files) {
    if (!files.length) return;
    setStatus("Importando pasta…");
    try {
      const ctx = cfg.getCtx();
      await ctx.resume();
      const imports = await decodeStemFiles(files, ctx, setStatus);
      applyImports(cfg, imports, setStatus);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao importar pasta.");
    }
  }

  async function loadSingleStem(cfg, chairId, input) {
    const label = root.querySelector(`[data-stem-label-${idPrefix}-${chairId}]`);
    const file = input.files?.[0];
    if (!file) {
      let layers = cfg.getLayers();
      if (layers) {
        layers = restoreChairFromBase(layers, cfg.getExtractionBase(), chairId);
        cfg.setLayers(layers);
        cfg.onStemMeta?.(chairId, null);
        cfg.onUpdated?.();
      }
      if (label) label.textContent = "Nenhum";
      setStatus("");
      return;
    }
    if (label) label.textContent = `Lendo ${shortStemName(file.name)}…`;
    try {
      const ctx = cfg.getCtx();
      await ctx.resume();
      const decoded = await decodeAudioFile(file, ctx);
      const imports = { [chairId]: createStemLayer(decoded.mono, decoded.rate, decoded.name) };
      applyImports(cfg, imports, setStatus);
      if (label) label.textContent = shortStemName(decoded.name);
    } catch (err) {
      if (label) label.textContent = "Erro";
      setStatus(err instanceof Error ? err.message : "Falha ao ler stem.");
    }
  }

  function applyImports(cfg, imports, setStatusFn) {
    const keys = Object.keys(imports);
    if (!keys.length) {
      setStatusFn("Nenhum arquivo reconhecido. Use nomes Demucs (drums, bass, vocals…) ou kick/clap/hat.");
      return;
    }
    let layers = cfg.getLayers() || {};
    if (!cfg.getExtractionBase() && Object.keys(layers).length && cfg.setExtractionBase) {
      cfg.setExtractionBase({ ...layers });
    }
    layers = mergeStemImports(layers, cfg.getExtractionBase(), imports);
    cfg.setLayers(layers);
    keys.forEach((chairId) => {
      const label = root.querySelector(`[data-stem-label-${idPrefix}-${chairId}]`);
      const layer = imports[chairId];
      if (label && layer?.stemName) label.textContent = shortStemName(layer.stemName);
      cfg.onStemMeta?.(chairId, layer);
    });
    const summary = isolationSummary(layers);
    setStatusFn(
      `${summary.stem} stem(s) IA · ${summary.extracao} extração · ${summary.filtro} filtro · média ${summary.media_qualidade}%`,
    );
    cfg.onUpdated?.();
  }

  return {
    show() {
      if (panel) panel.hidden = false;
    },
    hide() {
      if (panel) panel.hidden = true;
    },
    resetLabels() {
      CHAIRS.forEach((chair) => {
        const label = root.querySelector(`[data-stem-label-${idPrefix}-${chair.id}]`);
        const input = root.querySelector(`[data-stem-${idPrefix}-${chair.id}]`);
        if (input) input.value = "";
        if (label) label.textContent = "Nenhum";
      });
      setStatus("");
    },
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
