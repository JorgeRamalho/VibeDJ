import assert from "node:assert/strict";
import { writeFile, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ACCEPT } from "../js/leitura-audio-core.js";
import { lerMixDecodificada } from "../js/leitura-relatorio.js";

const RATE = 44100;
const BPM = 124;

/**
 * Gera um groove estéreo de estudo, com kick, palma, hat, baixo em lá,
 * stab, shaker, vocal central e largura fora de fase para a imagem.
 * @returns {{ left: Float32Array, right: Float32Array, rate: number }}
 */
function criarGroove() {
  const beat = 60 / BPM;
  const total = Math.floor(beat * 16 * RATE);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  for (let index = 0; index < 16; index += 1) {
    const start = index * beat;
    const step = index % 4;
    adicionarKick(left, right, start);
    adicionarBaixo(left, right, start, beat, step);
    if (step === 1 || step === 3) adicionarClap(left, right, start);
    adicionarHats(left, right, start, beat);
    adicionarCorpo(left, right, start, beat);
    if (step === 1 || step === 3) adicionarStab(left, right, start + beat * 0.5);
    adicionarVocal(left, right, start, beat);
    adicionarPercussao(left, right, start, beat);
  }
  adicionarLargura(left, right);
  adicionarArEstavel(left, right);
  adicionarPresenca(left, right);
  normalizar(left, right);
  return { left, right, rate: RATE };
}

test("a leitura de arquivo aceita mp3 e wav", () => {
  assert.match(ACCEPT, /\.mp3/);
  assert.match(ACCEPT, /\.wav/);
});

test("ao abrir a mix, a leitura devolve o JSON do inventário em alta qualidade", async () => {
  const groove = criarGroove();
  const wav = codificarWav(groove.left, groove.right, groove.rate);
  const pasta = await mkdtemp(path.join(tmpdir(), "vibedj-leitura-"));
  const arquivo = path.join(pasta, "groove-estudo.wav");
  await writeFile(arquivo, wav);
  const lido = await readFile(arquivo);
  const buffer = decodificarWav(lido);
  const relatorio = await lerMixDecodificada({ nome: "groove-estudo.wav", buffer });
  const texto = JSON.stringify(relatorio, null, 2);
  const json = JSON.parse(texto);

  assert.equal(json.arquivo, "groove-estudo.wav");
  assert.equal(json.qualidade, "alta", resumir(json));
  assert.equal(json.tonalidade, "Lá menor", resumir(json));
  assert.equal(json.camelot, "8A", resumir(json));
  assert.ok(json.bpm_estimado >= 118 && json.bpm_estimado <= 130, resumir(json));

  const ficha = json.ficha;
  assert.equal(ficha.qualidade, "alta");
  assert.equal(ficha.duracao.qualidade, "alta");
  assert.ok(ficha.duracao.segundos > 4);
  assert.equal(ficha.amostragem.qualidade, "alta");
  assert.equal(ficha.amostragem.hz, 44100);
  assert.equal(ficha.canais.qualidade, "alta");
  assert.equal(ficha.canais.valor, 2);
  assert.equal(ficha.andamento.qualidade, "alta");
  assert.equal(ficha.brilho.qualidade, "alta");
  assert.equal(typeof ficha.brilho.centroide_hz, "number");
  assert.equal(ficha.lados.qualidade, "alta");
  assert.equal(ficha.tonalidade.qualidade, "alta");
  assert.equal(ficha.tonalidade.nome, "Lá menor");
  assert.equal(ficha.camelot.qualidade, "alta");
  assert.equal(ficha.camelot.codigo, "8A");
  assert.equal(ficha.confianca.qualidade, "alta");
  assert.ok(ficha.confianca.percentual >= 70);

  for (const id of ["sub", "grave", "corpo", "presenca"]) {
    assert.equal(ficha.energia_por_faixa[id].qualidade, "alta", id);
    assert.equal(ficha[id].qualidade, "alta", id);
  }
  assert.equal(ficha.imagem_estereo.centro.qualidade, "alta");
  assert.equal(ficha.imagem_estereo.lados.qualidade, "alta");
  assert.equal(ficha.ataque_harmonia.ataque.qualidade, "alta", resumir(json));
  assert.equal(ficha.ataque_harmonia.harmonia.qualidade, "alta", resumir(json));
  assert.equal(ficha.harmonico.qualidade, "alta");

  const esperado = [
    ["kick", "Kick"],
    ["clap", "Clap"],
    ["hat", "Hi-hat"],
    ["bass", "Baixo"],
    ["stab", "Stab"],
    ["fx", "Transição"],
    ["perc", "Percussão"],
    ["vocal", "Vocal / chop"],
  ];
  for (const [id, rotulo] of esperado) {
    const elemento = ficha.elementos[id];
    assert.equal(elemento.rotulo, rotulo, id);
    assert.equal(elemento.qualidade, "alta", `${id} ${JSON.stringify(elemento)}`);
    assert.equal(elemento.presenca, "alta", id);
    assert.ok(elemento.confianca >= 70, id);
    assert.ok(elemento.leitura, id);
    assert.ok(elemento.faixa_hz, id);
    assert.equal(json.inventario_elementos.elementos[id].presenca, "alta", id);
  }
});

