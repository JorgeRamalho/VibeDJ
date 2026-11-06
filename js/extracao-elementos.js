/**
 * Extração de elementos (cadeiras) em um passe STFT + HPSS.
 * Estimativas de mix para montagem e edição — não substitui stems UVR/Demucs.
 */

import { CHAIRS } from "./clonagem-model.js";
import { mixdown } from "./leitura-audio-core.js";

const NFFT = 2048;
const HOP_DENSE = 1024;
const HOP_FAST = 2048;
const ANALISE_MAX_SEC = 240;

/** @typedef {{ mono: Float32Array, rate: number, source: "extracao" | "filtro" | "stem", qualidade: number, stemName?: string }} ElementLayer */

/**
 * @param {AudioBuffer} buffer
 * @param {{ onProgress?: (msg: string) => void, job?: { id: number }, bpm?: number, qualityMode?: "fino" | "rapido" }} [options]
 * @returns {Promise<Record<string, ElementLayer>>}
 */
export async function extractElementLayers(buffer, options = {}) {
  const onProgress = options.onProgress ?? (() => {});
  const rate = buffer.sampleRate;
  const monoFull = mixdown(buffer);
  const sideCurve = stereoSideCurve(buffer, monoFull.length);
  const hop = monoFull.length > rate * 90 ? HOP_FAST : HOP_DENSE;
  const maxSamples = Math.min(monoFull.length, Math.floor(rate * ANALISE_MAX_SEC));
  const mono = monoFull.subarray(0, maxSamples);

  onProgress("Analisando espectro (ataque × harmonia)…");
  const stft = await computeStft(mono, hop, options.job?.id ?? 0, () => {});
  if (!stft) return fallbackFilters(buffer, onProgress);

  const qualityFino = options.qualityMode !== "rapido";
  onProgress(qualityFino ? "Separando papéis (HPSS fino + pulso)…" : "Separando papéis por faixa e pulso…");
  let masks = await harmonicMasks(stft, qualityFino ? 10 : 8);
  if (!masks) return fallbackFilters(buffer, onProgress);
  if (qualityFino) {
    masks = await refineHarmonicMasks(stft, masks);
  }
  const beatPulse =
    qualityFino && options.bpm && options.bpm > 40 && options.bpm < 220
      ? beatPulseCurve(stft, options.bpm, rate)
      : null;

  /** @type {Record<string, ElementLayer>} */
  const layers = {};
  for (let index = 0; index < CHAIRS.length; index += 1) {
    const chair = CHAIRS[index];
    onProgress(`Extraindo ${chair.label}…`);
    const maskFn = elementMask(chair.id, rate, masks, sideCurve, stft, beatPulse);
    const samples = await istft(stft, maskFn, options.job?.id ?? 0);
    if (!samples) continue;
    let monoLayer = normalizePeak(samples, 0.92);
    if (TRANSIENT_CHAIRS.has(chair.id)) monoLayer = emphasizeTransients(monoLayer);
    const qualidade = scoreLayer(monoLayer, masks);
    layers[chair.id] = { mono: monoLayer, rate, source: "extracao", qualidade };
    await wait(0);
  }

  if (layers.kick?.mono && layers.bass?.mono && qualityFino) {
    layers.bass.mono = subtractBleed(layers.bass.mono, layers.kick.mono, 0.28);
    layers.bass.qualidade = Math.min(97, (layers.bass.qualidade || 60) + 3);
  }

  if (maxSamples < monoFull.length) {
    onProgress("Faixa longa: camadas extraídas do trecho central (até 4 min). Stems UVR/Demucs dão precisão no arquivo inteiro.");
  }
  return layers;
}

const TRANSIENT_CHAIRS = new Set(["kick", "clap", "hat", "perc"]);

