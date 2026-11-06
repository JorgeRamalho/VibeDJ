import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMUCS_AMOSTRAS,
  DEMUCS_SOBREPOSICAO,
  DRUMSEP_AMOSTRAS,
  DRUMSEP_FONTES,
  DRUMSEP_QUADROS,
  STEM_PARA_CADEIRA,
  amostrasDezesseis,
  bpmDaJanela,
  idaEVoltaHibrida,
  janelaTrapezio,
  planoOverlap,
  preencherCadeirasVazias,
  primeiroAtaque,
  quadrosHibridos,
  reamostrar,
  recortarDezesseisCompassos,
  somarOverlap,
} from "../js/stem-separa.js";

test("BPM fora da faixa de leitura cai no andamento de estudo", () => {
  assert.equal(bpmDaJanela(124), 124);
  assert.equal(bpmDaJanela(40), 124);
  assert.equal(bpmDaJanela(null), 124);
});

test("dezesseis compassos a 124 BPM duram cerca de 31 segundos", () => {
  const amostras = amostrasDezesseis(44100, 124);
  assert.ok(Math.abs(amostras / 44100 - 16 * 4 * (60 / 124)) < 0.02);
});

test("o recorte começa no ataque e ignora o silêncio da frente", () => {
  const rate = 1000;
  const left = new Float32Array(rate * 4);
  const right = new Float32Array(rate * 4);
  left[1500] = 1;
  right[1500] = 1;
  const recorte = recortarDezesseisCompassos(left, right, rate, 120);
  assert.ok(recorte.inicio >= 1400 && recorte.inicio <= 1500);
  assert.equal(recorte.left.length, left.length - recorte.inicio);
  assert.ok(Math.max(...recorte.left) === 1);
});

test("ataque em silêncio fica no início", () => {
  assert.equal(primeiroAtaque(new Float32Array(1000), 1000), 0);
});

test("reamostragem dobra o comprimento quando a taxa dobra", () => {
  const input = Float32Array.from([0, 1, 0, -1]);
  const out = reamostrar(input, 100, 200);
  assert.equal(out.length, 8);
  assert.ok(Math.abs(out[0]) < 1e-6);
  assert.ok(out[2] > 0.4);
});

test("overlap-add de um sinal constante reconstrói o sinal", () => {
  const total = 1000;
  const segment = 400;
  const overlap = 100;
  const { blocos } = planoOverlap(total, segment, overlap);
  const partes = Array.from({ length: blocos }, () => {
    const chunk = new Float32Array(segment);
    chunk.fill(0.5);
    return chunk;
  });
  const out = somarOverlap(partes, total, segment, overlap);
  for (let index = 1; index < total - 1; index += 1) {
    assert.ok(Math.abs(out[index] - 0.5) < 1e-5, `amostra ${index} = ${out[index]}`);
  }
});

test("a janela do HT-Demucs sobe de zero e desce até zero", () => {
  const window = janelaTrapezio(DEMUCS_AMOSTRAS, DEMUCS_SOBREPOSICAO);
  assert.equal(window[0], 0);
  assert.ok(window[DEMUCS_SOBREPOSICAO] > 0.99);
  assert.equal(window[DEMUCS_AMOSTRAS - 1], 0);
});

test("DrumSep pede 1723 quadros em 1764000 amostras", () => {
  assert.equal(quadrosHibridos(DRUMSEP_AMOSTRAS), DRUMSEP_QUADROS);
  assert.equal(DRUMSEP_FONTES.join(","), "kick,snare,cymbals,toms");
});

test("cadeira já anexada não é substituída", () => {
  const manual = { mono: Float32Array.from([0.2]), rate: 44100, name: "meu-kick.wav" };
  const separados = {
    kick: { left: Float32Array.from([1]), right: Float32Array.from([1]) },
    snare: { left: Float32Array.from([0.4]), right: Float32Array.from([0.4]) },
    bass: { left: Float32Array.from([0.3]), right: Float32Array.from([0.1]) },
  };
  const resultado = preencherCadeirasVazias({ kick: manual }, separados, 44100);
  assert.equal(resultado.stems.kick, manual);
  assert.deepEqual(resultado.mantidas, ["kick"]);
  assert.ok(resultado.preenchidas.includes("clap"));
  assert.ok(resultado.preenchidas.includes("bass"));
  assert.equal(resultado.stems.clap.name, "Separado · clap");
  assert.equal(STEM_PARA_CADEIRA.other, undefined);
  assert.ok(Math.abs(resultado.stems.bass.mono[0] - 0.2) < 1e-6);
});

test("ida e volta do espectrograma híbrido preserva um seno", () => {
  const length = 8192;
  const canal = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    canal[index] = 0.4 * Math.sin((2 * Math.PI * 440 * index) / 44100);
  }
  const volta = idaEVoltaHibrida(canal);
  let erro = 0;
  let energia = 0;
  const margem = 600;
  for (let index = margem; index < length - margem; index += 1) {
    const delta = volta[index] - canal[index];
    erro += delta * delta;
    energia += canal[index] * canal[index];
  }
  assert.ok(erro / energia < 0.02, `erro relativo ${erro / energia}`);
});
