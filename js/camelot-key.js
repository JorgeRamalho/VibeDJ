/**
 * Roda Camelot (Mixed In Key) e estimativa de tonalidade para mix in key.
 */

export const CAMELOT_KEYS = [
  { n: 1, minor: "Lá♭ menor", major: "Si maior" },
  { n: 2, minor: "Mi♭ menor", major: "Fá# maior" },
  { n: 3, minor: "Si♭ menor", major: "Ré♭ maior" },
  { n: 4, minor: "Fá menor", major: "Lá♭ maior" },
  { n: 5, minor: "Dó menor", major: "Mi♭ maior" },
  { n: 6, minor: "Sol menor", major: "Si♭ maior" },
  { n: 7, minor: "Ré menor", major: "Fá maior" },
  { n: 8, minor: "Lá menor", major: "Dó maior" },
  { n: 9, minor: "Mi menor", major: "Sol maior" },
  { n: 10, minor: "Si menor", major: "Ré maior" },
  { n: 11, minor: "Fá# menor", major: "Lá maior" },
  { n: 12, minor: "Ré♭ menor", major: "Mi maior" },
];

/** Índice = pitch class (0 = Dó). Valor = número Camelot. */
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

const KRUMHANSK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const TEMPERLEY_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TEMPERLEY_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 3.0, 4.5];

const NFFT_KEY = 4096;
const HOP_KEY = 2048;
const KEY_MAX_SEC = 150;
const KEY_SEGMENTS = 12;

/**
 * Leitura afinada: vários trechos, conteúdo harmônico e HPCP.
 * @param {Float32Array} mono
 * @param {number} rate
 * @param {(ratio: number) => void} [onProgress]
 */
export async function estimateMusicalKeyFromMono(mono, rate, onProgress = () => {}) {
  const limit = Math.min(mono.length, Math.floor(rate * KEY_MAX_SEC));
  if (limit < NFFT_KEY + HOP_KEY) {
    return emptyKey("Faixa curta demais para estimar a tonalidade.");
  }

  const segLen = Math.max(NFFT_KEY + HOP_KEY, Math.floor(limit / KEY_SEGMENTS));
  /** @type {{ key: ReturnType<typeof estimateKeyFromChroma>, weight: number }[]} */
  const votes = [];

  for (let segment = 0; segment < KEY_SEGMENTS; segment += 1) {
    const segStart = Math.min(segment * segLen, Math.max(0, limit - NFFT_KEY - HOP_KEY));
    const segEnd = Math.min(segStart + segLen, limit - NFFT_KEY);
    const chroma = new Float32Array(12);
    for (let offset = segStart; offset < segEnd; offset += HOP_KEY) {
      accumulateHarmonicHpc(mono, offset, rate, chroma);
    }
    const weight = chromaEnergy(chroma);
    if (weight > 1e-8) {
      votes.push({ key: estimateKeyFromChroma(chroma), weight });
    }
    if (segment % 2 === 0) {
      onProgress((segment + 1) / KEY_SEGMENTS);
      await wait(0);
    }
  }

  onProgress(1);
  return mergeKeyVotes(votes);
}

/**
 * @param {number} freq Hz
 * @param {number} mag
 * @param {Float32Array} chroma length 12
 */
export function addToChroma(freq, mag, chroma) {
  spreadHpc(chroma, freq, mag * keyBandWeight(freq));
}

/**
 * @param {Float32Array | number[]} chroma
 */
export function estimateKeyFromChroma(chroma) {
  const vector = normalizeChroma(chroma);
  if (chromaEnergy(vector) < 1e-6) {
    return emptyKey("Pouca energia harmônica para estimar a tonalidade.");
  }

  /** @type {{ score: number, pc: number, modo: "menor" | "maior" }[]} */
  const ranked = [];
  for (let pc = 0; pc < 12; pc += 1) {
    ranked.push({ score: combinedCorrelation(vector, KRUMHANSK_MINOR, TEMPERLEY_MINOR, pc), pc, modo: "menor" });
    ranked.push({ score: combinedCorrelation(vector, KRUMHANSK_MAJOR, TEMPERLEY_MAJOR, pc), pc, modo: "maior" });
  }
  ranked.sort((a, b) => b.score - a.score);
  let best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.1) {
    return emptyKey("Tonalidade incerta — mix muito percussiva ou atonal.");
  }

  best = refineKeyChoice(vector, best, second, ranked);

  const camelot = camelotFromPitchClass(best.pc, best.modo);
  const nome = nameForCamelot(camelot);
  const { vizinhos, relativo } = neighborsForCamelot(camelot);
  const confianca = Math.round(clamp(best.score, 0.12, 0.99) * 100);
  const gap = second ? best.score - scoreForCandidate(vector, second) : best.score;
  let nota = "Leitura harmônica para mix in key — confirme no ouvido em trechos melódicos.";
  if (gap < 0.035) {
    nota = `Leitura próxima de ${camelotFromPitchClass(second.pc, second.modo)}. Use vizinhos ${vizinhos.join(" / ")} se a mix soar torta.`;
  }

  return {
    camelot,
    nome,
    modo: best.modo,
    pitch_class: best.pc,
    confianca,
    vizinhos,
    relativo,
    alternativa:
      second && gap < 0.055
        ? {
            camelot: camelotFromPitchClass(second.pc, second.modo),
            nome: nameForCamelot(camelotFromPitchClass(second.pc, second.modo)),
            confianca: Math.round(clamp(scoreForCandidate(vector, second), 0.12, 0.99) * 100),
          }
        : null,
    nota,
  };
}

