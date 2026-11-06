import assert from "node:assert/strict";
import test from "node:test";

import { CHAIRS } from "../js/clonagem-model.js";
import { encodeWavBlob } from "../js/export-audio.js";
import { computeStft, extractElementLayers, istft } from "../js/extracao-elementos.js";

const RATE = 48000;
const BPM = 124;

/**
 * PRNG determinístico, para o ruído do hat e do clap não mudar entre execuções.
 * @param {number} seed
 * @returns {() => number} valores em [-1, 1)
 */
function ruido(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * Mix tech house sintética em estéreo: kick no tempo, baixo no contratempo,
 * hat aberto à direita, clap no 2 e 4, stab por compasso e voz sustentada.
 * @param {number} seconds
 * @returns {{ numberOfChannels: number, sampleRate: number, length: number, duration: number, getChannelData: (c: number) => Float32Array }}
 */
function mixSintetica(seconds) {
  const length = Math.round(seconds * RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const beat = 60 / BPM;
  const rand = ruido(7);
  let hpPrev = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / RATE;
    const beatPos = time % beat;
    const beatIndex = Math.floor(time / beat);
    const offPos = (time + beat / 2) % beat;
    const barPos = time % (beat * 4);
    const kickFreq = 50 + 70 * Math.exp(-beatPos / 0.03);
    const kick = 0.8 * Math.sin(2 * Math.PI * kickFreq * beatPos) * Math.exp(-beatPos / 0.15);
    const bass = 0.35 * Math.sin(2 * Math.PI * 55 * time) * Math.exp(-offPos / 0.2);
    const white = rand();
    const bright = white - hpPrev;
    hpPrev = white;
    const hat = 0.18 * bright * Math.exp(-offPos / 0.03);
    const clap = beatIndex % 2 === 1 ? 0.3 * white * Math.exp(-beatPos / 0.08) : 0;
    const stab =
      0.12 *
      (Math.sin(2 * Math.PI * 440 * time) + Math.sin(2 * Math.PI * 554.37 * time) + Math.sin(2 * Math.PI * 659.25 * time)) *
      Math.exp(-barPos / 0.35);
    const vocal = 0.1 * (Math.sin(2 * Math.PI * 330 * time) + 0.5 * Math.sin(2 * Math.PI * 990 * time));
    const center = kick + bass + vocal;
    left[index] = center + clap * 0.9 + stab * 0.7 + hat * 0.4;
    right[index] = center + clap * 0.6 + stab * 0.9 + hat * 1.0;
  }
  return {
    numberOfChannels: 2,
    sampleRate: RATE,
    length,
    duration: seconds,
    getChannelData: (channel) => (channel === 0 ? left : right),
  };
}

/**
 * @param {Float32Array} samples
 * @returns {{ peak: number, rms: number }}
 */
function medir(samples) {
  let peak = 0;
  let sumSq = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
    sumSq += value * value;
  }
  return { peak, rms: Math.sqrt(sumSq / (samples.length || 1)) };
}

/** @param {number} value */
const dbfs = (value) => 20 * Math.log10(value + 1e-12);

/**
 * Nível de quando a cadeira toca: percentil 90 do RMS em janelas de 50 ms.
 * Stem esparsa (hat, clap) tem silêncio real entre golpes, por isso o RMS global não basta.
 * @param {Float32Array} samples
 * @param {number} rate
 * @returns {number} dBFS
 */
function nivelAtivo(samples, rate) {
  const size = Math.round(rate * 0.05);
  /** @type {number[]} */
  const levels = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sumSq = 0;
    for (let index = start; index < start + size; index += 1) sumSq += samples[index] * samples[index];
    levels.push(Math.sqrt(sumSq / size));
  }
  levels.sort((a, b) => a - b);
  return dbfs(levels[Math.floor(levels.length * 0.9)] ?? 0);
}

/** Cadeiras que soam o tempo todo na mix sintética; silêncio digital nelas é defeito. */
const SUSTENTADAS = new Set(["bass", "stab", "vocal"]);

