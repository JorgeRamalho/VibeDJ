import { mergeLabPacket, readGradeForReport } from "./clonagem-model.js";

const BPM = 124;
const BARS = 16;
const STEPS = 16;
const STEP = 60 / BPM / 4;
const LOOP = BARS * STEPS;

const SECTIONS = [
  { id: "intro", label: "Intro", start: 0, bars: 4, note: "Chão e hat. Ainda cabe outra faixa." },
  { id: "groove", label: "Groove", start: 4, bars: 4, note: "Kick, clap, hat e baixo juntos." },
  { id: "break", label: "Break", start: 8, bars: 4, note: "O chão sai. Ficam hat, stab e a subida." },
  { id: "drop", label: "Drop", start: 12, bars: 4, note: "O chão volta com baixo e stab." },
];

const LAYERS = [
  {
    id: "kick",
    name: "Kick",
    role: "Quatro tempos. Segura o chão.",
    reference: "seco",
    referenceLabel: "Seco",
    voices: [
      { id: "longo", label: "Corpo longo" },
      { id: "curto", label: "Ataque curto" },
    ],
  },
  {
    id: "clap",
    name: "Clap",
    role: "Tempos 2 e 4. Marca a frase.",
    reference: "estalo",
    referenceLabel: "Estalo",
    voices: [
      { id: "palma", label: "Palma grave" },
      { id: "snap", label: "Snap curto" },
    ],
  },
  {
    id: "hat",
    name: "Hi-hat",
    role: "Contratempo. Costura o groove.",
    reference: "fechado",
    referenceLabel: "Fechado",
    voices: [
      { id: "aberto", label: "Aberto" },
      { id: "shuffle", label: "Shuffle" },
    ],
  },
  {
    id: "bass",
    name: "Baixo",
    role: "Pulso em Lá. Conversa com o kick.",
    reference: "pulso",
    referenceLabel: "No tempo",
    voices: [
      { id: "offbeat", label: "Contratempo" },
      { id: "walking", label: "Caminhada" },
    ],
  },
  {
    id: "stab",
    name: "Stab",
    role: "Acorde curto. Entra no break e no drop.",
    reference: "menor",
    referenceLabel: "Lá menor",
    voices: [
      { id: "suspenso", label: "Sus4" },
      { id: "vazio", label: "Sem acorde" },
    ],
  },
  {
    id: "fx",
    name: "Transição",
    role: "Prepara a volta do chão.",
    reference: "riser",
    referenceLabel: "Riser",
    voices: [
      { id: "sweep", label: "Sweep agudo" },
      { id: "impact", label: "Impacto no drop" },
    ],
  },
];

const DAYS = [
  ["Ouvir o mapa", "Toque a referência e acompanhe intro, groove, break e drop."],
  ["Separar no ouvido", "Use o solo de cada camada. Anote o papel, não o nome do plugin."],
  ["Ler o espectro", "Veja onde o grave e o agudo ocupam o ar enquanto o loop gira."],
  ["Decidir", "Em cada camada: manter, substituir ou rejeitar."],
  ["Aprovar a proposta", "A proposta só toca depois que as seis decisões existem."],
  ["Comparar", "Alterne referência e proposta. Liste três diferenças que você escolheu."],
  ["Guardar o relatório", "Copie o JSON. Ele descreve esta bancada, não uma faixa de terceiro."],
];

const root = document.querySelector("[data-lab]");
if (root) boot(root);

