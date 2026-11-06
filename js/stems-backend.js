/**
 * Cliente do backend local em 127.0.0.1:8777.
 * O laboratório só fala com ele quando o VibeDJ Stems está aberto na bandeja.
 */

import { createStemLayer } from "./isolamento-cadeiras.js";

export const BACKEND_URL = "http://127.0.0.1:8777";

/**
 * @returns {Promise<{ status: string, version?: string, provider?: string, message?: string }>}
 */
export async function checarBackend() {
  try {
    const resposta = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!resposta.ok) return { status: "ausente" };
    return await resposta.json();
  } catch {
    return { status: "ausente" };
  }
}

/**
 * Envia a faixa e devolve o job, novo ou reaproveitado pelo hash.
 * @param {File} file
 */
export async function enviarFaixa(file) {
  const corpo = new FormData();
  corpo.append("file", file, file.name);
  const resposta = await fetch(`${BACKEND_URL}/jobs`, { method: "POST", body: corpo });
  if (!resposta.ok) throw new Error(await textoDeErro(resposta));
  return resposta.json();
}

/**
 * Consulta o job até done ou error. `onProgress` recebe o JSON do backend.
 * @param {string} id
 * @param {(job: object) => void} onProgress
 */
export async function acompanharJob(id, onProgress) {
  for (;;) {
    const resposta = await fetch(`${BACKEND_URL}/jobs/${id}`);
    if (!resposta.ok) throw new Error("O backend perdeu o job.");
    const job = await resposta.json();
    onProgress(job);
    if (job.state === "done" || job.state === "error") return job;
    await esperar(1000);
  }
}

/**
 * Baixa cada WAV do job pronto. O teto de 80 MB da leitura da mix não entra aqui,
 * porque o backend já gravou a faixa inteira e o WAV de cadeira passa fácil disso.
 * Cadeiras viram camada mono. Stem sem cadeira, como drums, fica só para o download.
 * @param {{ stems?: { fonte: string, cadeira: string | null, arquivo: string, url: string }[] }} job
 * @param {AudioContext} _ctx reservado para a assinatura do chamador
 * @param {(mensagem: string) => void} [onProgress]
 */
export async function baixarStems(job, _ctx, onProgress = () => {}) {
  const stems = Array.isArray(job.stems) ? job.stems : [];
  if (!stems.length) throw new Error("O backend terminou o job sem a lista de stems.");
  /** @type {Record<string, ReturnType<typeof createStemLayer>>} */
  const imports = {};
  /** @type {Record<string, { blob: Blob, cadeira: string | null, arquivo: string }>} */
  const arquivos = {};
  for (let indice = 0; indice < stems.length; indice += 1) {
    const stem = stems[indice];
    onProgress(`Baixando ${stem.fonte} (${indice + 1} de ${stems.length})…`);
    const resposta = await fetch(`${BACKEND_URL}${stem.url}`);
    if (!resposta.ok) throw new Error(`Não baixei ${stem.fonte} (HTTP ${resposta.status}).`);
    const blob = await resposta.blob();
    arquivos[stem.fonte] = { blob, cadeira: stem.cadeira, arquivo: stem.arquivo };
    if (!stem.cadeira) continue;
    const decoded = await decodificarWavMono(blob);
    imports[stem.cadeira] = createStemLayer(decoded.mono, decoded.rate, stem.arquivo);
  }
  return { imports, arquivos };
}

/**
 * Mistura um WAV PCM 16, 24 ou 32 bits, ou float32, em um canal mono.
 * O parser lê o arquivo inteiro de propósito: o stem do backend cobre a faixa toda,
 * e o decodeAudioData do navegador esbarrava no teto de upload da mix.
 * @param {Blob} blob
 * @returns {Promise<{ mono: Float32Array, rate: number }>}
 */
export async function decodificarWavMono(blob) {
  const view = new DataView(await blob.arrayBuffer());
  if (texto(view, 0, 4) !== "RIFF" || texto(view, 8, 4) !== "WAVE") {
    throw new Error("O stem não veio como WAV.");
  }
  let offset = 12;
  let rate = 44100;
  let channels = 0;
  let bits = 16;
  let format = 1;
  let dataOffset = 0;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const id = texto(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      rate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === "data") {
      dataOffset = start;
      dataBytes = Math.min(size, view.byteLength - start);
      break;
    }
    offset = start + size + (size % 2);
  }
  const bytesPorAmostra = bits / 8;
  if (!channels || !dataBytes || (format !== 1 && format !== 3) || ![2, 3, 4].includes(bytesPorAmostra)) {
    throw new Error("O WAV do stem não é PCM 16, 24, 32 bits nem float32.");
  }
  const frameBytes = channels * bytesPorAmostra;
  const frames = Math.floor(dataBytes / frameBytes);
  const mono = new Float32Array(frames);
  const bruto = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const ganho = (format === 3 ? 1 : 1 / 2 ** (bits - 1)) / channels;
  let pos = dataOffset;
  for (let frame = 0; frame < frames; frame += 1) {
    let soma = 0;
    for (let canal = 0; canal < channels; canal += 1) {
      soma += lerAmostra(view, bruto, pos, bits, format);
      pos += bytesPorAmostra;
    }
    mono[frame] = soma * ganho;
    if ((frame & 0x1fffff) === 0 && frame !== 0) await ceder();
  }
  return { mono, rate };
}

/**
 * @param {DataView} view
 * @param {Uint8Array} bruto
 * @param {number} pos
 * @param {number} bits
 * @param {number} format
 */
function lerAmostra(view, bruto, pos, bits, format) {
  if (format === 3) return view.getFloat32(pos, true);
  if (bits === 16) return view.getInt16(pos, true);
  if (bits === 32) return view.getInt32(pos, true);
  let sample = bruto[pos] | (bruto[pos + 1] << 8) | (bruto[pos + 2] << 16);
  if (sample & 0x800000) sample -= 0x1000000;
  return sample;
}

/**
 * @param {DataView} view
 * @param {number} offset
 * @param {number} length
 */
function texto(view, offset, length) {
  let saida = "";
  for (let indice = 0; indice < length; indice += 1) saida += String.fromCharCode(view.getUint8(offset + indice));
  return saida;
}

function ceder() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @param {Response} resposta
 */
async function textoDeErro(resposta) {
  try {
    const corpo = await resposta.json();
    return corpo.detail || `O backend respondeu HTTP ${resposta.status}.`;
  } catch {
    return `O backend respondeu HTTP ${resposta.status}.`;
  }
}

/** @param {number} ms */
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
