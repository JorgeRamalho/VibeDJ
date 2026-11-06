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
  if (env.length < 8) return { bpm: 0, note: "Trecho curto demais para o andamento.", confianca: 0 };
  const frameRate = rate / hop;
  let best = { bpm: 0, score: 0 };
  let second = 0;
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
    const far = Math.abs(bpm - best.bpm) > 4;
    if (score > best.score) {
      if (far) second = best.score;
      best = { bpm, score };
    } else if (far && score > second) second = score;
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
  const confianca = best.score > 0 ? clamp01(1 - second / best.score) : 0;
  return { bpm: chosen, note, confianca };
}

const PERFIL_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOME_MENOR = ["Dó menor", "Dó# menor", "Ré menor", "Mi♭ menor", "Mi menor", "Fá menor", "Fá# menor", "Sol menor", "Sol# menor", "Lá menor", "Si♭ menor", "Si menor"];
const NOME_MAIOR = ["Dó maior", "Ré♭ maior", "Ré maior", "Mi♭ maior", "Mi maior", "Fá maior", "Fá# maior", "Sol maior", "Lá♭ maior", "Lá maior", "Si♭ maior", "Si maior"];
const CAMELOT_MENOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];
const CAMELOT_MAIOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];

/**
 * Estima tonalidade, código Camelot e a divisão entre ataque e harmonia.
 * O grave pesa mais na tônica, porque em tech house a raiz costuma estar no baixo.
 * @param {Float32Array} mono Sinal já somado para um canal.
 * @param {number} rate Taxa de amostragem em Hz.
 * @returns {{
 *   tonalidade: { nome: string, modo: "menor" | "maior", camelot: string, confianca: number },
 *   ataque: number,
 *   harmonia: number,
 * }}
 */
export function medirTonalidadeETextura(mono, rate) {
  const chroma = new Float64Array(12);
  const grave = new Float64Array(12);
  let flux = 0;
  let estavel = 0;
  const frames = 96;
  const usable = Math.max(0, mono.length - NFFT);
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const window = hann(NFFT);
  let anterior = null;
  for (let frame = 0; frame < frames; frame += 1) {
    const start = usable ? Math.floor((frame / frames) * usable) : 0;
    re.fill(0);
    im.fill(0);
    for (let index = 0; index < NFFT; index += 1) re[index] = (mono[start + index] || 0) * window[index];
    fft(re, im);
    const atual = new Float32Array(NFFT / 2);
    let pico = 0;
    for (let bin = 1; bin < NFFT / 2; bin += 1) {
      const mag = Math.hypot(re[bin], im[bin]);
      atual[bin] = mag;
      if (mag > pico) pico = mag;
      if (anterior) {
        const delta = mag - anterior[bin];
        if (delta > 0) flux += delta;
        else estavel += mag;
      }
    }
    const piso = pico * 0.12;
    for (let bin = 2; bin < NFFT / 2 - 1; bin += 1) {
      const mag = atual[bin];
      if (mag < piso || mag < atual[bin - 1] || mag < atual[bin + 1]) continue;
      const freq = frequenciaDoPico(atual, bin, rate);
      if (freq < 45 || freq > 2800) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
      if (freq <= 220) grave[pc] += mag * 3;
    }
    anterior = atual;
  }
  const tonalidade = escolherTonalidade(chroma, grave);
  const total = flux + estavel;
  const ataque = total > 0 ? flux / total : 0;
  return { tonalidade, ataque, harmonia: total > 0 ? estavel / total : 0 };
}

/**
 * Ajusta a frequência do bin de pico com os vizinhos, para o grave não cair na nota ao lado.
 * @param {Float32Array} mags Magnitudes da metade útil da FFT.
 * @param {number} bin Índice do pico.
 * @param {number} rate Taxa de amostragem em Hz.
 * @returns {number}
 */
function frequenciaDoPico(mags, bin, rate) {
  const esquerda = mags[bin - 1];
  const centro = mags[bin];
  const direita = mags[bin + 1];
  const denominador = esquerda - 2 * centro + direita;
  const delta = Math.abs(denominador) < 1e-12 ? 0 : (0.5 * (esquerda - direita)) / denominador;
  const ajuste = Math.min(0.5, Math.max(-0.5, delta));
  return ((bin + ajuste) * rate) / NFFT;
}

