/**
 * Exportação da track gerada (WAV lossless ou MP3 via lamejs local).
 */

const LAME_SCRIPT = new URL("./vendor/lame.min.js", import.meta.url).href;

/** @param {AudioBuffer} buffer @param {string} baseName @param {"wav"|"mp3"} format */
export async function downloadTrack(buffer, baseName, format) {
  const safe = baseName.replace(/[^\w\-]+/g, "_").slice(0, 48) || "track-nova";
  if (format === "mp3") {
    await downloadMp3(buffer, `${safe}.mp3`);
    return;
  }
  downloadWav(buffer, `${safe}.wav`);
}

/** @param {AudioBuffer} buffer @param {string} filename */
export function downloadWav(buffer, filename) {
  const blob = new Blob([encodeWav(buffer)], { type: "audio/wav" });
  triggerDownload(blob, filename.endsWith(".wav") ? filename : `${filename}.wav`);
}

/** @param {AudioBuffer} buffer @param {string} filename @param {number} kbps */
export async function downloadMp3(buffer, filename, kbps = 192) {
  const lame = await loadLame();
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const encoder = new lame.Mp3Encoder(channels, rate, kbps);
  const left = floatTo16(buffer.getChannelData(0));
  const right = channels > 1 ? floatTo16(buffer.getChannelData(1)) : left;
  const block = 1152;
  const chunks = [];
  for (let offset = 0; offset < left.length; offset += block) {
    const leftChunk = left.subarray(offset, offset + block);
    const rightChunk = right.subarray(offset, offset + block);
    const encoded =
      channels > 1 ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));
  const blob = new Blob(chunks, { type: "audio/mpeg" });
  triggerDownload(blob, filename.endsWith(".mp3") ? filename : `${filename}.mp3`);
}

/** @returns {Promise<{ Mp3Encoder: new (ch: number, rate: number, kbps: number) => { encodeBuffer: Function, flush: Function } }>} */
let lameLoadPromise;
function loadLame() {
  if (globalThis.lamejs?.Mp3Encoder) return Promise.resolve(globalThis.lamejs);
  if (lameLoadPromise) return lameLoadPromise;
  lameLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lamejs="1"]');
    if (existing) {
      existing.addEventListener("load", () => finish(resolve, reject), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar encoder MP3.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = LAME_SCRIPT;
    script.async = true;
    script.dataset.lamejs = "1";
    script.onload = () => finish(resolve, reject);
    script.onerror = () => reject(new Error("Falha ao carregar encoder MP3 (arquivo local)."));
    document.head.appendChild(script);
  });
  return lameLoadPromise;
}

function finish(resolve, reject) {
  if (globalThis.lamejs?.Mp3Encoder) resolve(globalThis.lamejs);
  else reject(new Error("Encoder MP3 indisponível. Use WAV ou FFmpeg no guia de stems."));
}

function floatTo16(channel) {
  const out = new Int16Array(channel.length);
  for (let index = 0; index < channel.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channel[index]));
    out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const rate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const array = new ArrayBuffer(44 + dataSize);
  const view = new DataView(array);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = [];
  for (let channel = 0; channel < channels; channel += 1) channelData.push(buffer.getChannelData(channel));
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return array;
}

function writeString(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