function boot(mount) {
  const state = {
    mode: "referencia",
    playing: false,
    solos: new Set(),
    decisions: Object.fromEntries(LAYERS.map((layer) => [layer.id, { status: null, voice: layer.voices[0].id }])),
    log: [],
    days: loadDays(),
    armed: 0,
  };

  mount.innerHTML = render(state);
  const ui = bind(mount);

  let audio = null;
  let timer = 0;
  let nextTime = 0;
  let nextStep = 0;
  let origin = 0;
  let frame = 0;

  ui.playRef.addEventListener("click", () => start("referencia"));
  ui.playProp.addEventListener("click", () => start("proposta"));
  ui.stop.addEventListener("click", () => halt());
  ui.copy.addEventListener("click", () => copyReport());
  const copyPacketBtn = mount.querySelector("[data-copy-packet]");
  if (copyPacketBtn) copyPacketBtn.addEventListener("click", () => copyPacket());

  ui.sections.forEach((button) => {
    button.addEventListener("click", () => {
      const bar = Number(button.dataset.bar);
      state.armed = bar * STEPS;
      if (!state.playing || !audio) {
        paint(state.armed);
        return;
      }
      audio.stopLive();
      nextStep = state.armed;
      nextTime = audio.ctx.currentTime + 0.06;
      origin = nextTime - nextStep * STEP;
    });
  });

  mount.querySelectorAll("[data-solo]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.solo;
      if (state.solos.has(id)) state.solos.delete(id);
      else state.solos.add(id);
      button.setAttribute("aria-pressed", String(state.solos.has(id)));
    });
  });

  mount.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.layer;
      const status = button.dataset.choice;
      const decision = state.decisions[id];
      decision.status = status;
      const layer = layerById(id);
      const voice = status === "substituir" ? decision.voice : layer.reference;
      pushLog(state, `${layer.name} · ${labelStatus(status)} · ${voiceLabel(layer, voice)}`);
      paintDecisions();
      paintReport();
    });
  });

  mount.querySelectorAll("[data-voice]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.voice;
      const decision = state.decisions[id];
      decision.voice = select.value;
      if (decision.status === "substituir") {
        const layer = layerById(id);
        pushLog(state, `${layer.name} · equivalente · ${voiceLabel(layer, select.value)}`);
        paintReport();
      }
      paintGrid();
    });
  });

  ui.days.forEach((input) => {
    input.addEventListener("change", () => {
      state.days[Number(input.dataset.day)] = input.checked;
      localStorage.setItem("vibedj-lab-dias", JSON.stringify(state.days));
      ui.dayCount.textContent = String(state.days.filter(Boolean).length);
    });
  });

  paintDecisions();
  paintReport();
  paint(0);

  function start(mode) {
    if (mode === "proposta" && !approved(state)) return;
    const engine = ensureAudio();
    engine.ctx.resume();
    halt(false);
    state.mode = mode;
    state.playing = true;
    ui.playRef.setAttribute("aria-pressed", String(mode === "referencia"));
    ui.playProp.setAttribute("aria-pressed", String(mode === "proposta"));
    ui.status.textContent = mode === "referencia" ? "Tocando a referência de estudo." : "Tocando a proposta aprovada.";
    origin = engine.ctx.currentTime + 0.05 - state.armed * STEP;
    nextTime = origin + state.armed * STEP;
    nextStep = state.armed;
    timer = window.setInterval(scheduler, 25);
    frame = requestAnimationFrame(draw);
  }

  function halt(announce = true) {
    state.playing = false;
    window.clearInterval(timer);
    cancelAnimationFrame(frame);
    if (audio) audio.stopLive();
    ui.playRef.setAttribute("aria-pressed", "false");
    ui.playProp.setAttribute("aria-pressed", "false");
    if (announce) ui.status.textContent = "Parado.";
  }

  function ensureAudio() {
    if (!audio) audio = createAudio();
    return audio;
  }

  function scheduler() {
    const horizon = audio.ctx.currentTime + 0.18;
    while (nextTime < horizon) {
      const step = nextStep % LOOP;
      scheduleStep(audio, state, step, nextTime);
      nextTime += STEP;
      nextStep += 1;
    }
  }

  function draw() {
    if (!state.playing || !audio) return;
    audio.analyser.getByteFrequencyData(audio.bins);
    const canvas = ui.spectrum;
    const ctx2d = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx2d.clearRect(0, 0, width, height);
    const bars = 42;
    const gap = 3;
    const barWidth = (width - gap * (bars - 1)) / bars;
    for (let index = 0; index < bars; index += 1) {
      const start = Math.floor((index / bars) * audio.bins.length * 0.72);
      const end = Math.floor(((index + 1) / bars) * audio.bins.length * 0.72);
      let peak = 0;
      for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, audio.bins[bin]);
      const magnitude = peak / 255;
      const barHeight = Math.max(2, magnitude * height);
      ctx2d.fillStyle = index < 8 ? "#d7b08a" : index > 32 ? "#7ed0c4" : "#e4ff57";
      ctx2d.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
    }
    const elapsed = audio.ctx.currentTime - origin;
    const cursor = elapsed < 0 ? state.armed : Math.floor(elapsed / STEP);
    paint(cursor);
    frame = requestAnimationFrame(draw);
  }

  function paint(cursor) {
    const loopStep = ((cursor % LOOP) + LOOP) % LOOP;
    const bar = Math.floor(loopStep / STEPS);
    const step = loopStep % STEPS;
    const section = sectionOf(bar);
    ui.map.forEach((button) => {
      button.classList.toggle("is-now", button.dataset.section === section.id);
    });
    ui.sectionRead.textContent = `${section.label}. ${section.note} Compasso ${bar + 1} de ${BARS}.`;
    ui.cells.forEach((cell, index) => {
      cell.classList.toggle("is-now", index === step);
    });
    paintGrid();
  }

  function paintGrid() {
    const kick = stepsFor("kick", "seco");
    const clap = stepsFor("clap", "estalo");
    const hatVoice = state.decisions.hat.status === "substituir" ? state.decisions.hat.voice : "fechado";
    const bassVoice = state.decisions.bass.status === "substituir" ? state.decisions.bass.voice : "pulso";
    const hat = stepsFor("hat", hatVoice);
    const bass = stepsFor("bass", bassVoice);
    fillRow(ui.rowKick, kick);
    fillRow(ui.rowClap, clap);
    fillRow(ui.rowHat, hat);
    fillRow(ui.rowBass, bass);
  }

  function paintDecisions() {
    const ready = approved(state);
    ui.playProp.disabled = !ready;
    ui.pending.textContent = ready
      ? "Seis decisões registradas. A proposta pode tocar."
      : `Faltam ${pendingCount(state)} decisões para liberar a proposta.`;
    LAYERS.forEach((layer) => {
      const decision = state.decisions[layer.id];
      mount.querySelectorAll(`[data-layer="${layer.id}"][data-choice]`).forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.choice === decision.status));
      });
      const select = mount.querySelector(`[data-voice="${layer.id}"]`);
      select.disabled = decision.status !== "substituir";
    });
  }

  function paintReport() {
    ui.report.textContent = JSON.stringify(report(state), null, 2);
    ui.log.innerHTML = "";
    state.log.slice(0, 8).forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      ui.log.append(item);
    });
  }

  async function copyReport() {
    const text = JSON.stringify(report(state), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ui.status.textContent = "Relatório copiado.";
    } catch {
      ui.status.textContent = "Selecione o JSON e copie manualmente.";
    }
  }

  async function copyPacket() {
    const analise = window.__vibedjLastAnalise ?? null;
    const text = JSON.stringify(mergeLabPacket(report(state), analise), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ui.status.textContent = "Pacote completo copiado (leitura + grade + bancada).";
    } catch {
      ui.status.textContent = "Selecione o pacote JSON e copie manualmente.";
    }
  }

  window.__vibedjLabReport = () => report(state);
  window.dispatchEvent(new CustomEvent("vibedj:lab-ready"));
}

