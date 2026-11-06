/**
 * Montagem da track nova: stems anexados (UVR/Demucs) ou faixas filtradas da mix.
 */

import { CHAIRS } from "./clonagem-model.js";
import { buildElementInventory } from "./inventario-elementos.js";
import { extractElementLayers } from "./extracao-elementos.js";
import { mixdown, scanOverview } from "./leitura-audio-core.js";
import { bpmDaReceita, compassosEscolhidos, elementActiveAtStep, sectionOf } from "./realizacao-receptor.js";

/**
 * @typedef {{ mono: Float32Array, rate: number, source: "stem" | "filtro" | "extracao", qualidade?: number }} ElementLayer
 * @typedef {{
 *   buffer?: AudioBuffer,
 *   mono?: Float32Array,
 *   rate?: number,
 *   duration?: number,
 *   inventario?: { bpm_estimado?: number | null },
 *   stems?: Record<string, { mono: Float32Array, rate: number, name: string }>,
 *   elementLayers?: Record<string, ElementLayer>,
 *   elementLayersDirty?: boolean,
 *   extractionBase?: Record<string, ElementLayer>,
 * }} DonorSlot
 */

const STEPS = 16;
const OUT_RATE = 44100;

/**
 * @param {{
 *   nome: string,
 *   receita: Record<string, "a" | "b" | null>,
 *   donors: Record<"a"|"b", DonorSlot>,
 *   compassos?: number,
 *   onProgress?: (msg: string) => void,
 * }} input
 */
