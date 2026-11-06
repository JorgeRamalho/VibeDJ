/**
 * Duas sessões ONNX no navegador: HT-Demucs na mix, DrumSep v2 só na bateria.
 * Os pesos baixam na hora do uso e ficam na Cache API. Não entram no repositório.
 * Só um modelo fica no heap por vez: o da mix é solto antes de abrir o da bateria.
 */

import {
  DEMUCS_AMOSTRAS,
  DEMUCS_FONTES,
  DEMUCS_SOBREPOSICAO,
  DRUMSEP_AMOSTRAS,
  DRUMSEP_BINS,
  DRUMSEP_FONTES,
  DRUMSEP_HOP,
  DRUMSEP_QUADROS,
  TAXA_MODELO,
  magnitudeHibrida,
  planoOverlap,
  quadrosHibridos,
  reamostrar,
  recortarDezesseisCompassos,
  sintetizarDrumSep,
  somarOverlap,
} from "./stem-separa.js";

const ORT_VERSION = "1.31.1";
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.all.min.mjs`;
const WASM_PATH = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const CACHE = "vibedj-stem-modelos-v1";

/** URLs estáveis dos ONNX. O formato de tensor está fixado em stem-separa.js. */
export const MODELOS = Object.freeze({
  demucs: "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx",
  drumsep: "https://huggingface.co/gridshiftstudio/drumsep-onnx/resolve/main/drumsep_v2.onnx",
});

/** @type {Promise<any> | null} */
let ortPromise = null;
/** @type {Promise<void>} */
let fila = Promise.resolve();

/** @type {{ session: any, provedor: string, bytes: ArrayBuffer } | null} */
let demucsEstado = null;
/** @type {{ session: any, provedor: string, bytes: ArrayBuffer } | null} */
let drumEstado = null;

/**
 * Separa 16 compassos do AudioBuffer. Devolve as fontes do modelo, ainda em estéreo.
 * A mesa decide quais cadeiras vazias recebem cada fonte.
 * @param {AudioBuffer} buffer
 * @param {number | null | undefined} bpm
 * @param {{ signal?: AbortSignal, onProgress?: (mensagem: string) => void }} [opcoes]
 * @returns {Promise<Record<string, { left: Float32Array, right: Float32Array }>>}
 */
export function separarDoador(buffer, bpm, opcoes = {}) {
  const tarefa = fila.then(() => executarSeparacao(buffer, bpm, opcoes));
  fila = tarefa.then(
    () => undefined,
    () => undefined,
  );
  return tarefa;
}

/**
 * @param {AudioBuffer} buffer
 * @param {number | null | undefined} bpm
 * @param {{ signal?: AbortSignal, onProgress?: (mensagem: string) => void }} opcoes
 */
async function executarSeparacao(buffer, bpm, opcoes) {
  const { signal, onProgress } = opcoes;
  garantirAtivo(signal);
  const esquerdo = buffer.getChannelData(0);
  const direito = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : esquerdo;
  const recorte = recortarDezesseisCompassos(esquerdo, direito, buffer.sampleRate, bpm);
  const left = reamostrar(recorte.left, recorte.rate, TAXA_MODELO);
  const right = reamostrar(recorte.right, recorte.rate, TAXA_MODELO);
  if (left.length < 2) throw new Error("O trecho ficou curto demais para separar.");

  onProgress?.("Carregando o modelo da mix…");
  const ort = await carregarOrt();
  demucsEstado = await garantirSessao(ort, demucsEstado, MODELOS.demucs, "Modelo da mix", signal, onProgress);
  garantirAtivo(signal);
  onProgress?.("Separando bateria, baixo e voz…");
  const mix = await separarDemucs(ort, demucsEstado, left, right, signal, onProgress);
  await liberarSessao(demucsEstado);
  demucsEstado = null;

  onProgress?.("Carregando o modelo da bateria…");
  const provedoresBateria = typeof navigator !== "undefined" && navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
  try {
    drumEstado = await garantirSessao(
      ort,
      drumEstado,
      MODELOS.drumsep,
      "Modelo da bateria",
      signal,
      onProgress,
      provedoresBateria,
    );
    garantirAtivo(signal);
    onProgress?.("Separando kick, clap e hi-hat…");
    const bateria = await separarBateria(ort, drumEstado, mix.drums.left, mix.drums.right, signal, onProgress);
    await liberarSessao(drumEstado);
    drumEstado = null;
    return {
      bass: mix.bass,
      vocals: mix.vocals,
      kick: bateria.kick,
      snare: bateria.snare,
      cymbals: bateria.cymbals,
      toms: bateria.toms,
    };
  } catch (err) {
    await liberarSessao(drumEstado);
    drumEstado = null;
    if (err instanceof Error && err.name === "AbortError") throw err;
    const detalhe = err instanceof Error ? err.message : "falha na bateria";
    return {
      bass: mix.bass,
      vocals: mix.vocals,
      aviso: `Baixo e voz foram separados. Kick, clap e hi-hat não couberam na memória deste navegador e continuam no filtro da mix. ${detalhe}`,
    };
  }
}

/**
 * Solta o modelo do heap WASM. O arquivo continua na Cache API para o próximo doador.
 * @param {{ session: { release?: () => Promise<void> } } | null} estado
 */
async function liberarSessao(estado) {
  if (!estado?.session?.release) return;
  await estado.session.release();
}
function garantirAtivo(signal) {
  if (!signal?.aborted) return;
  const err = new Error("Separação cancelada.");
  err.name = "AbortError";
  throw err;
}

/**
 * Heap largo o bastante para os dois ONNX. Se o navegador recusar 2 GB, tenta 1 GB.
 * @param {boolean} shared
 * @returns {WebAssembly.Memory | undefined}
 */
function criarMemoriaWasm(shared) {
  const tetos = [32768, 16384];
  for (const maximum of tetos) {
    try {
      return new WebAssembly.Memory({ initial: 256, maximum, shared });
    } catch {
      /* tenta o teto seguinte */
    }
  }
  return undefined;
}
/**
 * Importa o onnxruntime-web uma vez. Várias threads só com COEP.
 * @returns {Promise<any>}
 */
function carregarOrt() {
  if (!ortPromise) {
    ortPromise = import(ORT_URL).then((mod) => {
      const ort = mod;
      ort.env.wasm.wasmPaths = WASM_PATH;
      const isolado = typeof crossOriginIsolated === "boolean" && crossOriginIsolated;
      ort.env.wasm.numThreads = isolado ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const memoria = criarMemoriaWasm(isolado);
      if (memoria) ort.env.wasm.wasmMemory = memoria;
      return ort;
    });
  }
  return ortPromise;
}

/**
 * @param {any} ort
 * @param {{ session: any, provedor: string, bytes: ArrayBuffer } | null} estado
 * @param {string} url
 * @param {string} rotulo
 * @param {AbortSignal | undefined} signal
 * @param {(mensagem: string) => void} [onProgress]
 */
async function garantirSessao(ort, estado, url, rotulo, signal, onProgress, provedores = ["wasm"]) {
  if (estado?.session) return estado;
  const bytes = await baixarModelo(url, rotulo, signal, onProgress);
  garantirAtivo(signal);
  onProgress?.(`${rotulo} pronto. Abrindo a sessão…`);
  /** @type {string[]} */
  const erros = [];
  for (const provedor of provedores) {
    try {
      const session = await criarSessao(ort, bytes, provedor);
      return { session, provedor, bytes };
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : "falha ao abrir";
      erros.push(`${provedor}: ${detalhe}`);
    }
  }
  throw new Error(`Não abri ${rotulo.toLowerCase()}. ${erros.join(" | ")}`);
}

/**
 * @param {any} ort
 * @param {ArrayBuffer} bytes
 * @param {"webgpu" | "wasm"} provedor
 */
function criarSessao(ort, bytes, provedor) {
  return ort.InferenceSession.create(bytes, {
    executionProviders: [provedor],
    graphOptimizationLevel: "disabled",
    enableCpuMemArena: false,
    enableMemPattern: false,
    executionMode: "sequential",
  });
}

/**
 * @param {any} ort
 * @param {{ session: any, provedor: string, bytes: ArrayBuffer }} estado
 * @param {Record<string, any>} feeds
 */
async function executar(ort, estado, feeds) {
  return estado.session.run(feeds);
}

/**
 * @param {string} url
 * @param {string} rotulo
 * @param {AbortSignal | undefined} signal
 * @param {(mensagem: string) => void} [onProgress]
 * @returns {Promise<ArrayBuffer>}
 */
async function baixarModelo(url, rotulo, signal, onProgress) {
  const cache = "caches" in globalThis ? await caches.open(CACHE) : null;
  if (cache) {
    const salvo = await cache.match(url);
    if (salvo) {
      onProgress?.(`${rotulo} já está neste navegador.`);
      return salvo.arrayBuffer();
    }
  }
  garantirAtivo(signal);
  onProgress?.(`Baixando ${rotulo.toLowerCase()}…`);
  const response = await fetch(url, { signal, mode: "cors" });
  if (!response.ok) throw new Error(`Não consegui baixar ${rotulo.toLowerCase()} (HTTP ${response.status}).`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();
  /** @type {Uint8Array[]} */
  const partes = [];
  let recebido = 0;
  let ultimoPct = -1;
  while (true) {
    const passo = await reader.read();
    if (passo.done) break;
    partes.push(passo.value);
    recebido += passo.value.byteLength;
    if (total > 0) {
      const pct = Math.round((100 * recebido) / total);
      if (pct !== ultimoPct) {
        ultimoPct = pct;
        onProgress?.(`Baixando ${rotulo.toLowerCase()}… ${pct}%`);
      }
    }
  }
  const bytes = new Uint8Array(recebido);
  let cursor = 0;
  partes.forEach((parte) => {
    bytes.set(parte, cursor);
    cursor += parte.byteLength;
  });
  const buffer = bytes.buffer;
  if (cache) await cache.put(url, new Response(buffer.slice(0)));
  return buffer;
}

/**
 * @param {any} ort
 * @param {{ session: any, provedor: string, bytes: ArrayBuffer }} estado
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @param {AbortSignal | undefined} signal
 * @param {(mensagem: string) => void} [onProgress]
 */
async function separarDemucs(ort, estado, left, right, signal, onProgress) {
  const total = left.length;
  const { stride, blocos } = planoOverlap(total, DEMUCS_AMOSTRAS, DEMUCS_SOBREPOSICAO);
  /** @type {Record<string, { left: Float32Array[], right: Float32Array[] }>} */
  const partes = {};
  DEMUCS_FONTES.forEach((fonte) => {
    partes[fonte] = { left: [], right: [] };
  });
  for (let bloco = 0; bloco < blocos; bloco += 1) {
    garantirAtivo(signal);
    onProgress?.(`Separando bateria, baixo e voz… bloco ${bloco + 1} de ${blocos}`);
    const inicio = bloco * stride;
    const mix = new Float32Array(2 * DEMUCS_AMOSTRAS);
    for (let index = 0; index < DEMUCS_AMOSTRAS; index += 1) {
      const pos = inicio + index;
      mix[index] = pos < total ? left[pos] : 0;
      mix[DEMUCS_AMOSTRAS + index] = pos < total ? right[pos] : 0;
    }
    const tensor = new ort.Tensor("float32", mix, [1, 2, DEMUCS_AMOSTRAS]);
    const saida = await executar(ort, estado, { mix: tensor });
    tensor.dispose?.();
    const dados = saida.stems?.data;
    if (!dados) throw new Error("O modelo da mix não devolveu o tensor stems.");
    DEMUCS_FONTES.forEach((fonte, indice) => {
      const canal = lerCanal(dados, indice, DEMUCS_AMOSTRAS);
      partes[fonte].left.push(canal.left);
      partes[fonte].right.push(canal.right);
    });
    saida.stems.dispose?.();
    await ceder();
  }
  /** @type {Record<string, { left: Float32Array, right: Float32Array }>} */
  const fontes = {};
  DEMUCS_FONTES.forEach((fonte) => {
    fontes[fonte] = {
      left: somarOverlap(partes[fonte].left, total, DEMUCS_AMOSTRAS, DEMUCS_SOBREPOSICAO),
      right: somarOverlap(partes[fonte].right, total, DEMUCS_AMOSTRAS, DEMUCS_SOBREPOSICAO),
    };
  });
  return fontes;
}

/**
 * @param {any} ort
 * @param {{ session: any, provedor: string, bytes: ArrayBuffer }} estado
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @param {AbortSignal | undefined} signal
 * @param {(mensagem: string) => void} [onProgress]
 */
async function separarBateria(ort, estado, left, right, signal, onProgress) {
  const total = left.length;
  const sobreposicao = DRUMSEP_AMOSTRAS - DRUMSEP_HOP;
  const { stride, blocos } = planoOverlap(total, DRUMSEP_AMOSTRAS, sobreposicao);
  /** @type {Record<string, { left: Float32Array[], right: Float32Array[] }>} */
  const partes = {};
  DRUMSEP_FONTES.forEach((fonte) => {
    partes[fonte] = { left: [], right: [] };
  });
  for (let bloco = 0; bloco < blocos; bloco += 1) {
    garantirAtivo(signal);
    onProgress?.(`Separando kick, clap e hi-hat… bloco ${bloco + 1} de ${blocos}`);
    await ceder();
    const inicio = bloco * stride;
    const pedacoL = new Float32Array(DRUMSEP_AMOSTRAS);
    const pedacoR = new Float32Array(DRUMSEP_AMOSTRAS);
    for (let index = 0; index < DRUMSEP_AMOSTRAS; index += 1) {
      const pos = inicio + index;
      pedacoL[index] = pos < total ? left[pos] : 0;
      pedacoR[index] = pos < total ? right[pos] : 0;
    }
    if (quadrosHibridos(DRUMSEP_AMOSTRAS) !== DRUMSEP_QUADROS) {
      throw new Error("O espectrograma da bateria não tem 1723 quadros.");
    }
    const mag = magnitudeHibrida(pedacoL, pedacoR);
    if (mag.length !== 4 * DRUMSEP_BINS * DRUMSEP_QUADROS) {
      throw new Error("O tensor mag do DrumSep ficou com o tamanho errado.");
    }
    const mix = new Float32Array(2 * DRUMSEP_AMOSTRAS);
    mix.set(pedacoL, 0);
    mix.set(pedacoR, DRUMSEP_AMOSTRAS);
    const mixTensor = new ort.Tensor("float32", mix, [1, 2, DRUMSEP_AMOSTRAS]);
    const magTensor = new ort.Tensor("float32", mag, [1, 4, DRUMSEP_BINS, DRUMSEP_QUADROS]);
    const saida = await executar(ort, estado, { mix: mixTensor, mag: magTensor });
    mixTensor.dispose?.();
    magTensor.dispose?.();
    const freq = saida.freq_out?.data;
    const tempo = saida.time_out?.data;
    if (!freq || !tempo) throw new Error("O modelo da bateria não devolveu freq_out e time_out.");
    const sintetizado = sintetizarDrumSep(freq, tempo, DRUMSEP_FONTES.length, DRUMSEP_AMOSTRAS, DRUMSEP_QUADROS);
    DRUMSEP_FONTES.forEach((fonte, indice) => {
      partes[fonte].left.push(sintetizado[indice].left);
      partes[fonte].right.push(sintetizado[indice].right);
    });
    saida.freq_out.dispose?.();
    saida.time_out.dispose?.();
    await ceder();
  }
  /** @type {Record<string, { left: Float32Array, right: Float32Array }>} */
  const fontes = {};
  DRUMSEP_FONTES.forEach((fonte) => {
    fontes[fonte] = {
      left: somarOverlap(partes[fonte].left, total, DRUMSEP_AMOSTRAS, sobreposicao),
      right: somarOverlap(partes[fonte].right, total, DRUMSEP_AMOSTRAS, sobreposicao),
    };
  });
  return fontes;
}

/**
 * Lê um fonte de um tensor [1, fontes, 2, amostras].
 * @param {Float32Array} dados
 * @param {number} fonte
 * @param {number} amostras
 * @returns {{ left: Float32Array, right: Float32Array }}
 */
function lerCanal(dados, fonte, amostras) {
  const left = new Float32Array(amostras);
  const right = new Float32Array(amostras);
  const base = fonte * 2 * amostras;
  for (let index = 0; index < amostras; index += 1) {
    left[index] = dados[base + index];
    right[index] = dados[base + amostras + index];
  }
  return { left, right };
}

/** Devolve a thread para o navegador pintar o progresso. */
function ceder() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