function render(state) {
  const sectionButtons = SECTIONS.map(
    (section) =>
      `<button type="button" data-section="${section.id}" data-bar="${section.start}">${section.label}<small>${section.bars} compassos</small></button>`,
  ).join("");
  const layers = LAYERS.map((layer) => {
    const options = layer.voices
      .map((voice) => `<option value="${voice.id}">${voice.label}</option>`)
      .join("");
    return `<article class="lab-layer">
      <header>
        <h3>${layer.name}</h3>
        <p>${layer.role}</p>
      </header>
      <button type="button" data-solo="${layer.id}" aria-pressed="false">Solo</button>
      <div class="lab-choices" role="group" aria-label="Decisão de ${layer.name}">
        <button type="button" data-layer="${layer.id}" data-choice="manter" aria-pressed="false">Manter <small>estrutura</small></button>
        <button type="button" data-layer="${layer.id}" data-choice="substituir" aria-pressed="false">Substituir <small>troca</small></button>
        <button type="button" data-layer="${layer.id}" data-choice="rejeitar" aria-pressed="false">Rejeitar <small>retirada</small></button>
      </div>
      <label>Equivalente
        <select data-voice="${layer.id}" disabled>${options}</select>
      </label>
      <p class="lab-ref">Referência: ${layer.referenceLabel}</p>
    </article>`;
  }).join("");
  const days = DAYS.map(
    ([title, text], index) => `<li>
      <label>
        <input type="checkbox" data-day="${index}" ${state.days[index] ? "checked" : ""}>
        <span><b>Dia ${index + 1} — ${title}</b> ${text}</span>
      </label>
    </li>`,
  ).join("");
  return `<div class="lab-transport">
      <button type="button" class="btn btn--acid" data-play="referencia" aria-pressed="false">Ouvir referência</button>
      <button type="button" class="btn btn--ghost" data-play="proposta" aria-pressed="false">Ouvir proposta</button>
      <button type="button" class="btn btn--ghost" data-stop>Parar</button>
      <p data-pending></p>
    </div>
    <p class="lab-status" data-status aria-live="polite">Parado. A referência é um groove sintetizado nesta página.</p>
    <div class="lab-readout">
      <p><span>Andamento de estudo</span><strong>124 BPM</strong></p>
      <p><span>Compasso</span><strong>4/4</strong></p>
      <p><span>Tonalidade de estudo</span><strong>Lá menor</strong></p>
      <p><span>Duração</span><strong>16 compassos</strong></p>
    </div>
    <div class="lab-map" role="group" aria-label="Mapa de seções">${sectionButtons}</div>
    <p data-section-read>Intro. Chão e hat. Ainda cabe outra faixa.</p>
    <canvas data-spectrum width="900" height="140" aria-hidden="true"></canvas>
    <p class="lab-caption">Espectro do que está saindo agora. Cobre é grave, lima é médio, água é agudo. Nesta bancada o BPM é exato porque o groove foi escrito aqui. Num arquivo de terceiro, BPM, tom e seções seriam estimativas.</p>
    <div class="lab-pattern" aria-hidden="true">
      <div><b>Kick</b><div data-row="kick"></div></div>
      <div><b>Clap</b><div data-row="clap"></div></div>
      <div><b>Hat</b><div data-row="hat"></div></div>
      <div><b>Baixo</b><div data-row="bass"></div></div>
    </div>
    <p class="lab-caption">Um compasso, dezesseis semicolcheias. O passo aceso é o agora.</p>
    <div class="phrase__grid" data-cells></div>
    <div class="lab-layers">${layers}</div>
    <div class="lab-report">
      <div>
        <h3>Relatório</h3>
        <pre data-report></pre>
        <button type="button" class="btn btn--ghost" data-copy>Copiar JSON da bancada</button>
        <button type="button" class="btn btn--acid" data-copy-packet>Copiar pacote completo</button>
      </div>
      <div>
        <h3>Decisões</h3>
        <ol data-log></ol>
      </div>
    </div>
    <h3>Sete noites</h3>
    <p class="lab-caption"><span data-day-count>${state.days.filter(Boolean).length}</span> de 7 marcadas neste navegador.</p>
    <ol class="lab-days">${days}</ol>`;
}