function elementMask(chairId, rate, masks, sideCurve, stft, beatPulse) {
  const bins = masks.bins;
  return (frame, bin) => {
    const freq = binFreq(bin, stft.nfft, rate);
    const h = masks.harmonic[frame * bins + binIndex(bin, stft.nfft)];
    const p = 1 - h;
    const side = sideCurve[Math.min(sideCurve.length - 1, Math.floor((frame * stft.hop) / 2048))] ?? 0;
    const pulse = beatPulse ? 0.55 + 0.45 * (beatPulse[frame] ?? 0) : 1;
    switch (chairId) {
      case "kick":
        return bandGain(freq, 35, 115, rate) * (0.72 * p + 0.28 * h) * (1 - side * 0.35) * pulse;
      case "clap":
        return bandGain(freq, 700, 3800, rate) * (0.88 * p + 0.12 * h) * (0.85 + side * 0.15);
      case "hat":
        return bandGain(freq, 5200, 16000, rate) * (0.82 * p + 0.18 * h) * (0.55 + side * 0.55);
      case "bass":
        return bandGain(freq, 52, 240, rate) * (0.78 * h + 0.22 * p) * (1 - side * 0.25);
      case "stab":
        return bandGain(freq, 180, 2200, rate) * (0.84 * h + 0.16 * p) * (0.7 + side * 0.25);
      case "fx":
        return bandGain(freq, 1200, 14000, rate) * (0.45 * h + 0.55 * p) * (0.4 + side * 0.65);
      case "perc":
        return bandGain(freq, 900, 6500, rate) * (0.86 * p + 0.14 * h) * (0.5 + side * 0.45);
      case "vocal":
        return bandGain(freq, 280, 4200, rate) * (0.8 * h + 0.2 * p) * (1 - side * 0.55);
      default:
        return 0;
    }
  };
}

function scoreLayer(mono, masks) {
  let peak = 0;
  let sumSq = 0;
  let active = 0;
  const hop = 64;
  let n = 0;
  for (let i = 0; i < mono.length; i += hop) {
    const value = Math.abs(mono[i]);
    peak = Math.max(peak, value);
    sumSq += value * value;
    if (value > 0.03) active += 1;
    n += 1;
  }
  if (peak < 8e-4) return 14;
  const rms = Math.sqrt(sumSq / (n || 1));
  const occupancy = active / (n || 1);
  const peakPart = clamp(peak / 0.92, 0, 1);
  const rmsPart = clamp(rms / 0.2, 0, 1);
  const occPart = clamp(occupancy / 0.32, 0, 1);
  const mixScore = 0.5 * peakPart + 0.3 * rmsPart + 0.2 * occPart;
  const roleBoost = masks.meanHarmonic != null ? 1 : 0.9;
  return Math.round(clamp((0.58 + 0.4 * mixScore) * roleBoost, 0.58, 0.97) * 100);
}

function stereoSideCurve(buffer, monoLength) {
  if (buffer.numberOfChannels < 2) return new Float32Array(0);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const hop = 2048;
  const frames = Math.ceil(monoLength / hop);
  const curve = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * hop;
    let mid = 0;
    let side = 0;
    const end = Math.min(left.length, start + hop);
    for (let i = start; i < end; i += 8) {
      const center = 0.5 * (left[i] + right[i]);
      const width = 0.5 * (left[i] - right[i]);
      mid += center * center;
      side += width * width;
    }
    curve[frame] = side / (mid + side + 1e-12);
  }
  return curve;
}

async function fallbackFilters(buffer, onProgress) {
  const { filterElementBuffer, emphasizeTransients: emph, mixdown: md } = await import("./montagem-receptor-filters.js");
  /** @type {Record<string, ElementLayer>} */
  const layers = {};
  for (const chair of CHAIRS) {
    onProgress(`Filtro rápido: ${chair.label}…`);
    const filtered = await filterElementBuffer(buffer, chair.id);
    let mono = md(filtered);
    if (TRANSIENT_CHAIRS.has(chair.id)) mono = emph(mono);
    layers[chair.id] = { mono, rate: buffer.sampleRate, source: "filtro", qualidade: 38 };
    await wait(0);
  }
  return layers;
}

