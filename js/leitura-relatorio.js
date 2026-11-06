/**
 * JSON da leitura de arquivo: ficha com cada medida e a qualidade dela.
 * A ficha descreve a mix. Não devolve stems nem a obra.
 */

import { CHAIRS } from "./clonagem-model.js";
import { buildElementInventory } from "./inventario-elementos.js";
import { mixdown, scanOverview } from "./leitura-audio-core.js";

const FAIXAS = ["sub", "grave", "corpo", "presenca"];

/**
 * Lê um buffer já decodificado (WAV ou MP3 que o navegador tenha aberto) e devolve o JSON da leitura.
 * @param {{ nome: string, buffer: { duration: number, sampleRate: number, numberOfChannels: number, length: number, getChannelData: (channel: number) => Float32Array } }} input
 * Arquivo em PCM e o nome mostrado na ficha.
 * @returns {Promise<object>} Relatório serializável, o mesmo contrato do painel de leitura.
 */
export async function lerMixDecodificada(input) {
  const { nome, buffer } = input;
  const mono = mixdown(buffer);
  const overview = await scanOverview(mono, buffer.sampleRate, buffer);
  const layers = new Map([
    ["percussivo", { share: overview.ataque }],
    ["harmonico", { share: overview.harmonia }],
  ]);
  const inventario = buildElementInventory({
    overview,
    mono,
    rate: buffer.sampleRate,
    duration: buffer.duration,
    layers,
  });
  return montarLeituraJson({ nome, buffer, overview, inventario });
}

/**
 * Monta o objeto que o laboratório grava em `data-report` e em `window.__vibedjLastAnalise`.
 * @param {{
 *   nome?: string,
 *   buffer?: { duration?: number, sampleRate?: number, numberOfChannels?: number } | null,
 *   overview?: object,
 *   inventario?: object | null,
 *   trecho?: { inicio_segundos: number, duracao_segundos: number } | null,
 * }} input Medidas já calculadas na leitura do arquivo.
 * @returns {object}
 */
export function montarLeituraJson(input) {
  const overview = input.overview || {};
  const buffer = input.buffer || null;
  const ficha = montarFicha(overview, buffer, input.inventario);
  return {
    arquivo: input.nome || "",
    origem: "arquivo local, lido só neste navegador",
    aviso: "Estimativas de mix. Não são as faixas da sessão e não formam uma cópia da obra.",
    duracao_segundos: round(buffer && buffer.duration ? buffer.duration : 0, 2),
    amostragem_hz: buffer && buffer.sampleRate ? buffer.sampleRate : 0,
    canais: buffer && buffer.numberOfChannels ? buffer.numberOfChannels : 0,
    bpm_estimado: overview.bpm ? round(overview.bpm, 1) : null,
    centroide_hz: overview.centroid ? Math.round(overview.centroid) : null,
    lados_energia: overview.side != null ? round(overview.side, 3) : null,
    tonalidade: ficha.tonalidade.nome,
    camelot: ficha.camelot.codigo,
    confianca: ficha.confianca.percentual,
    faixas: overview.bands || [],
    ataque_harmonia: {
      ataque: round(overview.ataque || 0, 3),
      harmonia: round(overview.harmonia || 0, 3),
    },
    inventario_elementos: input.inventario || null,
    trecho: input.trecho || null,
    qualidade: ficha.qualidade,
    ficha,
  };
}

/**
 * Reúne cada medida da leitura com a qualidade dela, para o teste e o painel lerem o mesmo JSON.
 * @param {object} overview Resultado de `scanOverview` ou da varredura da bancada.
 * @param {{ duration?: number, sampleRate?: number, numberOfChannels?: number } | null} buffer Áudio decodificado.
 * @param {object | null | undefined} inventario Inventário de kick, clap, hat e os demais papéis.
 * @returns {object}
 */