function bind(mount) {
  const cells = mount.querySelector("[data-cells]");
  for (let index = 0; index < STEPS; index += 1) {
    const cell = document.createElement("span");
    cell.textContent = String((index % 4) + 1);
    cells.append(cell);
  }
  for (const row of ["kick", "clap", "hat", "bass"]) {
    const target = mount.querySelector(`[data-row="${row}"]`);
    for (let index = 0; index < STEPS; index += 1) {
      const cell = document.createElement("i");
      target.append(cell);
    }
  }
  return {
    playRef: mount.querySelector("[data-play='referencia']"),
    playProp: mount.querySelector("[data-play='proposta']"),
    stop: mount.querySelector("[data-stop]"),
    copy: mount.querySelector("[data-copy]"),
    status: mount.querySelector("[data-status]"),
    pending: mount.querySelector("[data-pending]"),
    sectionRead: mount.querySelector("[data-section-read]"),
    spectrum: mount.querySelector("[data-spectrum]"),
    report: mount.querySelector("[data-report]"),
    log: mount.querySelector("[data-log]"),
    dayCount: mount.querySelector("[data-day-count]"),
    map: [...mount.querySelectorAll("[data-section]")],
    sections: [...mount.querySelectorAll("[data-section]")],
    cells: [...cells.children],
    rowKick: [...mount.querySelectorAll("[data-row='kick'] i")],
    rowClap: [...mount.querySelectorAll("[data-row='clap'] i")],
    rowHat: [...mount.querySelectorAll("[data-row='hat'] i")],
    rowBass: [...mount.querySelectorAll("[data-row='bass'] i")],
    days: [...mount.querySelectorAll("[data-day]")],
  };
}

