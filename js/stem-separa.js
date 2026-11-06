/**
 * Recorte, reamostragem, overlap-add e mapa de cadeiras da separação.
 * Não fala com o ONNX nem com o DOM. Os blocos vêm dos manifestos
 * StemSplitio/htdemucs-onnx e gridshiftstudio/drumsep-onnx (v2).
 */

export const TAXA_MODELO = 44100;
export const COMPASSOS = 16;
export const BPM_RESERVA = 124;

/** HT-Demucs: mix [1, 2, 343980] → stems [1, 4, 2, 343980]. */
export const DEMUCS_AMOSTRAS = 343980;
export const DEMUCS_FONTES = ["drums", "bass", "other", "vocals"];
export const DEMUCS_SOBREPOSICAO = Math.floor(DEMUCS_AMOSTRAS / 4);

/**
 * DrumSep v2: mix [1, 2, 1764000] e mag [1, 4, 2048, 1723]
 * → freq_out [1, 4, 4, 2048, 1723], time_out [1, 4, 2, 1764000].
 * A janela não é a do HT-Demucs. O hop publicado é metade da janela.
 */
export const DRUMSEP_AMOSTRAS = 1764000;
export const DRUMSEP_HOP = 882000;
export const DRUMSEP_FONTES = ["kick", "snare", "cymbals", "toms"];
export const DRUMSEP_BINS = 2048;
export const DRUMSEP_QUADROS = 1723;

const NFFT = 4096;
const HOP = 1024;
const PAD_HYBRID = (HOP / 2) * 3;

/** Stem do modelo → cadeira da mesa. `other` fica de fora de propósito. */
export const STEM_PARA_CADEIRA = Object.freeze({
  bass: "bass",
  vocals: "vocal",
  kick: "kick",
  snare: "clap",
  cymbals: "hat",
  toms: "perc",
});

const ROTULO_CADEIRA = Object.freeze({
  bass: "baixo",
  vocal: "vocal",
  kick: "kick",
  clap: "clap",
  hat: "hi-hat",
  perc: "percussão",
});

/**
 * Aceita o BPM lido na mix. Fora de 80–180 usa o andamento de estudo.
 * @param {number | null | undefined} bpm
 * @returns {number}
 */
export function bpmDaJanela(bpm) {
  return typeof bpm === "number" && bpm >= 80 && bpm <= 180 ? bpm : BPM_RESERVA;
}

/**
 * Quantas amostras cabem em 16 compassos 4/4 nessa taxa.
 * @param {number} rate
 * @param {number} bpm
 * @returns {number}
 */
export function amostrasDezesseis(rate, bpm) {
  return Math.round(COMPASSOS * 4 * (60 / bpmDaJanela(bpm)) * rate);
}

/**
 * Primeiro quadro de 50 ms cuja energia passa de 15% do pico. Silêncio devolve 0.
 * @param {Float32Array} mono
 * @param {number} rate
 * @returns {number}
 */
export function primeiroAtaque(mono, rate) {
  const frame = Math.max(1, Math.round(rate * 0.05));
  const quadros = Math.floor(mono.length / frame);
  if (quadros < 1) return 0;
  let peak = 0;
  /** @type {number[]} */
  const rms = [];
  for (let index = 0; index < quadros; index += 1) {
    let sum = 0;
    const start = index * frame;
    for (let offset = 0; offset < frame; offset += 1) {
      const sample = mono[start + offset];
      sum += sample * sample;
    }
    const value = Math.sqrt(sum / frame);
    rms.push(value);
    if (value > peak) peak = value;
  }
  if (peak < 1e-5) return 0;
  const gate = peak * 0.15;
  for (let index = 0; index < rms.length; index += 1) {
    if (rms[index] >= gate) return index * frame;
  }
  return 0;
}

/**
 * Copia 16 compassos a partir do primeiro ataque. O buffer da stem começa nesse ataque,
 * porque a montagem lê a stem do instante zero.
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @param {number} rate
 * @param {number | null | undefined} bpm
 * @returns {{ left: Float32Array, right: Float32Array, rate: number, bpm: number, inicio: number }}
 */
export function recortarDezesseisCompassos(left, right, rate, bpm) {
  const tempo = bpmDaJanela(bpm);
  const pedido = amostrasDezesseis(rate, tempo);
  const mono = new Float32Array(left.length);
  for (let index = 0; index < left.length; index += 1) mono[index] = 0.5 * (left[index] + right[index]);
  const inicio = Math.min(primeiroAtaque(mono, rate), Math.max(0, left.length - 1));
  const fim = Math.min(left.length, inicio + pedido);
  return {
    left: left.slice(inicio, fim),
    right: right.slice(inicio, fim),
    rate,
    bpm: tempo,
    inicio,
  };
}