function montarFicha(overview, buffer, inventario) {
  const duracao = buffer && buffer.duration ? buffer.duration : 0;
  const hz = buffer && buffer.sampleRate ? buffer.sampleRate : 0;
  const canais = buffer && buffer.numberOfChannels ? buffer.numberOfChannels : 0;
  const bandas = Object.fromEntries((overview.bands || []).map((banda) => [banda.id, banda.share || 0]));
  const ataque = overview.ataque || 0;
  const harmonia = overview.harmonia || 0;
  const lado = overview.side || 0;
  const centro = 1 - lado;
  const tom = overview.tonalidade || { nome: null, camelot: null, confianca: 0 };
  const bpmConfianca = overview.bpm_confianca || 0;

  const duracaoCampo = campo(round(duracao, 2), duracao >= 4 ? "alta" : "baixa", { segundos: round(duracao, 2) });
  const amostragemCampo = campo(hz, hz >= 44100 ? "alta" : "baixa", { hz });
  const canaisCampo = campo(canais, canais >= 2 ? "alta" : "baixa", {
    valor: canais,
    rotulo: canais === 1 ? "Mono" : `${canais} canais`,
  });
  const andamentoCampo = campo(overview.bpm ? round(overview.bpm, 1) : null, qualidadeAndamento(overview.bpm, bpmConfianca), {
    bpm: overview.bpm ? round(overview.bpm, 1) : null,
    nota: overview.note || null,
    confianca: Math.round(bpmConfianca * 100),
  });
  const brilhoCampo = campo(
    overview.centroid ? Math.round(overview.centroid) : null,
    overview.centroid > 400 && overview.centroid < 8000 ? "alta" : "baixa",
    { centroide_hz: overview.centroid ? Math.round(overview.centroid) : null },
  );
  const ladosCampo = campo(round(lado, 3), lado >= 0.12 && lado <= 0.72 ? "alta" : "baixa", {
    energia: round(lado, 3),
    percentual: Math.round(lado * 100),
  });
  const tonalidadeCampo = campo(tom.nome, tom.confianca >= 70 && tom.nome ? "alta" : "baixa", {
    nome: tom.nome,
    modo: tom.modo || null,
  });
  const camelotCampo = campo(tom.camelot, tom.confianca >= 70 && /^([1-9]|1[0-2])[AB]$/.test(tom.camelot || "") ? "alta" : "baixa", {
    codigo: tom.camelot,
  });
  const confiancaCampo = campo(tom.confianca || 0, tom.confianca >= 70 ? "alta" : "baixa", {
    percentual: tom.confianca || 0,
  });

  const energia = {};
  for (const id of ["sub", "grave", "corpo", "presenca", "ar"]) {
    const share = bandas[id] || 0;
    energia[id] = campo(round(share, 3), share >= 0.08 ? "alta" : "baixa", {
      id,
      share: round(share, 3),
      percentual: Math.round(share * 100),
    });
  }

  const imagem = {
    centro: campo(round(centro, 3), centro >= 0.2 ? "alta" : "baixa", { share: round(centro, 3), percentual: Math.round(centro * 100) }),
    lados: campo(round(lado, 3), lado >= 0.12 ? "alta" : "baixa", { share: round(lado, 3), percentual: Math.round(lado * 100) }),
  };
  const ataqueHarmonia = {
    ataque: campo(round(ataque, 3), ataque >= 0.18 && ataque <= 0.82 ? "alta" : "baixa", { share: round(ataque, 3), percentual: Math.round(ataque * 100) }),
    harmonia: campo(round(harmonia, 3), harmonia >= 0.18 && harmonia <= 0.82 ? "alta" : "baixa", { share: round(harmonia, 3), percentual: Math.round(harmonia * 100) }),
  };
  const harmonico = campo(round(harmonia, 3), harmonia >= 0.18 ? "alta" : "baixa", { share: round(harmonia, 3), percentual: Math.round(harmonia * 100) });

  const elementos = {};
  for (const chair of CHAIRS) {
    const el = inventario && inventario.elementos ? inventario.elementos[chair.id] : null;
    elementos[chair.id] = elementoCampo(el, chair.label);
  }

  const blocos = [
    duracaoCampo,
    amostragemCampo,
    canaisCampo,
    andamentoCampo,
    brilhoCampo,
    ladosCampo,
    tonalidadeCampo,
    camelotCampo,
    confiancaCampo,
    imagem.centro,
    imagem.lados,
    ataqueHarmonia.ataque,
    ataqueHarmonia.harmonia,
    harmonico,
    ...FAIXAS.map((id) => energia[id]),
    ...CHAIRS.map((chair) => elementos[chair.id]),
  ];
  const qualidade = blocos.every((bloco) => bloco.qualidade === "alta") ? "alta" : "revisar";

  return {
    duracao: duracaoCampo,
    amostragem: amostragemCampo,
    canais: canaisCampo,
    andamento: andamentoCampo,
    brilho: brilhoCampo,
    lados: ladosCampo,
    tonalidade: tonalidadeCampo,
    camelot: camelotCampo,
    confianca: confiancaCampo,
    energia_por_faixa: energia,
    imagem_estereo: imagem,
    ataque_harmonia: ataqueHarmonia,
    sub: energia.sub,
    grave: energia.grave,
    corpo: energia.corpo,
    presenca: energia.presenca,
    harmonico,
    elementos,
    qualidade,
  };
}

/**
 * Copia um papel do inventário e marca qualidade alta só quando a presença, a confiança e a leitura estão completas.
 * @param {object | null} el Elemento estimado, ou null se a cadeira não veio no inventário.
 * @param {string} rotulo Nome da cadeira quando o elemento falta.
 * @returns {object}
 */
function elementoCampo(el, rotulo) {
  if (!el) {
    return { rotulo, presenca: null, confianca: 0, leitura: null, faixa_hz: null, funcao: null, qualidade: "baixa" };
  }
  const completa = Boolean(el.leitura && el.faixa_hz && el.funcao);
  const qualidade = el.presenca === "alta" && el.confianca >= 70 && completa ? "alta" : "baixa";
  return {
    rotulo: el.rotulo || rotulo,
    presenca: el.presenca,
    confianca: el.confianca,
    leitura: el.leitura,
    faixa_hz: el.faixa_hz,
    funcao: el.funcao,
    transplantavel: el.transplantavel,
    qualidade,
  };
}

/**
 * Monta um campo da ficha com o valor medido e a qualidade dessa medida.
 * @param {number | string | null} valor Leitura principal do campo.
 * @param {"alta" | "baixa"} qualidade Alta quando a medida fecha o critério do relatório.
 * @param {object} extra Detalhes que o JSON também expõe, como bpm ou share.
 * @returns {object}
 */
function campo(valor, qualidade, extra) {
  return { valor, qualidade, ...extra };
}

/**
 * Classifica o andamento. A confiança compara o pulso vencedor com o próximo tempo distante.
 * @param {number | undefined} bpm Batidas por minuto estimadas.
 * @param {number} confianca Margem de 0 a 1 contra o tempo concorrente.
 * @returns {"alta" | "baixa"}
 */
function qualidadeAndamento(bpm, confianca) {
  if (!bpm || bpm < 80 || bpm > 180) return "baixa";
  if (confianca >= 0.3) return "alta";
  return "baixa";
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