function createAudio() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.42;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.15;
  master.connect(comp);
  comp.connect(analyser);
  analyser.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const channel = noise.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  const live = new Set();
  return {
    ctx,
    master,
    analyser,
    bins: new Uint8Array(analyser.frequencyBinCount),
    noise,
    live,
    stopLive() {
      const when = ctx.currentTime;
      live.forEach((node) => {
        try {
          node.stop(when);
        } catch {
          /* already stopped */
        }
      });
      live.clear();
    },
  };
}

function scheduleStep(audio, state, loopStep, time) {
  const bar = Math.floor(loopStep / STEPS);
  const step = loopStep % STEPS;
  const section = sectionOf(bar);
  LAYERS.forEach((layer) => {
    if (!hears(state, layer.id, section.id, bar, step)) return;
    const voice = voiceFor(state, layer);
    trigger(audio, layer.id, voice, time, step, bar);
  });
}

function hears(state, layerId, sectionId, bar, step) {
  if (state.solos.size > 0 && !state.solos.has(layerId)) return false;
  if (state.mode === "proposta") {
    const status = state.decisions[layerId].status;
    if (status === "rejeitar") return false;
    if (status !== "manter" && status !== "substituir") return false;
  }
  if (!inSection(layerId, sectionId)) return false;
  if (layerId === "fx") return fxDue(voiceFor(state, layerById("fx")), bar, step);
  return stepsFor(layerId, voiceFor(state, layerById(layerId))).includes(step);
}

function inSection(layerId, sectionId) {
  switch (sectionId) {
    case "intro":
      return layerId === "kick" || layerId === "hat";
    case "groove":
      return layerId === "kick" || layerId === "clap" || layerId === "hat" || layerId === "bass";
    case "break":
      return layerId === "hat" || layerId === "stab" || layerId === "fx";
    case "drop":
      return true;
    default: {
      const unknown = sectionId;
      throw new Error(unknown);
    }
  }
}

function fxDue(voice, bar, step) {
  switch (voice) {
    case "riser":
    case "sweep":
      return bar === 10 && step === 0;
    case "impact":
      return bar === 12 && step === 0;
    default: {
      const unknown = voice;
      throw new Error(unknown);
    }
  }
}

function voiceFor(state, layer) {
  if (state.mode === "proposta" && state.decisions[layer.id].status === "substituir") {
    return state.decisions[layer.id].voice;
  }
  return layer.reference;
}