function escolherTonalidade(chroma, grave) {
  let graveSoma = 0;
  for (let index = 0; index < 12; index += 1) graveSoma += grave[index];
  const candidatos = [];
  for (let tonica = 0; tonica < 12; tonica += 1) {
    const raiz = graveSoma > 0 ? grave[tonica] / graveSoma : 0;
    candidatos.push({
      modo: "menor",
      tonica,
      score: pearsonRotacionado(chroma, PERFIL_MENOR, tonica) + raiz * 0.85,
    });
    candidatos.push({
      modo: "maior",
      tonica,
      score: pearsonRotacionado(chroma, PERFIL_MAIOR, tonica) + raiz * 0.85,
    });
  }
  candidatos.sort((a, b) => b.score - a.score);
  const melhor = candidatos[0];
  const relativa = candidatos.find((item) => item.modo !== melhor.modo && item.tonica === relativaDe(melhor));
  const outras = candidatos.find((item) => item !== melhor && item !== relativa);
  const margemRelativa = relativa ? melhor.score - relativa.score : melhor.score;
  const margemOutras = outras ? melhor.score - outras.score : melhor.score;
  const raiz = graveSoma > 0 ? grave[melhor.tonica] / graveSoma : 0;
  const confianca = Math.round(
    Math.min(95, Math.max(8, 38 + margemOutras * 70 + Math.max(0, margemRelativa) * 120 + raiz * 28)),
  );
  const menor = melhor.modo === "menor";
  return {
    nome: menor ? NOME_MENOR[melhor.tonica] : NOME_MAIOR[melhor.tonica],
    modo: melhor.modo,
    camelot: menor ? CAMELOT_MENOR[melhor.tonica] : CAMELOT_MAIOR[melhor.tonica],
    confianca,
  };
}

/**
 * Devolve a tônica da relativa, porque menor e maior vizinhos disputam o mesmo conjunto de notas.
 * @param {{ modo: string, tonica: number }} tom Candidato já escolhido.
 * @returns {number}
 */
function relativaDe(tom) {
  return tom.modo === "menor" ? (tom.tonica + 3) % 12 : (tom.tonica + 9) % 12;
}

function pearsonRotacionado(chroma, perfil, tonica) {
  let mediaCroma = 0;
  let mediaPerfil = 0;
  for (let index = 0; index < 12; index += 1) {
    mediaCroma += chroma[(tonica + index) % 12];
    mediaPerfil += perfil[index];
  }
  mediaCroma /= 12;
  mediaPerfil /= 12;
  let numerador = 0;
  let desvioCroma = 0;
  let desvioPerfil = 0;
  for (let index = 0; index < 12; index += 1) {
    const valorCroma = chroma[(tonica + index) % 12] - mediaCroma;
    const valorPerfil = perfil[index] - mediaPerfil;
    numerador += valorCroma * valorPerfil;
    desvioCroma += valorCroma * valorCroma;
    desvioPerfil += valorPerfil * valorPerfil;
  }
  return numerador / Math.sqrt(desvioCroma * desvioPerfil + 1e-12);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Decodifica um arquivo de áudio do usuário.
 * O teto padrão protege a leitura da mix. Quem já tem o arquivo em disco
 * pode passar `maxBytes` maior.
 * @param {File | Blob} file
 * @param {AudioContext} audioContext
 * @param {{ maxBytes?: number }} [opcoes]
 */
export async function decodeAudioFile(file, audioContext, opcoes = {}) {
  const maxBytes = opcoes.maxBytes ?? MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`Limite ${Math.round(maxBytes / (1024 * 1024))} MB.`);
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
  const textura = medirTonalidadeETextura(mono, rate);
  return {
    bpm: bpm.bpm,
    note: bpm.note,
    bpm_confianca: bpm.confianca,
    centroid: magSum ? centroidSum / magSum : 0,
    bands,
    side: stereoSide(audio),
    tonalidade: textura.tonalidade,
    ataque: textura.ataque,
    harmonia: textura.harmonia,
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
