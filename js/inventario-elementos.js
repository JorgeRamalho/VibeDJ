/**
 * Inventário heurístico de elementos (kick, clap, hat, …) a partir da leitura de áudio.
 * Não separa stems reais — estima papéis para clonagem / transplante.
 */

import { CHAIRS } from "./clonagem-model.js";

const NFFT = 2048;

/**
 * @param {{
 *   overview: {
 *     bpm?: number,
 *     bands?: { id: string, label?: string, share: number }[],
 *     side?: number,
 *     centroid?: number,
 *     note?: string,
 *     key?: { nome?: string, camelot?: string, confianca?: number, nota?: string, vizinhos?: string[], relativo?: string, alternativa?: { camelot?: string, nome?: string } },
 *   },
 *   mono: Float32Array,
 *   rate: number,
 *   duration: number,
 *   canais?: number,
 *   layers?: Map<string, { share: number, hint?: string }> | Record<string, { share: number }>,
 *   elementLayers?: Record<string, { qualidade?: number, source?: string }>,
 * }} input
 */
export function buildElementInventory(input) {
  const { overview, mono, rate, duration, layers, elementLayers } = input;
  const bandShare = (id) => overview.bands?.find((b) => b.id === id)?.share ?? 0;
  const bpm = overview.bpm || 0;
  const fourOnFloor = bpm > 0 ? scoreFourOnFloor(mono, rate, bpm) : 0;
  const percHarm = percussiveHarmonicRatio(layers);
  const side = overview.side ?? 0;
  const key = overview.key || null;
  const canais = input.canais ?? null;

  const ctx = {
    bandShare,
    bpm,
    fourOnFloor,
    percHarm,
    side,
    centroid: overview.centroid ?? 0,
    duration,
  };

  const elementos = Object.fromEntries(
    CHAIRS.map((chair) => [chair.id, describeElement(chair.id, chair.label, ctx, elementLayers?.[chair.id])]),
  );

  const bands = (overview.bands || []).map((band) => ({
    id: band.id,
    label: band.label || band.id,
    share: round4(band.share),
  }));

  return {
    tipo: "inventario-elementos-vibedj",
    versao: 2,
    duracao_segundos: round2(duration),
    duracao: formatClock(duration),
    amostragem_hz: rate || null,
    amostragem: rate ? `${rate} Hz` : null,
    canais,
    canais_rotulo: canais == null ? null : canais === 1 ? "Mono" : `${canais} canais`,
    andamento: bpm ? `${round1(bpm)} BPM` : null,
    bpm_estimado: bpm ? round1(bpm) : null,
    brilho_hz: overview.centroid ? Math.round(overview.centroid) : null,
    brilho: overview.centroid ? `${Math.round(overview.centroid)} Hz` : null,
    lados: round3(side),
    lados_rotulo: `${Math.round(side * 100)}%`,
    tonalidade: key?.nome ?? null,
    camelot: key?.camelot ?? null,
    confianca: key?.confianca ?? null,
    tonalidade_camelot: key,
    energia_por_faixa: bands,
    imagem_estereo: {
      centro: round3(1 - side),
      lados: round3(side),
    },
    ataque_harmonia_trecho: {
      ataque: round3(percHarm.percussive),
      harmonia: round3(percHarm.harmonic),
    },
    sub: round4(bandShare("sub")),
    grave: round4(bandShare("grave")),
    corpo: round4(bandShare("corpo")),
    presenca: round4(bandShare("presenca")),
    ar: round4(bandShare("ar")),
    harmonico: round3(percHarm.harmonic),
    leitura_andamento: overview.note || null,
    aviso:
      "Cada campo é estimativa de mix estéreo. Use para marcar a grade e planejar transplante de papéis — não substitui stems nem MIDI.",
    elementos,
  };
}

/** Bloco plano para leitura do JSON — nomes alinhados à bancada. */
export function leituraChecklist(inventario) {
  const el = inventario?.elementos || {};
  return {
    duracao: inventario?.duracao ?? null,
    amostragem: inventario?.amostragem ?? null,
    canais: inventario?.canais_rotulo ?? inventario?.canais ?? null,
    andamento: inventario?.andamento ?? null,
    brilho: inventario?.brilho ?? null,
    lados: inventario?.lados_rotulo ?? null,
    tonalidade: inventario?.tonalidade ?? null,
    camelot: inventario?.camelot ?? null,
    confianca: inventario?.confianca ?? null,
    energia_por_faixa: inventario?.energia_por_faixa ?? [],
    imagem_estereo: inventario?.imagem_estereo ?? null,
    ataque_harmonia_trecho: inventario?.ataque_harmonia_trecho ?? null,
    sub: inventario?.sub ?? null,
    grave: inventario?.grave ?? null,
    corpo: inventario?.corpo ?? null,
    presenca: inventario?.presenca ?? null,
    harmonico: inventario?.harmonico ?? null,
    kick: el.kick ?? null,
    clap: el.clap ?? null,
    hi_hat: el.hat ?? null,
    baixo: el.bass ?? null,
    stab: el.stab ?? null,
    transicao: el.fx ?? null,
    percussao: el.perc ?? null,
    vocal: el.vocal ?? null,
  };
}

