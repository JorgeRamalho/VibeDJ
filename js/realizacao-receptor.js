/**
 * Realização audível da track nova: ciclos de 16 compassos sintetizados a partir da receita.
 * O som é original (não usa samples das doadoras). A leitura mede esse áudio.
 */

import { CHAIRS } from "./clonagem-model.js";
import { buildElementInventory } from "./inventario-elementos.js";
import { mixdown, scanOverview } from "./leitura-audio-core.js";

const FORM_BARS = 16;
const STEPS = 16;

/** @param {unknown} value */
export function compassosEscolhidos(value) {
  const bars = Number(value);
  if (bars === 32 || bars === 64) return bars;
  return FORM_BARS;
}

const SECTIONS = [
  { id: "intro", start: 0, bars: 4 },
  { id: "groove", start: 4, bars: 4 },
  { id: "break", start: 8, bars: 4 },
  { id: "drop", start: 12, bars: 4 },
];

/**
 * @param {Record<string, "a" | "b" | null>} receita
 * @param {{ a: { inventario?: { bpm_estimado?: number | null } }, b: { inventario?: { bpm_estimado?: number | null } } }} donors
 */
export function bpmDaReceita(receita, donors) {
  const sides = new Set();
  CHAIRS.forEach((chair) => {
    const side = receita[chair.id];
    if (side) sides.add(side);
  });
  const picked = [...sides]
    .map((side) => donors[side]?.inventario?.bpm_estimado)
    .filter((bpm) => typeof bpm === "number" && bpm > 0);
  const pool = picked.length
    ? picked
    : [donors.a, donors.b]
      .map((slot) => slot?.inventario?.bpm_estimado)
      .filter((bpm) => typeof bpm === "number" && bpm > 0);
  if (!pool.length) return 124;
  const mean = pool.reduce((sum, bpm) => sum + bpm, 0) / pool.length;
  return Math.round(mean);
}

/**
 * @param {{
 *   nome: string,
 *   receita: Record<string, "a" | "b" | null>,
 *   donors: { a: { inventario?: { bpm_estimado?: number | null } }, b: { inventario?: { bpm_estimado?: number | null } } },
 * }} input
 */
export async function realizarELer(input) {
  const bpm = bpmDaReceita(input.receita, input.donors);
  const bars = compassosEscolhidos(input.compassos);
  const buffer = await renderTrack(input.receita, bpm, bars);
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
    tipo: "leitura-final-receptor",
    versao: 1,
    nome: input.nome,
    bpm_usado: bpm,
    duracao_compassos: bars,
    ciclos: bars / FORM_BARS,
    mapa: "Cada ciclo: intro (4) · groove (4) · break (4) · drop (4).",
    duracao_segundos: Math.round(buffer.duration * 100) / 100,
    aviso:
      "Áudio novo, sintetizado neste navegador a partir da receita (quais elementos entraram e se vieram de A ou de B). Não contém trechos das mixes doadoras. O inventário abaixo foi medido nesse áudio.",
    elementos_na_receita: Object.fromEntries(
      CHAIRS.map((chair) => [chair.id, input.receita[chair.id] ? (input.receita[chair.id] === "a" ? "doador_a" : "doador_b") : "vazio"]),
    ),
    inventario,
  };
  return { buffer, leitura };
}

/**
 * @param {Record<string, "a" | "b" | null>} receita
 * @param {number} bpm
 */
async function renderTrack(receita, bpm, bars) {
  const step = 60 / bpm / 4;
  const seconds = bars * STEPS * step + 1.2;
  const rate = 44100;
  const offline = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const master = offline.createGain();
  const comp = offline.createDynamicsCompressor();
  master.gain.value = 0.5;
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.14;
  master.connect(comp);
  comp.connect(offline.destination);
  const noise = offline.createBuffer(1, rate, rate);
  const noiseData = noise.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = Math.random() * 2 - 1;
  const audio = { ctx: offline, master, noise };

  for (let bar = 0; bar < bars; bar += 1) {
    const section = sectionOf(bar);
    for (let stepIndex = 0; stepIndex < STEPS; stepIndex += 1) {
      const time = (bar * STEPS + stepIndex) * step;
      CHAIRS.forEach((chair) => {
        const side = receita[chair.id];
        if (!side) return;
        if (!plays(chair.id, section.id, side, bar, stepIndex)) return;
        trigger(audio, chair.id, voiceFor(chair.id, side), time, stepIndex, bar, step);
      });
    }
  }
  return offline.startRendering();
}

function sectionOf(bar) {
  const local = ((bar % FORM_BARS) + FORM_BARS) % FORM_BARS;
  const found = SECTIONS.find((section) => local >= section.start && local < section.start + section.bars);
  if (!found) throw new Error("Compasso fora do mapa");
  return found;
}

export { sectionOf, SECTIONS };

/**
 * @param {string} chairId
 * @param {"a" | "b"} side
 */
function voiceFor(chairId, side) {
  switch (chairId) {
    case "kick":
      return side === "a" ? "longo" : "curto";
    case "clap":
      return side === "a" ? "palma" : "snap";
    case "hat":
      return side === "a" ? "fechado" : "aberto";
    case "bass":
      return side === "a" ? "offbeat" : "walking";
    case "stab":
      return side === "a" ? "menor" : "suspenso";
    case "fx":
      return side === "a" ? "riser" : "impact";
    case "perc":
      return side === "a" ? "shaker" : "rim";
    case "vocal":
      return side === "a" ? "grave" : "agudo";
    default: {
      const unknown = chairId;
      throw new Error(unknown);
    }
  }
}