export function layerSourceLabel(layer) {
  if (!layer) return "—";
  switch (layer.source) {
    case "extracao":
      return `Extração ${layer.qualidade ?? 0}%`;
    case "filtro":
      return "Filtro na mix";
    case "stem":
      return "Stem anexado";
    default:
      return layer.source ?? "—";
  }
}

async function computeStft(mono, hop, jobId, onRatio) {
  const window = hann(NFFT);
  const frames = Math.floor((mono.length - NFFT) / hop) + 1;
  if (frames < 2) return null;
  const re = new Float32Array(frames * NFFT);
  const im = new Float32Array(frames * NFFT);
  const frameRe = new Float32Array(NFFT);
  const frameIm = new Float32Array(NFFT);
  for (let frame = 0; frame < frames; frame += 1) {
    frameRe.fill(0);
    frameIm.fill(0);
    const offset = frame * hop;
    for (let index = 0; index < NFFT; index += 1) frameRe[index] = (mono[offset + index] || 0) * window[index];
    fft(frameRe, frameIm);
    re.set(frameRe, frame * NFFT);
    im.set(frameIm, frame * NFFT);
    if (frame % 24 === 0) {
      onRatio(frame / frames);
      await wait(0);
    }
  }
  return { re, im, frames, nfft: NFFT, hop, window, length: mono.length };
}

async function refineHarmonicMasks(stft, masks) {
  const bins = masks.bins;
  const refined = new Float32Array(masks.harmonic.length);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      let sum = 0;
      let count = 0;
      for (let df = -2; df <= 2; df += 1) {
        const b = clamp(bin + df, 0, bins - 1);
        sum += masks.harmonic[frame * bins + b];
        count += 1;
      }
      const smooth = sum / count;
      const index = frame * bins + bin;
      refined[index] = 0.62 * masks.harmonic[index] + 0.38 * smooth;
    }
    if (frame % 28 === 0) await wait(0);
  }
  return { ...masks, harmonic: refined };
}

function beatPulseCurve(stft, bpm, rate) {
  const secPerBeat = 60 / bpm;
  const curve = new Float32Array(stft.frames);
  const sigma = Math.max(0.012, secPerBeat * 0.08);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    const time = (frame * stft.hop) / rate;
    const phase = (time / secPerBeat) % 1;
    const dist = Math.min(phase, 1 - phase) * secPerBeat;
    curve[frame] = Math.exp(-(dist * dist) / (2 * sigma * sigma));
  }
  return curve;
}

function subtractBleed(target, source, amount) {
  const out = new Float32Array(target.length);
  for (let index = 0; index < target.length; index += 1) {
    out[index] = target[index] - amount * source[index];
  }
  return normalizePeak(out, 0.9);
}

async function harmonicMasks(stft, radius = 8) {
  const bins = stft.nfft / 2 + 1;
  const mag = new Float32Array(stft.frames * bins);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      const index = frame * stft.nfft + bin;
      mag[frame * bins + bin] = Math.hypot(stft.re[index], stft.im[index]);
    }
  }
  const harmonicMedian = new Float32Array(mag.length);
  const percussiveMedian = new Float32Array(mag.length);
  const scratch = new Float32Array(radius * 2 + 1);
  for (let bin = 0; bin < bins; bin += 1) {
    for (let frame = 0; frame < stft.frames; frame += 1) {
      let count = 0;
      for (let time = frame - radius; time <= frame + radius; time += 1) {
        const clamped = clamp(time, 0, stft.frames - 1);
        scratch[count] = mag[clamped * bins + bin];
        count += 1;
      }
      harmonicMedian[frame * bins + bin] = medianInPlace(scratch, count);
    }
    if (bin % 48 === 0) await wait(0);
  }
  for (let frame = 0; frame < stft.frames; frame += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      let count = 0;
      for (let freq = bin - radius; freq <= bin + radius; freq += 1) {
        const clamped = clamp(freq, 0, bins - 1);
        scratch[count] = mag[frame * bins + clamped];
        count += 1;
      }
      percussiveMedian[frame * bins + bin] = medianInPlace(scratch, count);
    }
    if (frame % 32 === 0) await wait(0);
  }
  const harmonic = new Float32Array(mag.length);
  let hSum = 0;
  for (let index = 0; index < mag.length; index += 1) {
    const tone = harmonicMedian[index] * harmonicMedian[index];
    const hit = percussiveMedian[index] * percussiveMedian[index];
    harmonic[index] = tone / (tone + hit + 1e-12);
    hSum += harmonic[index];
  }
  return { harmonic, bins, meanHarmonic: hSum / (mag.length || 1) };
}