function refineKeyChoice(vector, best, second, ranked) {
  if (second && best.pc === second.pc && best.modo !== second.modo) {
    const pick = pickMajorMinor(vector, best.pc);
    return { pc: best.pc, modo: pick, score: Math.max(best.score, second.score) };
  }
  const majorPc = best.modo === "maior" ? best.pc : (best.pc + 3) % 12;
  const minorPc = best.modo === "menor" ? best.pc : (best.pc + 9) % 12;
  if (second && isRelativePair(best.pc, best.modo, second.pc, second.modo)) {
    const pick = pickRelativeMajorMinor(vector, minorPc, majorPc);
    return { pc: pick.pc, modo: pick.modo, score: best.score };
  }
  const alt = ranked.find(
    (item, index) =>
      index > 0 &&
      index < 4 &&
      isRelativePair(best.pc, best.modo, item.pc, item.modo) &&
      best.score - item.score < 0.06,
  );
  if (alt) {
    const minorRoot = best.modo === "menor" ? best.pc : alt.pc;
    const majorRoot = best.modo === "maior" ? best.pc : alt.pc;
    const pick = pickRelativeMajorMinor(vector, minorRoot, majorRoot);
    return { pc: pick.pc, modo: pick.modo, score: best.score };
  }
  return best;
}

function isRelativePair(pcA, modoA, pcB, modoB) {
  if (modoA === modoB) return false;
  const minor = modoA === "menor" ? pcA : pcB;
  const major = modoA === "maior" ? pcA : pcB;
  return (minor + 3) % 12 === major;
}

function pickMajorMinor(vector, root) {
  const min3 = (root + 3) % 12;
  const maj3 = (root + 4) % 12;
  const fifth = (root + 7) % 12;
  const minorScore = vector[root] + 1.35 * vector[min3] + 0.55 * vector[fifth] - 0.45 * vector[maj3];
  const majorScore = vector[root] + 1.35 * vector[maj3] + 0.55 * vector[fifth] - 0.45 * vector[min3];
  if (minorScore >= majorScore * 1.04) return "menor";
  if (majorScore >= minorScore * 1.04) return "maior";
  return minorScore >= majorScore ? "menor" : "maior";
}

function pickRelativeMajorMinor(vector, minorRoot, majorRoot) {
  return pickMajorMinor(vector, minorRoot) === "menor"
    ? { pc: minorRoot, modo: "menor" }
    : { pc: majorRoot, modo: "maior" };
}

function scoreForCandidate(vector, candidate) {
  const profiles =
    candidate.modo === "menor"
      ? [KRUMHANSK_MINOR, TEMPERLEY_MINOR]
      : [KRUMHANSK_MAJOR, TEMPERLEY_MAJOR];
  return combinedCorrelation(vector, profiles[0], profiles[1], candidate.pc);
}

function mergeKeyVotes(votes) {
  if (!votes.length) return emptyKey("Não houve trecho harmônico estável o suficiente.");
  /** @type {Map<string, { weight: number, conf: number, key: ReturnType<typeof estimateKeyFromChroma> }>} */
  const tally = new Map();
  let total = 0;
  for (const vote of votes) {
    const code = vote.key.camelot;
    if (!code) continue;
    total += vote.weight;
    const prev = tally.get(code) || { weight: 0, conf: 0, key: vote.key };
    prev.weight += vote.weight;
    prev.conf += vote.key.confianca * vote.weight;
    prev.key = vote.key;
    tally.set(code, prev);
  }
  if (!tally.size || total < 1e-8) return emptyKey("Tonalidade incerta após votação por trechos.");

  let winner = null;
  for (const entry of tally.values()) {
    if (!winner || entry.weight > winner.weight) winner = entry;
  }
  if (!winner) return emptyKey("Tonalidade incerta após votação por trechos.");

  const share = winner.weight / total;
  const merged = { ...winner.key };
  merged.confianca = Math.round(clamp((winner.conf / winner.weight / 100) * (0.55 + share * 0.55), 0.15, 0.99) * 100);
  if (share < 0.34) {
    merged.nota = `Vários trechos discordam (melhor opção ${Math.round(share * 100)}% dos trechos). ${merged.nota}`;
  } else if (share >= 0.55) {
    merged.nota = `Consenso em ${Math.round(share * 100)}% dos trechos analisados. ${merged.nota}`;
  }
  return merged;
}