/**
 * Reamostra um canal por interpolação linear.
 * @param {Float32Array} input
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Float32Array}
 */
export function reamostrar(input, fromRate, toRate) {
  if (fromRate === toRate) return input.slice();
  if (input.length === 0) return new Float32Array(0);
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const scale = fromRate / toRate;
  const last = input.length - 1;
  for (let index = 0; index < outLen; index += 1) {
    const pos = Math.min(last, index * scale);
    const i0 = Math.floor(pos);
    const i1 = Math.min(last, i0 + 1);
    const frac = pos - i0;
    out[index] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Converte estéreo em mono, com o mesmo peso por canal que `mixdown`.
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @returns {Float32Array}
 */
export function monoDeEstereo(left, right) {
  const mono = new Float32Array(left.length);
  for (let index = 0; index < left.length; index += 1) mono[index] = 0.5 * (left[index] + right[index]);
  return mono;
}

/**
 * Plano de blocos com hop = segmento − sobreposição. O último bloco é completado com zero.
 * @param {number} total
 * @param {number} segment
 * @param {number} overlap
 * @returns {{ stride: number, blocos: number }}
 */
export function planoOverlap(total, segment, overlap) {
  const stride = segment - overlap;
  if (stride <= 0) throw new Error("Sobreposição maior ou igual ao bloco.");
  const blocos = Math.max(1, Math.ceil(total / stride));
  return { stride, blocos };
}

/**
 * Janela trapezoidal: sobe no início, desce no fim, vale 1 no meio.
 * O fade segue linspace(0, 1, overlap), como o infer.py do HT-Demucs.
 * @param {number} segment
 * @param {number} overlap
 * @returns {Float32Array}
 */
export function janelaTrapezio(segment, overlap) {
  const window = new Float32Array(segment);
  window.fill(1);
  if (overlap <= 0) return window;
  const fade = new Float32Array(overlap);
  const step = overlap === 1 ? 0 : 1 / (overlap - 1);
  for (let index = 0; index < overlap; index += 1) fade[index] = index * step;
  for (let index = 0; index < overlap; index += 1) {
    window[index] = fade[index];
    window[segment - 1 - index] = fade[index];
  }
  return window;
}

/**
 * Soma blocos já alinhados e divide pelo peso da janela.
 * @param {Float32Array[]} partes um canal por bloco, cada um com `segment` amostras úteis no início
 * @param {number} total
 * @param {number} segment
 * @param {number} overlap
 * @returns {Float32Array}
 */
export function somarOverlap(partes, total, segment, overlap) {
  const { stride } = planoOverlap(total, segment, overlap);
  const window = janelaTrapezio(segment, overlap);
  const out = new Float32Array(total);
  const weight = new Float32Array(total);
  partes.forEach((parte, index) => {
    const start = index * stride;
    const count = Math.min(segment, total - start);
    for (let offset = 0; offset < count; offset += 1) {
      out[start + offset] += parte[offset] * window[offset];
      weight[start + offset] += window[offset];
    }
  });
  for (let index = 0; index < total; index += 1) {
    out[index] /= Math.max(weight[index], 1e-8);
  }
  return out;
}

/**
 * Preenche só cadeiras vazias. Stem anexada à mão permanece.
 * @param {Record<string, { mono: Float32Array, rate: number, name: string } | undefined>} atuais
 * @param {Record<string, { left: Float32Array, right: Float32Array }>} separados chaves do modelo
 * @param {number} rate
 * @returns {{ stems: Record<string, { mono: Float32Array, rate: number, name: string }>, preenchidas: string[], mantidas: string[] }}
 */
export function preencherCadeirasVazias(atuais, separados, rate) {
  /** @type {Record<string, { mono: Float32Array, rate: number, name: string }>} */
  const stems = { ...atuais };
  /** @type {string[]} */
  const preenchidas = [];
  /** @type {string[]} */
  const mantidas = [];
  Object.entries(STEM_PARA_CADEIRA).forEach(([fonte, cadeira]) => {
    const audio = separados[fonte];
    if (!audio) return;
    if (stems[cadeira]?.mono?.length) {
      mantidas.push(cadeira);
      return;
    }
    const rotulo = ROTULO_CADEIRA[cadeira] || cadeira;
    stems[cadeira] = {
      mono: monoDeEstereo(audio.left, audio.right),
      rate,
      name: `Separado · ${rotulo}`,
    };
    preenchidas.push(cadeira);
  });
  return { stems, preenchidas, mantidas };
}

/**
 * Quadros do espectrograma híbrido depois do recorte do Demucs.
 * 1_764_000 amostras → 1723, que é o eixo do tensor `mag` do DrumSep.
 * @param {number} length
 * @returns {number}
 */
export function quadrosHibridos(length) {
  return Math.ceil(length / HOP);
}

/**
 * Espectrograma complex-as-channels do HDemucs: [4, 2048, quadros].
 * Canais: real esquerdo, imag esquerdo, real direito, imag direito.
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @returns {Float32Array}
 */
export function magnitudeHibrida(left, right) {
  if (left.length !== right.length) throw new Error("Canais com durações diferentes.");
  const le = quadrosHibridos(left.length);
  const specL = specRecortado(left, le);
  const specR = specRecortado(right, le);
  const mag = new Float32Array(4 * DRUMSEP_BINS * le);
  copiarComplexo(mag, 0, specL, le);
  copiarComplexo(mag, 2, specR, le);
  return mag;
}

/**
 * Ramo de frequência cac de volta ao tempo, mais o ramo temporal, por fonte.
 * @param {Float32Array} freqOut [fontes, 4, bins, quadros]
 * @param {Float32Array} timeOut [fontes, 2, amostras]
 * @param {number} fontes
 * @param {number} amostras
 * @param {number} quadros
 * @returns {{ left: Float32Array, right: Float32Array }[]}
 */
export function sintetizarDrumSep(freqOut, timeOut, fontes, amostras, quadros) {
  /** @type {{ left: Float32Array, right: Float32Array }[]} */
  const saidas = [];
  for (let fonte = 0; fonte < fontes; fonte += 1) {
    const left = ispecRecortado(freqOut, fonte, 0, amostras, quadros);
    const right = ispecRecortado(freqOut, fonte, 1, amostras, quadros);
    const base = fonte * 2 * amostras;
    for (let index = 0; index < amostras; index += 1) {
      left[index] += timeOut[base + index];
      right[index] += timeOut[base + amostras + index];
    }
    saidas.push({ left, right });
  }
  return saidas;
}

/**
 * Ida e volta do espectrograma híbrido, para o teste conferir o recorte de quadros.
 * @param {Float32Array} canal
 * @returns {Float32Array}
 */
export function idaEVoltaHibrida(canal) {
  const le = quadrosHibridos(canal.length);
  const spec = specRecortado(canal, le);
  const freq = new Float32Array(1 * 4 * DRUMSEP_BINS * le);
  copiarComplexo(freq, 0, spec, le);
  copiarComplexo(freq, 2, spec, le);
  return ispecRecortado(freq, 0, 0, canal.length, le);
}

/**
 * @param {Float32Array} canal
 * @param {number} le
 * @returns {{ real: Float32Array, imag: Float32Array }}
 */
function specRecortado(canal, le) {
  const rightPad = PAD_HYBRID + le * HOP - canal.length;
  const padded = refletir(canal, PAD_HYBRID, rightPad);
  const stft = transformar(padded);
  if (stft.frames !== le + 4) {
    throw new Error(`Quadros ${stft.frames} não batem com ${le + 4}.`);
  }
  const real = new Float32Array(DRUMSEP_BINS * le);
  const imag = new Float32Array(DRUMSEP_BINS * le);
  for (let bin = 0; bin < DRUMSEP_BINS; bin += 1) {
    for (let frame = 0; frame < le; frame += 1) {
      const from = bin * stft.frames + (frame + 2);
      const to = bin * le + frame;
      real[to] = stft.real[from];
      imag[to] = stft.imag[from];
    }
  }
  return { real, imag };
}

/**
 * @param {Float32Array} dest
 * @param {number} canalBase 0 esquerdo, 2 direito
 * @param {{ real: Float32Array, imag: Float32Array }} spec
 * @param {number} le
 */
function copiarComplexo(dest, canalBase, spec, le) {
  const plane = DRUMSEP_BINS * le;
  dest.set(spec.real, canalBase * plane);
  dest.set(spec.imag, (canalBase + 1) * plane);
}

/**
 * @param {Float32Array} freqOut
 * @param {number} fonte
 * @param {number} canal 0 esquerdo, 1 direito
 * @param {number} amostras
 * @param {number} quadros
 * @returns {Float32Array}
 */
function ispecRecortado(freqOut, fonte, canal, amostras, quadros) {
  const real = new Float32Array(DRUMSEP_BINS * quadros);
  const imag = new Float32Array(DRUMSEP_BINS * quadros);
  const plane = DRUMSEP_BINS * quadros;
  const base = (fonte * 4 + canal * 2) * plane;
  real.set(freqOut.subarray(base, base + plane));
  imag.set(freqOut.subarray(base + plane, base + 2 * plane));
  const frames = quadros + 4;
  const bins = DRUMSEP_BINS + 1;
  const fullReal = new Float32Array(bins * frames);
  const fullImag = new Float32Array(bins * frames);
  for (let bin = 0; bin < DRUMSEP_BINS; bin += 1) {
    for (let frame = 0; frame < quadros; frame += 1) {
      fullReal[bin * frames + (frame + 2)] = real[bin * quadros + frame];
      fullImag[bin * frames + (frame + 2)] = imag[bin * quadros + frame];
    }
  }
  const alvo = HOP * Math.ceil(amostras / HOP) + 2 * PAD_HYBRID;
  const onda = inverter(fullReal, fullImag, bins, frames, alvo);
  const out = new Float32Array(amostras);
  for (let index = 0; index < amostras; index += 1) out[index] = onda[PAD_HYBRID + index] || 0;
  return out;
}

/**
 * @param {Float32Array} signal
 * @returns {{ real: Float32Array, imag: Float32Array, bins: number, frames: number }}
 */
function transformar(signal) {
  const pad = NFFT >> 1;
  const padded = refletir(signal, pad, pad);
  const frames = 1 + Math.floor((padded.length - NFFT) / HOP);
  const bins = (NFFT >> 1) + 1;
  const real = new Float32Array(bins * frames);
  const imag = new Float32Array(bins * frames);
  const window = hannNormalizada(NFFT);
  const frameRe = new Float32Array(NFFT);
  const frameIm = new Float32Array(NFFT);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * HOP;
    frameIm.fill(0);
    for (let index = 0; index < NFFT; index += 1) frameRe[index] = padded[offset + index] * window[index];
    fft(frameRe, frameIm);
    for (let bin = 0; bin < bins; bin += 1) {
      real[bin * frames + frame] = frameRe[bin];
      imag[bin * frames + frame] = frameIm[bin];
    }
  }
  return { real, imag, bins, frames };
}

/**
 * @param {Float32Array} real bins × frames
 * @param {Float32Array} imag
 * @param {number} bins
 * @param {number} frames
 * @param {number} length
 * @returns {Float32Array}
 */
function inverter(real, imag, bins, frames, length) {
  const window = hannNormalizada(NFFT);
  const out = new Float32Array(length + NFFT);
  const weight = new Float32Array(out.length);
  const frameRe = new Float32Array(NFFT);
  const frameIm = new Float32Array(NFFT);
  for (let frame = 0; frame < frames; frame += 1) {
    frameRe.fill(0);
    frameIm.fill(0);
    for (let bin = 0; bin < bins; bin += 1) {
      frameRe[bin] = real[bin * frames + frame];
      frameIm[bin] = imag[bin * frames + frame];
    }
    for (let bin = 1; bin < NFFT / 2; bin += 1) {
      frameRe[NFFT - bin] = frameRe[bin];
      frameIm[NFFT - bin] = -frameIm[bin];
    }
    for (let index = 0; index < NFFT; index += 1) frameIm[index] = -frameIm[index];
    fft(frameRe, frameIm);
    const start = frame * HOP - (NFFT >> 1);
    for (let index = 0; index < NFFT; index += 1) {
      const pos = start + index;
      if (pos < 0 || pos >= out.length) continue;
      const sample = frameRe[index] / NFFT;
      out[pos] += sample * window[index];
      weight[pos] += window[index] * window[index];
    }
  }
  const cropped = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    cropped[index] = weight[index] > 1e-8 ? out[index] / weight[index] : 0;
  }
  return cropped;
}