async function istft(stft, maskAt, jobId) {
  const out = new Float32Array(stft.length);
  const norm = new Float32Array(stft.length);
  const re = new Float32Array(stft.nfft);
  const im = new Float32Array(stft.nfft);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    for (let bin = 0; bin < stft.nfft; bin += 1) {
      const mask = maskAt(frame, bin);
      const index = frame * stft.nfft + bin;
      re[bin] = stft.re[index] * mask;
      im[bin] = stft.im[index] * mask;
    }
    ifft(re, im);
    const offset = frame * stft.hop;
    for (let index = 0; index < stft.nfft; index += 1) {
      if (offset + index >= out.length) break;
      out[offset + index] += re[index] * stft.window[index];
      norm[offset + index] += stft.window[index] * stft.window[index];
    }
    if (frame % 18 === 0) await wait(0);
  }
  for (let index = 0; index < out.length; index += 1) {
    if (norm[index] > 1e-8) out[index] /= norm[index];
  }
  return out;
}

function binIndex(bin, nfft) {
  return bin < nfft / 2 + 1 ? bin : nfft - bin;
}

function binFreq(bin, nfft, rate) {
  const capped = bin > nfft / 2 ? nfft - bin : bin;
  return (capped * rate) / nfft;
}

function bandGain(freq, lo, hi, rate) {
  const nyquist = rate / 2;
  if (freq < lo || freq > Math.min(hi, nyquist)) return 0;
  const edge = Math.min(lo * 0.35, 80);
  if (freq < lo + edge) return (freq - lo + edge) / (edge * 2);
  if (freq > hi - edge) return (hi + edge - freq) / (edge * 2);
  return 1;
}

function normalizePeak(samples, target) {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 16) peak = Math.max(peak, Math.abs(samples[index]));
  if (peak < 1e-8) return samples;
  const gain = target / peak;
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) out[index] = samples[index] * gain;
  return out;
}

function emphasizeTransients(mono) {
  const out = new Float32Array(mono.length);
  let env = 0;
  const smooth = 0.996;
  for (let index = 0; index < mono.length; index += 1) {
    const amp = Math.abs(mono[index]);
    env = smooth * env + (1 - smooth) * amp;
    const weight = Math.min(2.4, amp / (env + 1e-5));
    out[index] = mono[index] * weight;
  }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >>> 1;
    for (; j & bit; bit >>>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(angle);
    const wlenIm = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const even = i + k;
        const odd = even + half;
        const vRe = re[odd] * wRe - im[odd] * wIm;
        const vIm = re[odd] * wIm + im[odd] * wRe;
        re[odd] = re[even] - vRe;
        im[odd] = im[even] - vIm;
        re[even] += vRe;
        im[even] += vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function ifft(re, im) {
  const n = re.length;
  for (let index = 0; index < n; index += 1) im[index] = -im[index];
  fft(re, im);
  for (let index = 0; index < n; index += 1) {
    re[index] /= n;
    im[index] = -im[index] / n;
  }
}

function hann(n) {
  const window = new Float32Array(n);
  for (let index = 0; index < n; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (n - 1)));
  }
  return window;
}

function medianInPlace(values, count) {
  for (let index = 1; index < count; index += 1) {
    const value = values[index];
    let cursor = index - 1;
    while (cursor >= 0 && values[cursor] > value) {
      values[cursor + 1] = values[cursor];
      cursor -= 1;
    }
    values[cursor + 1] = value;
  }
  return values[(count - 1) >> 1];
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