export async function montarTrackRealELer(input) {
  const onProgress = input.onProgress ?? (() => {});
  const outputBpm = bpmDaReceita(input.receita, input.donors);
  const bars = compassosEscolhidos(input.compassos);
  onProgress("Preparando faixas dos doadores…");
  await Promise.all([
    ensureElementLayers(input.donors.a, onProgress),
    ensureElementLayers(input.donors.b, onProgress),
  ]);
  const fontes = countFontesMontagem(input.receita, input.donors);
  onProgress(`Montando ${bars} compassos e mixando elementos…`);
  const buffer = await montarBuffer(input.receita, input.donors, outputBpm, bars, onProgress);
  onProgress("Medindo a track montada…");
  const mono = mixdown(buffer);
  const overview = await scanOverview(mono, buffer.sampleRate, buffer);
  const inventario = buildElementInventory({
    overview,
    mono,
    rate: buffer.sampleRate,
    duration: buffer.duration,
    canais: buffer.numberOfChannels,
  });
  inventario.arquivo = input.nome;
  const leitura = {
    tipo: "leitura-final-montagem",
    versao: 1,
    nome: input.nome,
    bpm_usado: outputBpm,
    duracao_compassos: bars,
    ciclos: bars / 16,
    mapa: "Cada ciclo: intro (4) · groove (4) · break (4) · drop (4).",
    espaco: "Kick e baixo no centro. Clap e vocal à esquerda. Hi-hat, percussão, stab e transição abertos para os lados. O baixo cede no ataque do kick.",
    duracao_segundos: Math.round(buffer.duration * 100) / 100,
    metodo: fontes.stem > 0 ? "montagem-stems-hibrida" : "montagem-faixas-filtradas",
    fontes_montagem: fontes,
    aviso:
      fontes.stem > 0
        ? `Track montada com stems anexados onde existiam; demais elementos usam filtro na mix. ${bars} compassos, cada papel no tempo da seção. O inventário foi medido neste áudio — ainda pode haver bleed; master final no LMMS com timbres seus.`
        : `Track montada só com filtros na mix (nenhum stem anexado), em ${bars} compassos. Cada elemento entra no tempo do papel. Anexe stems UVR/Demucs nos doadores para melhorar. O inventário foi medido neste áudio composto.`,
    elementos_na_receita: Object.fromEntries(
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
 * WAV por elemento da receita (track montada), prontos para LMMS/Ableton.
 * @param {{
 *   receita: Record<string, "a" | "b" | null>,
 *   donors: Record<"a"|"b", DonorSlot>,
 *   compassos?: number,
 *   onProgress?: (msg: string) => void,
 * }} input
 */
export async function renderElementStemsForEdicao(input) {
  const onProgress = input.onProgress ?? (() => {});
  const outputBpm = bpmDaReceita(input.receita, input.donors);
  const bars = compassosEscolhidos(input.compassos);
  await Promise.all([
    ensureElementLayers(input.donors.a, onProgress),
    ensureElementLayers(input.donors.b, onProgress),
  ]);
  /** @type {Record<string, AudioBuffer>} */
  const stems = {};
  for (const chair of CHAIRS) {
    if (!input.receita[chair.id]) continue;
    onProgress(`Renderizando ${chair.label} para edição…`);
    const solo = Object.fromEntries(CHAIRS.map((c) => [c.id, c.id === chair.id ? input.receita[chair.id] : null]));
    stems[chair.id] = await montarBuffer(solo, input.donors, outputBpm, bars, onProgress);
    await wait(0);
  }
  return stems;
}

/**
 * @param {DonorSlot} slot
 * @param {(msg: string) => void} onProgress
 */
async function ensureElementLayers(slot, onProgress) {
  if (!slot.buffer) throw new Error("Doador sem áudio decodificado.");
  if (!slot.elementLayers || slot.elementLayersDirty) {
    onProgress("Extraindo elementos da mix (um passe espectral)…");
    const extracted = await extractElementLayers(slot.buffer, { onProgress });
    slot.extractionBase = extracted;
    slot.elementLayers = { ...extracted };
    slot.elementLayersDirty = false;
  }
  const layers = { ...slot.elementLayers };
  for (const chair of CHAIRS) {
    const stem = slot.stems?.[chair.id];
    if (stem?.mono?.length) {
      layers[chair.id] = { mono: stem.mono, rate: stem.rate, source: "stem", qualidade: 100 };
    }
  }
  slot.elementLayers = layers;
  return layers;
}

function countFontesMontagem(receita, donors) {
  let stem = 0;
  let extracao = 0;
  let filtro = 0;
  CHAIRS.forEach((chair) => {
    const side = receita[chair.id];
    if (!side) return;
    const layer = donors[side].elementLayers?.[chair.id];
    if (!layer) return;
    if (layer.source === "stem") stem += 1;
    else if (layer.source === "extracao") extracao += 1;
    else filtro += 1;
  });
  return { stem, extracao, filtro, total: stem + extracao + filtro };
}

/**
 * @param {Record<string, "a" | "b" | null>} receita
 * @param {Record<"a"|"b", DonorSlot>} donors
 * @param {number} outputBpm
 * @param {number} bars
 * @param {(msg: string) => void} onProgress
 */
async function montarBuffer(receita, donors, outputBpm, bars, onProgress) {
  const beat = 60 / outputBpm;
  const barLen = beat * 4;
  const stepLen = barLen / STEPS;
  const duration = bars * barLen + 0.4;
  const length = Math.ceil(duration * OUT_RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const elements = activeElements(receita, donors, outputBpm, bars, stepLen);
  const kick = elements.find((item) => item.id === "kick");
  const hp = createHp();
  const chunk = 16384;

  for (let start = 0; start < length; start += chunk) {
    const end = Math.min(length, start + chunk);
    mixChunk(left, right, start, end, elements, kick ? kick.hits : null, outputBpm, hp);
    if (start > 0 && start % (chunk * 6) === 0) {
      onProgress(`Montando ${bars} compassos… ${Math.min(99, Math.round((end / length) * 100))}%`);
      await wait(0);
    }
  }

  fadeTail(left, right, Math.floor(0.02 * OUT_RATE));
  normalizePeak(left, right, 0.9);
  return floatToStereoBuffer(left, right, OUT_RATE);
}

function activeElements(receita, donors, outputBpm, bars, stepLen) {
  /** @type {Array<{ id: string, hits: number[], mono: Float32Array, rate: number, donorBpm: number, gain: number, hold: number, decay: number, panL: number, panR: number }>} */
  const elements = [];
  CHAIRS.forEach((chair) => {
    const side = receita[chair.id];
    if (!side) return;
    const layer = donors[side].elementLayers?.[chair.id];
    if (!layer?.mono?.length) return;
    const role = roleOf(chair.id);
    const pan = equalPan(role.pan);
    elements.push({
      id: chair.id,
      hits: buildHits(chair.id, side, bars, stepLen),
      mono: layer.mono,
      rate: layer.rate,
      donorBpm: donors[side].inventario?.bpm_estimado || outputBpm,
      gain: role.gain,
      hold: role.hold,
      decay: role.decay,
      panL: pan.l,
      panR: pan.r,
    });
  });
  return elements;
}

function roleOf(id) {
  switch (id) {
    case "kick":
      return { gain: 1.22, pan: 0, hold: 0.006, decay: 0.11 };
    case "clap":
      return { gain: 0.74, pan: -0.32, hold: 0.004, decay: 0.16 };
    case "hat":
      return { gain: 0.5, pan: 0.78, hold: 0.002, decay: 0.055 };
    case "bass":
      return { gain: 0.92, pan: 0, hold: 0.04, decay: 0.28 };
    case "stab":
      return { gain: 0.5, pan: 0.58, hold: 0.03, decay: 0.42 };
    case "fx":
      return { gain: 0.34, pan: 0.82, hold: 0.12, decay: 1.5 };
    case "perc":
      return { gain: 0.42, pan: -0.62, hold: 0.002, decay: 0.07 };
    case "vocal":
      return { gain: 0.42, pan: -0.4, hold: 0.05, decay: 0.4 };
    default: {
      const unknown = id;
      throw new Error(unknown);
    }
  }
}

function equalPan(pan) {
  const clamped = Math.max(-1, Math.min(1, pan));
  const angle = ((clamped + 1) / 2) * (Math.PI / 2);
  return { l: Math.cos(angle), r: Math.sin(angle) };
}

function buildHits(chairId, side, bars, stepLen) {
  const hits = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const section = sectionOf(bar).id;
    for (let step = 0; step < STEPS; step += 1) {
      if (elementActiveAtStep(chairId, section, side, bar, step)) hits.push((bar * STEPS + step) * stepLen);
    }
  }
  return hits;
}

function mixChunk(left, right, start, end, elements, kickHits, outputBpm, hp) {
  for (let sample = start; sample < end; sample += 1) {
    const time = sample / OUT_RATE;
    const duck = kickHits ? kickDuck(distanceToLast(kickHits, time)) : 1;
    let sumL = 0;
    let sumR = 0;
    for (let index = 0; index < elements.length; index += 1) {
      const item = elements[index];
      const dist = distanceToLast(item.hits, time);
      if (dist == null) continue;
      let amp = elementEnvelope(item, dist);
      if (amp < 0.004) continue;
      if (item.id === "bass") amp *= duck;
      else if (item.id === "stab") amp *= 0.75 + 0.25 * duck;
      const value = readLoop(item.mono, item.rate, (time * item.donorBpm) / outputBpm) * item.gain * amp;
      sumL += value * item.panL;
      sumR += value * item.panR;
    }
    left[sample] = highpass(sumL, hp, "l");
    right[sample] = highpass(sumR, hp, "r");
  }
}

function elementEnvelope(item, dist) {
  const attack = 0.003;
  let amp = dist < attack ? dist / attack : 1;
  if (dist <= item.hold) return amp;
  return amp * Math.exp(-(dist - item.hold) / item.decay);
}

function kickDuck(dist) {
  if (dist == null) return 1;
  const window = 0.1;
  if (dist >= window) return 1;
  const t = dist / window;
  return 0.35 + 0.65 * t * t;
}

function distanceToLast(hits, time) {
  let lo = 0;
  let hi = hits.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] <= time + 1e-8) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  return time - hits[found];
}

function readLoop(mono, rate, tSource) {
  const dur = mono.length / rate;
  if (dur <= 0) return 0;
  let t = tSource % dur;
  if (t < 0) t += dur;
  const pos = t * rate;
  const i0 = Math.floor(pos) % mono.length;
  const frac = pos - Math.floor(pos);
  const i1 = (i0 + 1) % mono.length;
  return mono[i0] * (1 - frac) + mono[i1] * frac;
}

function createHp() {
  return { r: Math.exp((-2 * Math.PI * 30) / OUT_RATE), xL: 0, yL: 0, xR: 0, yR: 0 };
}

function highpass(sample, hp, channel) {
  if (channel === "l") {
    const y = sample - hp.xL + hp.r * hp.yL;
    hp.xL = sample;
    hp.yL = y;
    return y;
  }
  if (channel === "r") {
    const y = sample - hp.xR + hp.r * hp.yR;
    hp.xR = sample;
    hp.yR = y;
    return y;
  }
  throw new Error(channel);
}

function fadeTail(left, right, samples) {
  const n = Math.min(samples, left.length);
  const start = left.length - n;
  for (let index = 0; index < n; index += 1) {
    const gain = 1 - index / n;
    left[start + index] *= gain;
    right[start + index] *= gain;
  }
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