function resumir(json) {
  const ficha = json.ficha;
  const bandas = Object.fromEntries(
    ["sub", "grave", "corpo", "presenca", "ar"].map((id) => [id, ficha.energia_por_faixa[id].share]),
  );
  const elementos = Object.fromEntries(
    Object.entries(ficha.elementos).map(([id, elemento]) => [id, `${elemento.presenca}/${elemento.confianca}`]),
  );
  return JSON.stringify({
    bpm: ficha.andamento.bpm,
    bpmConfianca: ficha.andamento.confianca,
    tom: ficha.tonalidade.nome,
    camelot: ficha.camelot.codigo,
    confianca: ficha.confianca.percentual,
    brilho: ficha.brilho.centroide_hz,
    lados: ficha.lados.energia,
    ataque: ficha.ataque_harmonia.ataque.share,
    harmonia: ficha.ataque_harmonia.harmonia.share,
    bandas,
    elementos,
  });
}

function adicionarKick(left, right, t0) {
  const amostras = Math.floor(0.09 * RATE);
  const inicio = Math.floor(t0 * RATE);
  for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
    const tempo = index / RATE;
    const corpo = Math.sin(2 * Math.PI * 55 * tempo) * Math.exp(-tempo * 28) * 2.6;
    const clique = index < 50 ? (ruido(inicio + index) * 2 - 1) * Math.exp(-tempo * 360) * 0.12 : 0;
    const amostra = corpo + clique;
    left[inicio + index] += amostra;
    right[inicio + index] += amostra;
  }
}

function adicionarBaixo(left, right, t0, beat, step) {
  const freq = step === 2 ? 65.41 : 55;
    const amostras = Math.floor(beat * 0.55 * RATE);
  const inicio = Math.floor((t0 + 0.07) * RATE);
  for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
    const tempo = index / RATE;
    const envelope = Math.min(1, tempo / 0.008);
    const amostra = (Math.sin(2 * Math.PI * freq * tempo) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * tempo) * 0.48) * envelope;
    left[inicio + index] += amostra;
    right[inicio + index] += amostra;
  }
}

function adicionarClap(left, right, t0) {
  for (const atraso of [0, 0.011, 0.022]) {
    const amostras = Math.floor(0.05 * RATE);
    const inicio = Math.floor((t0 + atraso) * RATE);
    for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
      const tempo = index / RATE;
      const ruidoLocal = ruido(inicio + index + 17) * 2 - 1;
      const amostra = ruidoLocal * Math.sin(2 * Math.PI * 1680 * tempo) * Math.exp(-tempo * 42) * 0.48;
      left[inicio + index] += amostra;
      right[inicio + index] += amostra;
    }
  }
}

function adicionarHats(left, right, t0, beat) {
  for (let step = 0; step < 4; step += 1) {
    const amostras = Math.floor(0.03 * RATE);
    const inicio = Math.floor((t0 + (beat * step) / 4) * RATE);
    const aberto = step === 2;
    for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
      const tempo = index / RATE;
      const ruidoLocal = ruido(inicio + index + 41) * 2 - 1;
      const amostra = ruidoLocal * Math.sin(2 * Math.PI * 9600 * tempo) * Math.exp(-tempo * (aberto ? 26 : 78)) * (aberto ? 0.08 : 0.05);
      left[inicio + index] += amostra;
      right[inicio + index] += amostra;
    }
  }
}

function adicionarStab(left, right, t0) {
  const notas = [220, 261.63, 329.63, 440];
  const amostras = Math.floor(0.22 * RATE);
  const inicio = Math.floor(t0 * RATE);
  for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
    const tempo = index / RATE;
    let soma = 0;
    for (const freq of notas) soma += Math.sin(2 * Math.PI * freq * tempo);
    const amostra = (soma / notas.length) * Math.exp(-tempo * 7) * 0.55;
    left[inicio + index] += amostra;
    right[inicio + index] += amostra;
  }
}

function adicionarCorpo(left, right, t0, beat) {
  const notas = [220, 329.63];
  const amostras = Math.floor(beat * 0.96 * RATE);
  const inicio = Math.floor(t0 * RATE);
  for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
    const tempo = index / RATE;
    let soma = 0;
    for (const freq of notas) soma += Math.sin(2 * Math.PI * freq * tempo);
    const amostra = (soma / notas.length) * 0.26;
    left[inicio + index] += amostra;
    right[inicio + index] += amostra;
  }
}