/**
 * @param {number} n
 * @returns {Float32Array}
 */
function hannNormalizada(n) {
  const window = new Float32Array(n);
  let sumSq = 0;
  for (let index = 0; index < n; index += 1) {
    const value = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / n);
    window[index] = value;
    sumSq += value * value;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let index = 0; index < n; index += 1) window[index] /= norm;
  return window;
}

/**
 * Reflexão sem repetir a amostra da borda, no mesmo sentido do pad reflect do PyTorch.
 * @param {Float32Array} input
 * @param {number} left
 * @param {number} right
 * @returns {Float32Array}
 */
function refletir(input, left, right) {
  const out = new Float32Array(left + input.length + right);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = input[indiceRefletido(index - left, input.length)];
  }
  return out;
}

/**
 * @param {number} pos
 * @param {number} length
 * @returns {number}
 */
function indiceRefletido(pos, length) {
  if (length <= 1) return 0;
  let index = pos;
  while (index < 0 || index >= length) {
    if (index < 0) index = -index;
    else index = 2 * length - 2 - index;
  }
  return index;
}

/**
 * FFT radix-2 in place. `imag` acompanha `real` e os dois têm o mesmo tamanho, potência de dois.
 * @param {Float32Array} real
 * @param {Float32Array} imag
 */
function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const re = real[i];
      real[i] = real[j];
      real[j] = re;
      const im = imag[i];
      imag[i] = imag[j];
      imag[j] = im;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j += 1) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vRe = real[i + j + half] * wRe - imag[i + j + half] * wIm;
        const vIm = real[i + j + half] * wIm + imag[i + j + half] * wRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + half] = uRe - vRe;
        imag[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}