function accumulateHarmonicHpc(mono, offset, rate, chroma) {
  const re = new Float32Array(NFFT_KEY);
  const im = new Float32Array(NFFT_KEY);
  const window = hann(NFFT_KEY);
  for (let index = 0; index < NFFT_KEY; index += 1) {
    re[index] = (mono[offset + index] || 0) * window[index];
  }
  fft(re, im);
  const bins = NFFT_KEY / 2;
  const mags = new Float32Array(bins);
  for (let bin = 1; bin < bins; bin += 1) mags[bin] = Math.hypot(re[bin], im[bin]);

  for (let bin = 2; bin < bins - 2; bin += 1) {
    const freq = (bin * rate) / NFFT_KEY;
    if (freq < 80 || freq > 5200) continue;
    const peak = peakiness(mags, bin);
    if (peak < 0.22) continue;
    const harmonic = harmonicRatio(mags, bin);
    const mag = mags[bin] * peak * harmonic;
    spreadHpc(chroma, freq, mag * keyBandWeight(freq));
    if (freq >= 160 && freq <= 2600) {
      spreadHpc(chroma, freq * 2, mag * 0.35 * keyBandWeight(freq * 2));
    }
  }
}

function peakiness(mags, bin) {
  const center = mags[bin];
  const left = mags[bin - 1];
  const right = mags[bin + 1];
  const shoulders = (left + right) * 0.5;
  if (center <= shoulders) return 0;
  return clamp((center - shoulders) / (center + 1e-9), 0, 1);
}

function harmonicRatio(mags, bin) {
  let sum = mags[bin];
  let count = 1;
  for (let harmonic = 2; harmonic <= 4; harmonic += 1) {
    const hBin = bin * harmonic;
    if (hBin >= mags.length) break;
    sum += mags[hBin] * (1 / harmonic);
    count += 1 / harmonic;
  }
  const expected = (sum / count) || 1;
  return clamp(mags[bin] / expected, 0.25, 1.35);
}

function spreadHpc(chroma, freq, energy) {
  if (energy <= 0 || freq < 55) return;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const wrapped = ((midi % 12) + 12) % 12;
  const base = Math.floor(wrapped);
  const frac = wrapped - base;
  chroma[base] += energy * (1 - frac);
  chroma[(base + 1) % 12] += energy * frac;
}

function keyBandWeight(freq) {
  if (freq < 100) return 0.08;
  if (freq < 160) return 0.35;
  if (freq <= 2400) return 1;
  if (freq <= 4200) return 0.55;
  return 0.18;
}

function chromaEnergy(chroma) {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += chroma[index] || 0;
  return sum;
}

function emptyKey(nota) {
  return {
    camelot: null,
    nome: null,
    modo: null,
    pitch_class: null,
    confianca: 0,
    vizinhos: [],
    relativo: null,
    alternativa: null,
    nota,
  };
}

export function camelotFromPitchClass(pc, modo) {
  const number = modo === "menor" ? CAMELOT_MINOR[pc] : CAMELOT_MAJOR[pc];
  const letter = modo === "menor" ? "A" : "B";
  return `${number}${letter}`;
}

export function nameForCamelot(code) {
  const number = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  const key = CAMELOT_KEYS.find((item) => item.n === number);
  if (!key) return code;
  return letter === "A" ? key.minor : key.major;
}

export function neighborsForCamelot(code) {
  const number = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  const prev = `${number === 1 ? 12 : number - 1}${letter}`;
  const next = `${number === 12 ? 1 : number + 1}${letter}`;
  const relativo = `${number}${letter === "A" ? "B" : "A"}`;
  return { prev, next, relativo, vizinhos: [prev, next] };
}

function normalizeChroma(chroma) {
  const out = new Float32Array(12);
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const value = chroma[index] || 0;
    out[index] = value;
    sum += value;
  }
  if (sum < 1e-12) return out;
  for (let index = 0; index < 12; index += 1) out[index] /= sum;
  return out;
}

function combinedCorrelation(chroma, profileA, profileB, root) {
  return correlate(chroma, profileA, root) * 0.58 + correlate(chroma, profileB, root) * 0.42;
}

function correlate(chroma, profile, root) {
  let dot = 0;
  let cNorm = 0;
  let pNorm = 0;
  for (let index = 0; index < 12; index += 1) {
    const c = chroma[index];
    const p = profile[(index - root + 12) % 12];
    dot += c * p;
    cNorm += c * c;
    pNorm += p * p;
  }
  return dot / (Math.sqrt(cNorm * pNorm) + 1e-12);
}

function hann(size) {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
  }
  return window;
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
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const even = i + k;
        const odd = even + len / 2;
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

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