/**
 * Lê o bloco data de um WAV PCM 16 bits gerado por `encodeWavBlob`.
 * @param {Blob} blob
 * @returns {Promise<Int16Array>}
 */
async function pcmDoWav(blob) {
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(view.getUint16(34, true), 16);
  return new Int16Array(bytes.slice(44));
}

test("STFT e ISTFT sem máscara devolvem o sinal inteiro, bordas incluídas", async () => {
  const length = RATE * 2 + 333;
  const signal = new Float32Array(length);
  const rand = ruido(3);
  for (let index = 0; index < length; index += 1) signal[index] = 0.5 * rand();
  const stft = await computeStft(signal);
  const volta = await istft(stft, () => 1);
  assert.equal(volta.length, length);
  let erro = 0;
  let energia = 0;
  for (let index = 0; index < length; index += 1) {
    erro += (volta[index] - signal[index]) ** 2;
    energia += signal[index] ** 2;
  }
  assert.ok(erro / energia < 1e-6, `erro relativo ${erro / energia}`);
});

test("máscara de banda não cria picos nas bordas dos quadros", async () => {
  const length = RATE * 3;
  const signal = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    signal[index] = 0.5 * Math.sin((2 * Math.PI * 80 * index) / RATE) + 0.3 * Math.sin((2 * Math.PI * 3000 * index) / RATE);
  }
  const stft = await computeStft(signal);
  const graves = await istft(stft, (frame, bin) => (bin * RATE) / stft.nfft < 400 ? 1 : 0);
  const { peak, rms } = medir(graves.subarray(RATE / 2, length - RATE / 2));
  assert.ok(peak / rms < 1.6, `crest ${peak / rms} num seno de 80 Hz`);
  assert.ok(Math.abs(rms - 0.5 / Math.SQRT2) < 0.02, `rms ${rms}`);
});

test("faixa longa (> 90 s) gera stems audíveis, sem pico isolado e prontas para WAV", { timeout: 600_000 }, async (t) => {
  const mix = mixSintetica(96);
  const layers = await extractElementLayers(mix, { bpm: BPM, qualityMode: "fino" });
  const esperadas = ["kick", "clap", "hat", "bass", "stab", "perc", "vocal", "fx"];
  assert.deepEqual(
    CHAIRS.map((chair) => chair.id).filter((id) => layers[id]).sort(),
    esperadas.slice().sort(),
  );
  const medidas = [];
  for (const id of esperadas) {
    const layer = layers[id];
    assert.equal(layer.source, "extracao", id);
    assert.equal(layer.rate, RATE, id);
    assert.equal(layer.mono.length, mix.length, `${id} cobre a faixa inteira`);
    const { peak, rms } = medir(layer.mono);
    const pcm = await pcmDoWav(
      encodeWavBlob({
        numberOfChannels: 1,
        sampleRate: layer.rate,
        length: layer.mono.length,
        getChannelData: () => layer.mono,
      }),
    );
    let zeros = 0;
    for (let index = 0; index < pcm.length; index += 1) if (pcm[index] === 0) zeros += 1;
    const medida = { id, peak, crest: peak / rms, ativo: nivelAtivo(layer.mono, layer.rate), zeros: zeros / pcm.length };
    medidas.push(medida);
    t.diagnostic(
      `${id}: pico ${peak.toFixed(2)} · ativo ${medida.ativo.toFixed(1)} dBFS · crest ${medida.crest.toFixed(1)} · zeros ${(100 * medida.zeros).toFixed(0)}%`,
    );
  }
  for (const { id, peak, crest, ativo, zeros } of medidas) {
    assert.ok(peak <= 0.98, `${id}: pico ${peak.toFixed(3)} passaria pelo limitador do download`);
    assert.ok(ativo > -28, `${id}: nível ativo ${ativo.toFixed(1)} dBFS é inaudível`);
    assert.ok(crest < 30, `${id}: crest ${crest.toFixed(1)} indica pico isolado`);
    if (SUSTENTADAS.has(id)) assert.ok(zeros < 0.05, `${id}: ${(100 * zeros).toFixed(0)}% do WAV virou silêncio digital`);
  }
});