function stepsFor(layerId, voice) {
  switch (layerId) {
    case "kick":
      return [0, 4, 8, 12];
    case "clap":
      return [4, 12];
    case "hat":
      return voice === "aberto" ? [2, 6, 10, 14] : [2, 6, 10, 14];
    case "bass":
      if (voice === "offbeat") return [6, 14];
      if (voice === "walking") return [0, 4, 8, 12];
      return [0, 8];
    case "stab":
      return voice === "vazio" ? [] : [0];
    case "fx":
      return [];
    default: {
      const unknown = layerId;
      throw new Error(unknown);
    }
  }
}

function trigger(audio, layerId, voice, time, step, bar) {
  const when = layerId === "hat" && voice === "shuffle" && (step === 6 || step === 14) ? time + STEP * 0.45 : time;
  switch (layerId) {
    case "kick":
      triggerKick(audio, voice, when);
      break;
    case "clap":
      triggerClap(audio, voice, when);
      break;
    case "hat":
      triggerHat(audio, voice, when);
      break;
    case "bass":
      triggerBass(audio, voice, when, step);
      break;
    case "stab":
      triggerStab(audio, voice, when);
      break;
    case "fx":
      triggerFx(audio, voice, when, bar);
      break;
    default: {
      const unknown = layerId;
      throw new Error(unknown);
    }
  }
}

function triggerKick(audio, voice, time) {
  const body = voice === "longo" ? 0.46 : voice === "curto" ? 0.11 : 0.24;
  tone(audio, voice === "longo" ? 98 : 156, 46, time, body, "sine", voice === "curto" ? 0.85 : 0.95);
  burst(audio, time, 0.02, 1800, "highpass", 0.18);
}

function triggerClap(audio, voice, time) {
  switch (voice) {
    case "estalo":
      burst(audio, time, 0.12, 1900, "bandpass", 0.28);
      break;
    case "palma":
      burst(audio, time, 0.2, 900, "bandpass", 0.3);
      break;
    case "snap":
      burst(audio, time, 0.05, 3200, "highpass", 0.22);
      break;
    default: {
      const unknown = voice;
      throw new Error(unknown);
    }
  }
}

function triggerHat(audio, voice, time) {
  const open = voice === "aberto";
  burst(audio, time, open ? 0.16 : 0.035, open ? 6500 : 8000, "highpass", open ? 0.12 : 0.09);
}

function triggerBass(audio, voice, time, step) {
  const freq = bassFreq(voice, step);
  const type = voice === "walking" ? "triangle" : "sine";
  tone(audio, freq, freq, time, voice === "offbeat" ? 0.16 : 0.22, type, voice === "walking" ? 0.22 : 0.28);
}

function bassFreq(voice, step) {
  if (voice === "walking") {
    if (step === 4) return 65.41;
    if (step === 8) return 82.41;
    if (step === 12) return 49;
    return 55;
  }
  if (voice === "offbeat" && step === 14) return 41.2;
  return 55;
}

function triggerStab(audio, voice, time) {
  const chord = voice === "suspenso" ? [220, 293.66, 329.63] : [220, 261.63, 329.63];
  if (voice === "vazio") return;
  chord.forEach((freq) => tone(audio, freq, freq, time, 0.28, "triangle", 0.07));
}

function triggerFx(audio, voice, time, bar) {
  switch (voice) {
    case "riser":
      sweep(audio, time, STEP * 32, 400, 4200, 0.08);
      break;
    case "sweep":
      sweep(audio, time, STEP * 32, 1400, 7600, 0.07);
      break;
    case "impact":
      if (bar === 12) burst(audio, time, 0.35, 240, "lowpass", 0.34);
      break;
    default: {
      const unknown = voice;
      throw new Error(unknown);
    }
  }
}