function describeElement(id, label, ctx, elementLayer) {
  switch (id) {
    case "kick":
      return baseElement(label, ctx, {
        energia_sub: ctx.bandShare("sub"),
        pulso_quatro_tempos: ctx.fourOnFloor,
        peso: level(ctx.bandShare("sub") + ctx.bandShare("grave") * 0.35),
        leitura: kickRead(ctx),
        funcao: "Quatro tempos · chão rítmico",
        faixa_hz: "40–100",
      }, elementLayer);
    case "clap":
      return baseElement(label, ctx, {
        energia_presenca: ctx.bandShare("presenca"),
        ataque: ctx.percHarm.percussive,
        peso: level(ctx.bandShare("presenca") * 0.6 + ctx.percHarm.percussive * 0.4),
        leitura: clapRead(ctx),
        funcao: "Tempos 2 e 4 · estalo",
        faixa_hz: "800 Hz–3 kHz",
      }, elementLayer);
    case "hat":
      return baseElement(label, ctx, {
        energia_ar: ctx.bandShare("ar"),
        largura_estereo: ctx.side,
        peso: level(ctx.bandShare("ar") * 0.55 + ctx.side * 0.45),
        leitura: hatRead(ctx),
        funcao: "Contratempo · costura",
        faixa_hz: "6–14 kHz",
      }, elementLayer);
    case "bass":
      return baseElement(label, ctx, {
        energia_grave: ctx.bandShare("grave"),
        energia_sub: ctx.bandShare("sub"),
        harmonicidade: ctx.percHarm.harmonic,
        peso: level(ctx.bandShare("grave") + ctx.bandShare("sub") * 0.5),
        leitura: bassRead(ctx),
        funcao: "Linha grave · dialoga com kick",
        faixa_hz: "60–220",
      }, elementLayer);
    case "stab":
      return baseElement(label, ctx, {
        energia_corpo: ctx.bandShare("corpo"),
        energia_presenca: ctx.bandShare("presenca"),
        harmonicidade: ctx.percHarm.harmonic,
        peso: level(ctx.bandShare("corpo") * 0.45 + ctx.percHarm.harmonic * 0.35),
        leitura: stabRead(ctx),
        funcao: "Acorde curto · harmonia rítmica",
        faixa_hz: "200 Hz–2 kHz",
      }, elementLayer);
    case "fx":
      return baseElement(label, ctx, {
        energia_ar: ctx.bandShare("ar"),
        largura_estereo: ctx.side,
        variacao: scoreFxRise(ctx),
        peso: level(ctx.bandShare("ar") * 0.3 + ctx.side * 0.2 + scoreFxRise(ctx) * 0.5),
        leitura: fxRead(ctx),
        funcao: "Riser · sweep · impacto",
        faixa_hz: "amplo",
      }, elementLayer);
    case "perc":
      return baseElement(label, ctx, {
        ataque: ctx.percHarm.percussive,
        largura_estereo: ctx.side,
        peso: level(ctx.percHarm.percussive * 0.5 + ctx.side * 0.35 + ctx.bandShare("corpo") * 0.15),
        leitura: percRead(ctx),
        funcao: "Shaker · conga · rim",
        faixa_hz: "200 Hz–8 kHz",
      }, elementLayer);
    case "vocal":
      return baseElement(label, ctx, {
        energia_presenca: ctx.bandShare("presenca"),
        centro: 1 - ctx.side,
        harmonicidade: ctx.percHarm.harmonic,
        peso: level(ctx.bandShare("presenca") * 0.4 + (1 - ctx.side) * 0.35 + ctx.percHarm.harmonic * 0.25),
        leitura: vocalRead(ctx),
        funcao: "Voz · chop · spoken",
        faixa_hz: "300 Hz–4 kHz",
      }, elementLayer);
    default: {
      const unknown = id;
      throw new Error(`Elemento desconhecido: ${unknown}`);
    }
  }
}