function adicionarVocal(left, right, t0, beat) {
  const notas = [880, 1320, 1760];
  const amostras = Math.floor(beat * 0.9 * RATE);
  const inicio = Math.floor(t0 * RATE);
  for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
    const tempo = index / RATE;
    const envelope = Math.sin(Math.PI * Math.min(1, tempo / (beat * 0.9)));
    let soma = 0;
    notas.forEach((freq, ordem) => {
      soma += Math.sin(2 * Math.PI * freq * tempo) / (ordem + 1);
    });
    const amostra = soma * envelope * 0.36;
    left[inicio + index] += amostra;
    right[inicio + index] += amostra;
  }
}

function adicionarPercussao(left, right, t0, beat) {
  for (let step = 0; step < 4; step += 1) {
    const amostras = Math.floor(0.04 * RATE);
    const inicio = Math.floor((t0 + (beat * step) / 4) * RATE);
    for (let index = 0; index < amostras && inicio + index < left.length; index += 1) {
      const tempo = index / RATE;
      const ruidoLocal = ruido(inicio + index + 73) * 2 - 1;
      const amostra = ruidoLocal * Math.sin(2 * Math.PI * 3400 * tempo) * Math.exp(-tempo * 36) * 0.08;
      left[inicio + index] += amostra;
      right[inicio + index] += amostra;
    }
  }
}

function adicionarArEstavel(left, right) {
  const notas = [];
  for (let freq = 4800; freq <= 11000; freq += 450) notas.push(freq);
  for (let index = 0; index < left.length; index += 1) {
    const tempo = index / RATE;
    let soma = 0;
    for (const freq of notas) soma += Math.sin(2 * Math.PI * freq * tempo);
    const amostra = (soma / notas.length) * 0.34;
    left[index] += amostra;
    right[index] += amostra;
  }
}

function adicionarPresenca(left, right) {
  const notas = [1046.5, 1174.7, 1318.5, 1760];
  for (let index = 0; index < left.length; index += 1) {
    const tempo = index / RATE;
    let soma = 0;
    for (const freq of notas) soma += Math.sin(2 * Math.PI * freq * tempo);
    const amostra = (soma / notas.length) * 0.16;
    left[index] += amostra;
    right[index] += amostra;
  }
}

function adicionarLargura(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    const amostra = (ruido(index + 101) * 2 - 1) * Math.sin((2 * Math.PI * 10500 * index) / RATE) * 1.45;
    left[index] += amostra;
    right[index] -= amostra;
  }
}

function normalizar(left, right) {
  let pico = 0;
  for (let index = 0; index < left.length; index += 1) {
    pico = Math.max(pico, Math.abs(left[index]), Math.abs(right[index]));
  }
  const ganho = pico > 0 ? 0.89 / pico : 1;
  for (let index = 0; index < left.length; index += 1) {
    left[index] *= ganho;
    right[index] *= ganho;
  }
}

function ruido(index) {
  const valor = Math.sin(index * 12.9898) * 43758.5453;
  return valor - Math.floor(valor);
}

/**
 * Grava PCM 16-bit estéreo para o teste abrir como um WAV de verdade.
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @param {number} rate
 * @returns {Buffer}
 */
function codificarWav(left, right, rate) {
  const amostras = left.length;
  const dados = amostras * 4;
  const arquivo = Buffer.alloc(44 + dados);
  arquivo.write("RIFF", 0);
  arquivo.writeUInt32LE(36 + dados, 4);
  arquivo.write("WAVE", 8);
  arquivo.write("fmt ", 12);
  arquivo.writeUInt32LE(16, 16);
  arquivo.writeUInt16LE(1, 20);
  arquivo.writeUInt16LE(2, 22);
  arquivo.writeUInt32LE(rate, 24);
  arquivo.writeUInt32LE(rate * 4, 28);
  arquivo.writeUInt16LE(4, 32);
  arquivo.writeUInt16LE(16, 34);
  arquivo.write("data", 36);
  arquivo.writeUInt32LE(dados, 40);
  for (let index = 0; index < amostras; index += 1) {
    arquivo.writeInt16LE(pcm16(left[index]), 44 + index * 4);
    arquivo.writeInt16LE(pcm16(right[index]), 46 + index * 4);
  }
  return arquivo;
}

function pcm16(amostra) {
  const limitada = Math.max(-1, Math.min(1, amostra));
  return Math.round(limitada * 32767);
}

/**
 * Lê o WAV gerado de volta para o mesmo formato que o navegador entrega depois do decode.
 * @param {Buffer} arquivo
 */
function decodificarWav(arquivo) {
  const canais = arquivo.readUInt16LE(22);
  const rate = arquivo.readUInt32LE(24);
  const bits = arquivo.readUInt16LE(34);
  assert.equal(canais, 2);
  assert.equal(bits, 16);
  const dados = arquivo.readUInt32LE(40);
  const frames = dados / 4;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    left[index] = arquivo.readInt16LE(44 + index * 4) / 32768;
    right[index] = arquivo.readInt16LE(46 + index * 4) / 32768;
  }
  return {
    length: frames,
    sampleRate: rate,
    numberOfChannels: 2,
    duration: frames / rate,
    getChannelData(channel) {
      return channel === 0 ? left : right;
    },
  };
}
