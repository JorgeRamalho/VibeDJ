/** Filtros na mix (fallback quando a extração STFT falha). */

import { mixdown } from "./leitura-audio-core.js";

export const ORGAN_FILTERS = {
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

export async function filterElementBuffer(buffer, elementId) {
  const chain = ORGAN_FILTERS[elementId];
  if (!chain) throw new Error(elementId);
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

export function emphasizeTransients(mono) {
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

export { mixdown };
