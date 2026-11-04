/**
 * Montagem da track nova: stems anexados (UVR/Demucs) ou faixas filtradas da mix.
 */

import { CHAIRS } from "./clonagem-model.js";
import { buildElementInventory } from "./inventario-elementos.js";
import { mixdown, scanOverview } from "./leitura-audio-core.js";
import { bpmDaReceita, organActiveAtStep, sectionOf } from "./realizacao-receptor.js";

/**
 * @typedef {{ mono: Float32Array, rate: number, source: "stem" | "filtro" }} OrganLayer
 * @typedef {{
 *   buffer?: AudioBuffer,
 *   mono?: Float32Array,
 *   rate?: number,
 *   duration?: number,
 *   inventario?: { bpm_estimado?: number | null },
 *   stems?: Record<string, { mono: Float32Array, rate: number, name: string }>,
 *   organLayers?: Record<string, OrganLayer>,
 *   organLayersDirty?: boolean,
 * }} DonorSlot
 */

const BARS = 16;
const STEPS = 16;
const OUT_RATE = 44100;

const ORGAN_FILTERS = {
  kick: [
    { type: "highpass", freq: 32, q: 0.7 },
    { type: "lowpass", freq: 115, q: 0.8 },
  ],
  clap: [
    { type: "highpass", freq: 650 },
    { type: "bandpass", freq: 2100, q: 0.85 },
  ],
  hat: [{ type: "highpass", freq: 5200 }],
  bass: [
    { type: "highpass", freq: 52 },
    { type: "lowpass", freq: 230, q: 0.7 },
  ],
  stab: [
    { type: "highpass", freq: 160 },
    { type: "bandpass", freq: 720, q: 0.55 },
  ],
  fx: [
    { type: "highpass", freq: 1800 },
    { type: "lowpass", freq: 11000 },
  ],
  perc: [
    { type: "highpass", freq: 900 },
    { type: "bandpass", freq: 3400, q: 0.5 },
  ],
  vocal: [
    { type: "highpass", freq: 180 },
    { type: "bandpass", freq: 520, q: 0.45 },
    { type: "lowpass", freq: 3200 },
  ],
};

const TRANSIENT_ORGANS = new Set(["kick", "clap", "hat", "perc"]);

/**
 * @param {{
 *   nome: string,
 *   receita: Record<string, "a" | "b" | null>,
 *   donors: Record<"a"|"b", DonorSlot>,
 *   onProgress?: (msg: string) => void,
 * }} input
 */
export async function montarTrackRealELer(input) {
  const onProgress = input.onProgress ?? (() => {});
  const outputBpm = bpmDaReceita(input.receita, input.donors);
  onProgress("Preparando faixas dos doadores…");
  await Promise.all([
    ensureOrganLayers(input.donors.a, onProgress),
    ensureOrganLayers(input.donors.b, onProgress),
  ]);
  const fontes = countFontesMontagem(input.receita, input.donors);
  onProgress("Montando 16 compassos e mixando órgãos…");
  const buffer = montarBuffer(input.receita, input.donors, outputBpm);
  onProgress("Medindo a track montada…");
  const mono = mixdown(buffer);
  const overview = await scanOverview(mono, buffer.sampleRate, buffer);
  const inventario = buildElementInventory({
    overview,
    mono,
    rate: buffer.sampleRate,
    duration: buffer.duration,
  });
  inventario.arquivo = input.nome;
  const leitura = {
    tipo: "leitura-final-montagem",
    versao: 1,
    nome: input.nome,
    bpm_usado: outputBpm,
    duracao_segundos: Math.round(buffer.duration * 100) / 100,
    metodo: fontes.stem > 0 ? "montagem-stems-hibrida" : "montagem-faixas-filtradas",
    fontes_montagem: fontes,
    aviso:
      fontes.stem > 0
        ? "Track montada com stems anexados onde existiam; demais órgãos usam filtro na mix. Grade de 16 compassos. O inventário foi medido neste áudio — ainda pode haver bleed; master final no LMMS com timbres seus."
        : "Track montada só com filtros na mix (nenhum stem anexado). Anexe stems UVR/Demucs nos doadores para melhorar. O inventário foi medido neste áudio composto.",
    orgaos_na_receita: Object.fromEntries(
      CHAIRS.map((chair) => [
        chair.id,
        input.receita[chair.id] ? (input.receita[chair.id] === "a" ? "doador_a" : "doador_b") : "vazio",
      ]),
    ),
    inventario,
  };
  return { buffer, leitura };
}

/**
 * @param {DonorSlot} slot
 * @param {(msg: string) => void} onProgress
 */