function tone(audio, from, to, time, duration, type, amount) {
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, time);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), time + Math.min(0.08, duration));
  gain.gain.setValueAtTime(amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(time);
  osc.stop(time + duration + 0.02);
  audio.live.add(osc);
  osc.onended = () => audio.live.delete(osc);
}

function burst(audio, time, duration, frequency, type, amount) {
  const source = audio.ctx.createBufferSource();
  const filter = audio.ctx.createBiquadFilter();
  const gain = audio.ctx.createGain();
  source.buffer = audio.noise;
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, time);
  filter.Q.value = type === "bandpass" ? 0.8 : 0.7;
  gain.gain.setValueAtTime(amount, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(time);
  source.stop(time + duration + 0.02);
  audio.live.add(source);
  source.onended = () => audio.live.delete(source);
}

function sweep(audio, time, duration, from, to, amount) {
  const source = audio.ctx.createBufferSource();
  const filter = audio.ctx.createBiquadFilter();
  const gain = audio.ctx.createGain();
  source.buffer = audio.noise;
  source.loop = true;
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(from, time);
  filter.frequency.exponentialRampToValueAtTime(to, time + duration);
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(amount, time + duration * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(time);
  source.stop(time + duration + 0.02);
  audio.live.add(source);
  source.onended = () => audio.live.delete(source);
}

function sectionOf(bar) {
  const found = SECTIONS.find((section) => bar >= section.start && bar < section.start + section.bars);
  if (!found) throw new Error("Compasso fora do mapa");
  return found;
}

function layerById(id) {
  const found = LAYERS.find((layer) => layer.id === id);
  if (!found) throw new Error(id);
  return found;
}

function approved(state) {
  return LAYERS.every((layer) => {
    const status = state.decisions[layer.id].status;
    return status === "manter" || status === "substituir" || status === "rejeitar";
  });
}

function pendingCount(state) {
  return LAYERS.filter((layer) => state.decisions[layer.id].status == null).length;
}

function labelStatus(status) {
  switch (status) {
    case "manter":
      return "manter";
    case "substituir":
      return "substituir";
    case "rejeitar":
      return "rejeitar";
    default: {
      const unknown = status;
      throw new Error(unknown);
    }
  }
}

function voiceLabel(layer, voiceId) {
  if (voiceId === layer.reference) return layer.referenceLabel;
  const voice = layer.voices.find((item) => item.id === voiceId);
  return voice ? voice.label : voiceId;
}

function pushLog(state, text) {
  state.log.unshift(text);
  if (state.log.length > 24) state.log.pop();
}

function report(state) {
  return {
    laboratorio: "Engenharia reversa de clonagem musical",
    referencia: "groove-didatico-vibedj",
    origem: "sintetizado no navegador",
    aviso: "Relatório de estudo. Não descreve uma faixa de terceiro.",
    tempo_bpm: BPM,
    compasso: "4/4",
    tonalidade_didatica: "Lá menor",
    duracao_compassos: BARS,
    estrutura: SECTIONS.map((section) => ({
      secao: section.id,
      inicio_compasso: section.start + 1,
      compassos: section.bars,
    })),
    elementos: Object.fromEntries(
      LAYERS.map((layer) => {
        const decision = state.decisions[layer.id];
        const voice = decision.status === "substituir" ? decision.voice : layer.reference;
        return [layer.id, { papel: layer.role, decisao: decision.status, voz: voiceLabel(layer, voice) }];
      }),
    ),
    grade_cadeiras: readGradeForReport(),
    proposta_liberada: approved(state),
    decisoes_recentes: state.log.slice(0, 8),
  };
}

function fillRow(cells, steps) {
  cells.forEach((cell, index) => {
    cell.classList.toggle("is-on", steps.includes(index));
  });
}

function loadDays() {
  try {
    const saved = JSON.parse(localStorage.getItem("vibedj-lab-dias") || "[]");
    if (!Array.isArray(saved)) return DAYS.map(() => false);
    return DAYS.map((_, index) => Boolean(saved[index]));
  } catch {
    return DAYS.map(() => false);
  }
}
