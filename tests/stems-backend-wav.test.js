import assert from "node:assert/strict";
import test from "node:test";

import { decodificarWavMono } from "../js/stems-backend.js";

/**
 * WAV PCM 24 bits estéreo, o mesmo layout que o backend grava.
 * @param {number[][]} frames pares [esquerda, direita] em inteiro de 24 bits
 * @param {number} rate
 */
function wav24(frames, rate = 44100) {
  const data = frames.length * 6;
  const buffer = new ArrayBuffer(44 + data);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 6, true);
  view.setUint16(32, 6, true);
  view.setUint16(34, 24, true);
  write(36, "data");
  view.setUint32(40, data, true);
  let pos = 44;
  for (const [left, right] of frames) {
    gravar24(view, pos, left);
    gravar24(view, pos + 3, right);
    pos += 6;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * @param {DataView} view
 * @param {number} offset
 * @param {number} sample
 */
function gravar24(view, offset, sample) {
  const valor = sample < 0 ? sample + 0x1000000 : sample;
  view.setUint8(offset, valor & 0xff);
  view.setUint8(offset + 1, (valor >> 8) & 0xff);
  view.setUint8(offset + 2, (valor >> 16) & 0xff);
}

test("WAV 24 bits estéreo vira mono sem o teto de 80 MB da mix", async () => {
  const cheio = 8388607;
  const blob = wav24([
    [cheio, cheio],
    [-cheio, -cheio],
    [cheio, -cheio],
  ]);
  const { mono, rate } = await decodificarWavMono(blob);
  assert.equal(rate, 44100);
  assert.equal(mono.length, 3);
  assert.ok(Math.abs(mono[0] - cheio / 8388608) < 1e-6);
  assert.ok(Math.abs(mono[1] + cheio / 8388608) < 1e-6);
  assert.ok(Math.abs(mono[2]) < 1e-6);
});
