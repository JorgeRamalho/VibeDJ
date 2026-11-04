/** Visão rápida de áudio (BPM, faixas, estéreo) — leitura e transplante. */

export const ACCEPT = "audio/*,.mp3,.wav,.wave,.flac,.ogg,.oga,.m4a,.aac,.aiff,.aif,.webm";
export const MAX_BYTES = 80 * 1024 * 1024;

const BANDS = [
  { id: "sub", lo: 20, hi: 90 },
  { id: "grave", lo: 90, hi: 220 },
  { id: "corpo", lo: 220, hi: 900 },
  { id: "presenca", lo: 900, hi: 4500 },
  { id: "ar", lo: 4500, hi: 24000 },
];

const NFFT = 2048;

export function mixdown(buffer) {
  const mono = new Float32Array(buffer.length);
  const channels = buffer.numberOfChannels;
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / channels;
  }
  return mono;
}

export function stereoSide(buffer) {
  if (buffer.numberOfChannels < 2) return 0;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let mid = 0;
  let side = 0;
  for (let index = 0; index < left.length; index += 16) {
    const center = 0.5 * (left[index] + right[index]);
    const width = 0.5 * (left[index] - right[index]);
    mid += center * center;
    side += width * width;
  }
  return side / (mid + side + 1e-12);
}

export function estimateBpm(mono, rate) {
  const hop = 512;
  const limit = Math.min(mono.length, rate * 45);
  const env = [];
  let previous = 0;
  for (let index = 0; index + hop < limit; index += hop) {
    let energy = 0;
    for (let sample = 0; sample < hop; sample += 4) {
      const value = mono[index + sample];
      energy += value * value;
    }
    env.push(Math.max(0, energy - previous));
    previous = energy;
  }
  if (env.length < 8) return { bpm: 0, note: "Trecho curto demais para o andamento." };
  const frameRate = rate / hop;
  let best = { bpm: 0, score: 0 };
  for (let bpm = 80; bpm <= 180; bpm += 0.5) {
    const lag = Math.round((frameRate * 60) / bpm);
    if (lag < 1 || lag >= env.length) continue;
    let score = 0;
    let count = 0;
    for (let index = 0; index + lag < env.length; index += 2) {
      score += env[index] * env[index + lag];
      count += 1;
    }
    score /= count || 1;
    if (score > best.score) best = { bpm, score };
  }
  let chosen = best.bpm;
  let note = "Estimativa pelo pulso dos ataques.";
  if (chosen > 145) {
    const halfLag = Math.round((frameRate * 60) / (chosen / 2));
    if (halfLag >= 1 && halfLag < env.length) {
      let halfScore = 0;
      let count = 0;
      for (let index = 0; index + halfLag < env.length; index += 2) {
        halfScore += env[index] * env[index + halfLag];
        count += 1;
      }
      halfScore /= count || 1;
      if (halfScore > best.score * 0.82) {
        chosen /= 2;
        note = "Pulso lido na metade do dobro — comum em tech house.";
      }
    }
  }
  return { bpm: chosen, note };
}

export async function decodeAudioFile(file, audioContext) {
  if (file.size > MAX_BYTES) {
    throw new Error(`Limite ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
  }
  const bytes = await file.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(bytes.slice(0));
  const mono = mixdown(buffer);
  return { buffer, mono, duration: buffer.duration, name: file.name, rate: buffer.sampleRate };
}

export async function scanOverview(mono, rate, audio) {
  const cols = 120;
  const bandEnergy = BANDS.map(() => 0);
  let magSum = 0;
  let centroidSum = 0;
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const window = hann(NFFT);
  const usable = Math.max(0, mono.length - NFFT);
  for (let col = 0; col < cols; col += 1) {
    const start = usable ? Math.floor((col / cols) * usable) : 0;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < NFFT; i += 1) re[i] = (mono[start + i] || 0) * window[i];
    fft(re, im);
    for (let bin = 1; bin < NFFT / 2; bin += 1) {
      const mag = Math.hypot(re[bin], im[bin]);
      const freq = (bin * rate) / NFFT;
      magSum += mag;
      centroidSum += freq * mag;
      const band = BANDS.findIndex((item) => freq >= item.lo && freq < item.hi);
      if (band >= 0) bandEnergy[band] += mag;
    }
    if (col % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const total = bandEnergy.reduce((s, v) => s + v, 0) || 1;
  const bands = BANDS.map((band, index) => ({
    id: band.id,
    label: band.id,
    share: bandEnergy[index] / total,
  }));
  const bpm = estimateBpm(mono, rate);
  return {
    bpm: bpm.bpm,
    note: bpm.note,
    centroid: magSum ? centroidSum / magSum : 0,
    bands,
    side: stereoSide(audio),
  };
}

function hann(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}

function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}