async function ensureOrganLayers(slot, onProgress) {
  if (!slot.buffer) throw new Error("Doador sem áudio decodificado.");
  if (slot.organLayers && !slot.organLayersDirty) return slot.organLayers;
  const rate = slot.buffer.sampleRate;
  /** @type {Record<string, OrganLayer>} */
  const layers = {};
  for (const chair of CHAIRS) {
    const stem = slot.stems?.[chair.id];
    if (stem?.mono?.length) {
      onProgress(`Stem ${chair.label} (${stem.name})…`);
      layers[chair.id] = { mono: stem.mono, rate: stem.rate, source: "stem" };
      await wait(0);
      continue;
    }
    onProgress(`Filtrando ${chair.label} na mix…`);
    const filtered = await filterOrganBuffer(slot.buffer, chair.id);
    let mono = mixdown(filtered);
    if (TRANSIENT_ORGANS.has(chair.id)) mono = emphasizeTransients(mono);
    layers[chair.id] = { mono, rate, source: "filtro" };
    await wait(0);
  }
  slot.organLayers = layers;
  slot.organLayersDirty = false;
  return layers;
}

function countFontesMontagem(receita, donors) {
  let stem = 0;
  let filtro = 0;
  CHAIRS.forEach((chair) => {
    const side = receita[chair.id];
    if (!side) return;
    const layer = donors[side].organLayers?.[chair.id];
    if (!layer) return;
    if (layer.source === "stem") stem += 1;
    else filtro += 1;
  });
  return { stem, filtro, total: stem + filtro };
}

async function filterOrganBuffer(buffer, organId) {
  const chain = ORGAN_FILTERS[organId];
  if (!chain) throw new Error(organId);
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const rate = buffer.sampleRate;
  const offline = new OfflineAudioContext(channels, length, rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  let node = source;
  for (const def of chain) {
    const filter = offline.createBiquadFilter();
    filter.type = def.type;
    filter.frequency.value = def.freq;
    if (def.q != null) filter.Q.value = def.q;
    node.connect(filter);
    node = filter;
  }
  const gain = offline.createGain();
  gain.gain.value = 0.85;
  node.connect(gain);
  gain.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

function emphasizeTransients(mono) {
  const out = new Float32Array(mono.length);
  let env = 0;
  const smooth = 0.996;
  for (let index = 0; index < mono.length; index += 1) {
    const amp = Math.abs(mono[index]);
    env = smooth * env + (1 - smooth) * amp;
    const weight = Math.min(2.2, amp / (env + 1e-5));
    out[index] = mono[index] * weight;
  }
  return out;
}

/**
 * @param {Record<string, "a" | "b" | null>} receita
 * @param {Record<"a"|"b", DonorSlot>} donors
 * @param {number} outputBpm
 */
function montarBuffer(receita, donors, outputBpm) {
  const beat = 60 / outputBpm;
  const barLen = beat * 4;
  const stepLen = barLen / STEPS;
  const duration = BARS * barLen + 0.25;
  const length = Math.ceil(duration * OUT_RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let sample = 0; sample < length; sample += 1) {
    const time = sample / OUT_RATE;
    const bar = Math.min(BARS - 1, Math.floor(time / barLen));
    const section = sectionOf(bar).id;
    const posInBar = time % barLen;
    const stepInBar = Math.min(STEPS - 1, Math.floor(posInBar / stepLen));
    const stepStart = Math.floor(time / barLen) * barLen + stepInBar * stepLen;
    const distInStep = time - stepStart;
    let sumL = 0;
    let sumR = 0;
    let active = 0;

    CHAIRS.forEach((chair) => {
      const side = receita[chair.id];
      if (!side) return;
      const donor = donors[side];
      const layer = donor.organLayers?.[chair.id];
      if (!layer?.mono?.length) return;
      const sideKey = side;
      if (!organActiveAtStep(chair.id, section, sideKey, bar, stepInBar)) return;

      const donorBpm = donor.inventario?.bpm_estimado || outputBpm;
      const layerRate = layer.rate;
      const donorDur = layer.mono.length / layerRate;
      const tSource = (time * donorBpm) / outputBpm;
      const idx = Math.floor((tSource % donorDur) * layerRate) % layer.mono.length;
      const gate = Math.cos(Math.min(1, distInStep / (stepLen * 0.92)) * (Math.PI / 2));
      if (gate < 0.04) return;

      const value = layer.mono[idx] * gate;
      sumL += value;
      sumR += value;
      active += 1;
    });

    if (active > 0) {
      const norm = 0.55 / Math.sqrt(active);
      left[sample] = sumL * norm;
      right[sample] = sumR * norm;
    }
  }

  normalizePeak(left, right, 0.92);
  return floatToStereoBuffer(left, right, OUT_RATE);
}

function normalizePeak(left, right, target) {
  let peak = 0;
  for (let index = 0; index < left.length; index += 16) {
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }
  if (peak < 1e-6) return;
  const gain = target / peak;
  for (let index = 0; index < left.length; index += 1) {
    left[index] *= gain;
    right[index] *= gain;
  }
}

function floatToStereoBuffer(left, right, rate) {
  const buffer = new AudioBuffer({ length: left.length, numberOfChannels: 2, sampleRate: rate });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