function plays(chairId, sectionId, side, bar, step) {
  return elementActiveAtStep(chairId, sectionId, side, bar, step);
}

/** Grade rítmica compartilhada (síntese e montagem). */
export function elementActiveAtStep(chairId, sectionId, side, bar, step) {
  if (!inSection(chairId, sectionId)) return false;
  if (chairId === "fx") return fxDue(voiceFor(chairId, side), bar, step);
  return stepsFor(chairId, voiceFor(chairId, side)).includes(step);
}

function inSection(chairId, sectionId) {
  switch (sectionId) {
    case "intro":
      return chairId === "kick" || chairId === "hat";
    case "groove":
      return chairId === "kick" || chairId === "clap" || chairId === "hat" || chairId === "bass" || chairId === "perc";
    case "break":
      return chairId === "hat" || chairId === "stab" || chairId === "fx" || chairId === "vocal";
    case "drop":
      return true;
    default: {
      const unknown = sectionId;
      throw new Error(unknown);
    }
  }
}

function fxDue(voice, bar, step) {
  const local = ((bar % FORM_BARS) + FORM_BARS) % FORM_BARS;
  switch (voice) {
    case "riser":
      return local === 10 && step === 0;
    case "impact":
      return local === 12 && step === 0;
    default: {
      const unknown = voice;
      throw new Error(unknown);
    }
  }
}

function stepsFor(chairId, voice) {
  switch (chairId) {
    case "kick":
      return [0, 4, 8, 12];
    case "clap":
      return [4, 12];
    case "hat":
      return [2, 6, 10, 14];
    case "bass":
      if (voice === "offbeat") return [6, 14];
      if (voice === "walking") return [0, 4, 8, 12];
      return [0, 8];
    case "stab":
      return [0];
    case "fx":
      return [];
    case "perc":
      return voice === "rim" ? [4, 12] : [2, 6, 10, 14];
    case "vocal":
      return [0, 8];
    default: {
      const unknown = chairId;
      throw new Error(unknown);
    }
  }
}

function trigger(audio, chairId, voice, time, step, bar, stepSec) {
  const when = chairId === "hat" && voice === "aberto" && (step === 6 || step === 14) ? time + stepSec * 0.12 : time;
  switch (chairId) {
    case "kick":
      tone(audio, voice === "longo" ? 98 : 156, 46, when, voice === "longo" ? 0.42 : 0.12, "sine", voice === "curto" ? 0.9 : 0.95);
      burst(audio, when, 0.02, 1800, "highpass", 0.16);
      break;
    case "clap":
      if (voice === "palma") burst(audio, when, 0.18, 900, "bandpass", 0.32);
      else burst(audio, when, 0.05, 3200, "highpass", 0.24);
      break;
    case "hat":
      burst(audio, when, voice === "aberto" ? 0.14 : 0.03, voice === "aberto" ? 6200 : 8400, "highpass", voice === "aberto" ? 0.12 : 0.08);
      break;
    case "bass":
      tone(audio, bassFreq(voice, step), bassFreq(voice, step), when, voice === "offbeat" ? 0.16 : 0.2, voice === "walking" ? "triangle" : "sine", 0.26);
      break;
    case "stab": {
      const chord = voice === "suspenso" ? [220, 293.66, 329.63] : [220, 261.63, 329.63];
      chord.forEach((freq) => tone(audio, freq, freq, when, 0.26, "triangle", 0.06));
      break;
    }
    case "fx":
      if (voice === "riser") sweep(audio, when, stepSec * 32, 400, 4200, 0.08);
      else burst(audio, when, 0.32, 240, "lowpass", 0.34);
      break;
    case "perc":
      burst(audio, when, voice === "rim" ? 0.04 : 0.06, voice === "rim" ? 1400 : 5000, voice === "rim" ? "bandpass" : "highpass", 0.1);
      break;
    case "vocal":
      tone(audio, voice === "grave" ? 196 : 392, voice === "grave" ? 180 : 360, when, 0.18, "triangle", 0.08);
      break;
    default: {
      const unknown = chairId;
      throw new Error(unknown);
    }
  }
}

function bassFreq(voice, step) {
  if (voice === "walking") {
    if (step === 4) return 65.41;
    if (step === 8) return 82.41;
    if (step === 12) return 49;
    return 55;
  }
  if (voice === "offbeat" && step === 14) return 41.2;
  return 55;
}

function tone(audio, from, to, time, duration, type, amount) {
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, time);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), time + Math.min(0.08, duration));
  gain.gain.setValueAtTime(amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function burst(audio, time, duration, frequency, type, amount) {
  const source = audio.ctx.createBufferSource();
  const filter = audio.ctx.createBiquadFilter();
  const gain = audio.ctx.createGain();
  source.buffer = audio.noise;
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, time);
  filter.Q.value = type === "bandpass" ? 0.8 : 0.7;
  gain.gain.setValueAtTime(amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(time);
  source.stop(time + duration + 0.02);
}

function sweep(audio, time, duration, from, to, amount) {
  const source = audio.ctx.createBufferSource();
  const filter = audio.ctx.createBiquadFilter();
  const gain = audio.ctx.createGain();
  source.buffer = audio.noise;
  source.loop = true;
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(from, time);
  filter.frequency.exponentialRampToValueAtTime(to, time + duration);
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(amount, time + duration * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(time);
  source.stop(time + duration + 0.02);
}