function baseElement(label, ctx, extra, elementLayer) {
  let confianca = Math.round(clamp(extra.peso === "indetectavel" ? 0.08 : presRank(extra.peso) / 3 + (ctx.bpm > 0 ? 0.2 : 0.05), 0.08, 0.95) * 100);
  if (elementLayer?.qualidade) confianca = Math.round(clamp(confianca * 0.45 + elementLayer.qualidade * 0.55, 8, 98));
  return {
    rotulo: label,
    presenca: extra.peso,
    confianca,
    extracao: elementLayer?.source ?? null,
    qualidade_extracao: elementLayer?.qualidade ?? null,
    funcao: extra.funcao,
    faixa_hz: extra.faixa_hz,
    leitura: extra.leitura,
    transplantavel: extra.peso !== "indetectavel",
    ...extra,
  };
}

function level(score) {
  if (score < 0.06) return "indetectavel";
  if (score < 0.14) return "baixa";
  if (score < 0.26) return "media";
  return "alta";
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(whole / 60);
  const remain = whole % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function kickRead(ctx) {
  if (ctx.bandShare("sub") < 0.06) return "Pouco corpo em sub. Kick pode estar fraco ou filtrado na mix.";
  if (ctx.fourOnFloor > 0.55) return "Pulso grave regular — compatível com four-on-the-floor.";
  return "Energia grave presente, mas o pulso não fecha claro em quatro tempos.";
}

function clapRead(ctx) {
  if (ctx.percHarm.percussive < 0.12) return "Pouco ataque percussivo no trecho; clap pode estar baixo ou ausente.";
  return "Ataques na faixa de presença — possível palma ou snare em 2/4.";
}

function hatRead(ctx) {
  if (ctx.bandShare("ar") < 0.08) return "Ar fraco; hats podem estar filtrados ou ausentes.";
  if (ctx.side > 0.22) return "Brilho lateral — típico de hats e efeitos nos lados.";
  return "Agudos presentes, mais centrados.";
}

function bassRead(ctx) {
  const g = ctx.bandShare("grave") + ctx.bandShare("sub");
  if (g < 0.12) return "Linha grave tímida no espectro médio da faixa.";
  if (ctx.percHarm.harmonic > 0.35) return "Grave com conteúdo harmônico sustentado — possível bassline.";
  return "Grave percussivo ou comprimido com o kick.";
}

function stabRead(ctx) {
  if (ctx.percHarm.harmonic < 0.2) return "Pouca harmonia sustentada detectada; stabs podem ser curtos ou ausentes.";
  return "Conteúdo harmônico na faixa média — possível acorde ou pad curto.";
}

function fxRead(ctx) {
  if (scoreFxRise(ctx) > 0.4) return "Variação de energia aguda — possível riser ou sweep no trecho.";
  return "FX não dominam este recorte; ouça seções de transição manualmente.";
}

function percRead(ctx) {
  if (ctx.percHarm.percussive > 0.35 && ctx.side > 0.15) return "Percussão lateral e ataques — shakers/congas prováveis.";
  return "Percussão secundária ou embutida no groove.";
}

function vocalRead(ctx) {
  if (ctx.bandShare("presenca") > 0.18 && ctx.percHarm.harmonic > 0.3 && 1 - ctx.side > 0.55) {
    return "Energia central harmônica na presença — possível voz ou hook melódico.";
  }
  return "Vocal não aparece claro nesta estimativa; pode estar ausente ou na mix baixa.";
}

function percussiveHarmonicRatio(layers) {
  const p = layerShare(layers, "percussivo");
  const h = layerShare(layers, "harmonico");
  if (p == null || h == null) {
    return { percussive: 0.35, harmonic: 0.35 };
  }
  const sum = p + h || 1;
  return { percussive: p / sum, harmonic: h / sum };
}

function layerShare(layers, id) {
  if (!layers) return null;
  if (layers instanceof Map) return layers.get(id)?.share ?? null;
  return layers[id]?.share ?? null;
}

function scoreFourOnFloor(mono, rate, bpm) {
  const hop = 512;
  const env = lowBandEnvelope(mono, rate, hop);
  if (env.length < 8) return 0;
  let score = 0;
  let n = 0;
  for (let i = 0; i + 4 < env.length; i += 1) {
    score += env[i] * env[i + 4];
    n += 1;
  }
  const base = env.reduce((a, b) => a + b, 0) / (env.length || 1);
  return base > 0 ? clamp(score / (n * base * base + 1e-9), 0, 1) : 0;
}

function lowBandEnvelope(mono, rate, hop) {
  const env = [];
  const window = Math.min(NFFT, hop * 2);
  for (let i = 0; i + window < mono.length; i += hop) {
    let e = 0;
    for (let j = 0; j < window; j += 8) {
      const v = mono[i + j];
      e += v * v;
    }
    env.push(Math.sqrt(e));
  }
  return env;
}

function scoreFxRise(ctx) {
  return clamp(ctx.bandShare("ar") * 0.4 + ctx.side * 0.25, 0, 0.85);
}

export function renderInventarioCards(inventario) {
  if (!inventario?.elementos) return "";
  return `<div class="inventario-grid">
    ${CHAIRS.map((chair) => {
      const el = inventario.elementos[chair.id];
      return `<article class="inventario-card inventario-card--${el.presenca}" data-element="${chair.id}">
        <header><h4>${el.rotulo}</h4><span class="inventario-badge">${el.presenca}</span></header>
        <p class="inventario-funcao">${el.funcao}</p>
        <p class="inventario-leitura">${el.leitura}</p>
        <dl class="inventario-meta">
          <div><dt>Faixa</dt><dd>${el.faixa_hz}</dd></div>
          <div><dt>Confiança</dt><dd>${el.confianca}%</dd></div>
          ${el.qualidade_extracao != null ? `<div><dt>${el.extracao === "stem" ? "Stem IA" : el.extracao === "filtro" ? "Filtro" : "Extração"}</dt><dd>${el.qualidade_extracao}%</dd></div>` : ""}
        </dl>
      </article>`;
    }).join("")}
  </div>`;
}

export function buildTransplantPlan(doadorInv, receptorInv) {
  if (!doadorInv?.elementos || !receptorInv?.elementos) return null;
  const pares = CHAIRS.map((chair) => {
    const d = doadorInv.elementos[chair.id];
    const r = receptorInv.elementos[chair.id];
    return {
      elemento: chair.id,
      rotulo: chair.label,
      doador: { presenca: d.presenca, leitura: d.leitura, confianca: d.confianca },
      receptor: { presenca: r.presenca, leitura: r.leitura, confianca: r.confianca },
      sugestao: transplantSuggestion(d, r),
      prioridade: transplantPriority(d, r),
    };
  }).sort((a, b) => b.prioridade - a.prioridade);

  return {
    tipo: "plano-transplante-vibedj",
    versao: 1,
    metafora: "Transplante de papéis — melodia e harmonia como elementos, timbre recriado no receptor.",
    aviso: "Sons finais devem ser seus (sample/synth). O doador informa o papel; o receptor recebe a lógica.",
    pares,
  };
}

function presRank(p) {
  switch (p) {
    case "alta":
      return 3;
    case "media":
      return 2;
    case "baixa":
      return 1;
    default:
      return 0;
  }
}

function transplantPriority(d, r) {
  const donorStrong = presRank(d.presenca);
  const hostWeak = 3 - presRank(r.presenca);
  return donorStrong * hostWeak + (d.confianca - r.confianca) * 0.01;
}

function transplantSuggestion(d, r) {
  const ds = presRank(d.presenca);
  const rs = presRank(r.presenca);
  if (ds >= 2 && rs <= 1) {
    return "Emprestar o papel do doador: mesma função no tempo, timbre novo no receptor.";
  }
  if (ds >= 2 && rs >= 2) {
    return "Ambos têm este papel — troca (↻) ou mantenha o receptor ouvindo o doador como referência.";
  }
  if (ds <= 1 && rs >= 2) {
    return "Doador fraco aqui; receptor já sustenta — não transplantar este elemento.";
  }
  return "Marcar na grade; transplante opcional.";
}

export function renderTransplantPlan(plano) {
  if (!plano?.pares?.length) return "<p>Carregue doador e receptor para ver o plano.</p>";
  const list = plano.pares.filter((p) => p.prioridade > 1).slice(0, 5);
  const show = list.length ? list : plano.pares.slice(0, 4);
  return `<div class="transplante-plano">
    <p class="transplante-plano__lead">${plano.metafora}</p>
    <ol class="transplante-plano__list">
      ${show
        .map(
          (p) => `<li><strong>${p.rotulo}</strong> — ${p.sugestao}
        <span class="transplante-plano__meta">Doador: ${p.doador.presenca} · Receptor: ${p.receptor.presenca}</span></li>`,
        )
        .join("")}
    </ol>
  </div>`;
}
