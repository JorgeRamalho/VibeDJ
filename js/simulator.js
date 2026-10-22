import { createEngine, peak, triggerStep } from "./engine.js";
import { TRACKS, totalSteps, waveformOf } from "./tracks.js";

const NOTE_NAMES = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"];
const CUE_COLORS = ["#e4ff57", "#ff6a3d", "#7ed0c4", "#d7b08a", "#f4f1ea", "#d2c4ff", "#ffd166", "#ffb3c7"];
const SECTION_TINT = {
  Intro: "rgba(232,226,212,0.06)",
  Base: "rgba(126,208,196,0.10)",
  Quebra: "rgba(215,176,138,0.12)",
  Drop: "rgba(228,255,87,0.12)",
};

const decks = { a: createDeck("a"), b: createDeck("b") };
const mix = {
  a: { trim: 0.75, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 0.85, cue: false },
  b: { trim: 0.75, hi: 0.5, mid: 0.5, low: 0.5, filter: 0.5, fader: 0, cue: true },
  cross: 0.5,
  curve: "smooth",
  master: 0.55,
  booth: 0.7,
  phones: 0.8,
  cueMix: 0,
};

const state = {
  powered: false,
  masterDeck: null,
  ear: false,
  hidePitch: false,
  phaseSince: 0,
  swapSince: 0,
  missions: { load: false, transport: false, match: false, swap: false, loop: false },
};

let engine = null;
let clock = 0;
const cueHold = { a: false, b: false };

function createDeck(id) {
  return {
    id,
    el: null,
    track: null,
    wave: null,
    playing: false,
    preview: false,
    cursor: 0,
    nextTime: 0,
    originStep: 0,
    originTime: 0,
    pitchSlider: 0,
    range: 10,
    bend: 1,
    masterTempo: true,
    keyShift: 0,
    vinyl: true,
    quantize: true,
    slip: false,
    shift: false,
    cueStep: 0,
    memories: [],
    memoryIndex: -1,
    hotCues: Array(8).fill(null),
    loop: { active: false, start: 0, end: 16 },
    slipOriginStep: 0,
    slipOriginTime: 0,
    timeMode: "remain",
    touching: false,
    scratching: false,
    played: false,
    cueHits: 0,
    syncUsed: false,
    nudged: false,
    loopUsed4: false,
    jumpBeats: 4,
  };
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function deckRate(deck) {
  return Math.max(0.08, 1 + deck.pitchSlider * (deck.range / 100));
}

function stepDuration(deck) {
  return (60 / deck.track.bpm) / 4 / (deckRate(deck) * deck.bend);
}

function freqScale(deck) {
  const shift = 2 ** (deck.keyShift / 12);
  if (deck.masterTempo) return shift;
  return shift * deckRate(deck) * deck.bend;
}

function visualStep(deck) {
  if (!deck.track) return 0;
  let steps = deck.originStep;
  if (deck.playing && !deck.scratching && engine) {
    steps = deck.originStep + (engine.ctx.currentTime - deck.originTime) / stepDuration(deck);
  }
  if (deck.loop.active) {
    const len = deck.loop.end - deck.loop.start;
    if (len > 0) return deck.loop.start + mod(steps - deck.loop.start, len);
  }
  return mod(steps, totalSteps(deck.track));
}

function slipStep(deck) {
  if (!engine) return deck.slipOriginStep;
  const advanced = deck.slipOriginStep + (engine.ctx.currentTime - deck.slipOriginTime) / stepDuration(deck);
  return mod(advanced, totalSteps(deck.track));
}

function rebase(deck) {
  if (!deck.track) return;
  const step = visualStep(deck);
  const now = engine ? engine.ctx.currentTime : 0;
  if (deck.slip && deck.loop.active) {
    deck.slipOriginStep = slipStep(deck);
    deck.slipOriginTime = now;
  }
  deck.originStep = step;
  deck.originTime = now;
}

function jumpTo(deck, step) {
  if (!deck.track) return;
  const total = totalSteps(deck.track);
  const next = mod(Math.round(step), total);
  deck.cursor = next;
  deck.originStep = next;
  deck.originTime = engine ? engine.ctx.currentTime : 0;
  deck.nextTime = engine ? engine.ctx.currentTime + 0.04 : 0;
}

function quantizeStep(deck, step) {
  if (!deck.quantize || !deck.track) return mod(Math.round(step), deck.track ? totalSteps(deck.track) : 1);
  const total = totalSteps(deck.track);
  return mod(Math.round(step / 4) * 4, total);
}

function currentInt(deck) {
  return mod(Math.round(visualStep(deck)), totalSteps(deck.track));
}

function nextIndex(deck, step) {
  const total = totalSteps(deck.track);
  if (deck.loop.active) {
    const n = step + 1;
    if (n >= deck.loop.end || n < deck.loop.start) return mod(deck.loop.start, total);
    return n;
  }
  return mod(step + 1, total);
}

async function ensureAudio() {
  if (!engine) engine = createEngine();
  state.powered = true;
  document.body.classList.add("is-on");
  if (engine.ctx.state !== "running") await engine.ctx.resume();
  applyMixer();
  if (!clock) clock = window.setInterval(schedule, 25);
}

function schedule() {
  if (!engine || !state.powered) return;
  for (const id of ["a", "b"]) scheduleDeck(decks[id]);
}

function scheduleDeck(deck) {
  if (!deck.playing || !deck.track || deck.scratching) return;
  const now = engine.ctx.currentTime;
  if (deck.nextTime < now - 0.05) deck.nextTime = now + 0.05;
  const nodes = engine.decks[deck.id];
  let guard = 0;
  while (deck.nextTime < now + 0.25 && guard < 32) {
    triggerStep(engine, nodes, deck.track, deck.cursor, deck.nextTime, freqScale(deck));
    const dur = stepDuration(deck);
    deck.cursor = nextIndex(deck, deck.cursor);
    deck.nextTime += dur;
    guard += 1;
  }
}

function eqDb(value) {
  if (value <= 0.5) return -40 * (1 - value / 0.5);
  return 6 * ((value - 0.5) / 0.5);
}

function crossGain(pos, side, curve) {
  const opening = side === "a" ? 1 - pos : pos;
  if (opening >= 0.5) return 1;
  const t = opening / 0.5;
  switch (curve) {
    case "smooth":
      return Math.sin((t * Math.PI) / 2);
    case "cut":
      return t < 0.78 ? 0 : (t - 0.78) / 0.22;
    case "linear":
      return t;
    default:
      return t;
  }
}

function applyFilter(filter, value) {
  if (value > 0.47 && value < 0.53) {
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    return;
  }
  if (value < 0.5) {
    const t = value / 0.5;
    filter.type = "lowpass";
    filter.frequency.value = 160 + t * t * 16000;
    return;
  }
  const t = (value - 0.5) / 0.5;
  filter.type = "highpass";
  filter.frequency.value = 30 * 400 ** t;
}

function applyMixer() {
  if (!engine) return;
  for (const id of ["a", "b"]) {
    const channel = mix[id];
    const nodes = engine.decks[id];
    nodes.input.gain.value = channel.trim;
    nodes.eqLow.gain.value = eqDb(channel.low);
    nodes.eqMid.gain.value = eqDb(channel.mid);
    nodes.eqHigh.gain.value = eqDb(channel.hi);
    applyFilter(nodes.filter, channel.filter);
    nodes.fader.gain.value = channel.fader ** 1.35 * crossGain(mix.cross, id, mix.curve);
    nodes.cue.gain.value = channel.cue ? 1 : 0;
  }
  const cueActive = mix.a.cue || mix.b.cue;
  const blend = cueActive ? mix.cueMix : 0;
  engine.masterKnob.gain.value = mix.master * (1 - blend);
  engine.phonesKnob.gain.value = mix.phones * blend;
}

function togglePlay(id) {
  const deck = decks[id];
  if (!deck.track) {
    announce("Carregue uma faixa antes do play.");
    return;
  }
  deck.preview = false;
  deck.playing = !deck.playing;
  if (deck.playing) {
    deck.played = true;
    jumpTo(deck, visualStep(deck));
  }
}

function cueDown(id) {
  const deck = decks[id];
  if (!deck.track) return;
  if (deck.shift) {
    deck.cueStep = quantizeStep(deck, visualStep(deck));
    announce(`Cue do deck ${id.toUpperCase()} marcado.`);
    return;
  }
  if (deck.playing && !deck.preview) {
    deck.playing = false;
    deck.cueHits += 1;
    jumpTo(deck, deck.cueStep);
    return;
  }
  deck.preview = true;
  deck.playing = true;
  deck.played = true;
  jumpTo(deck, deck.cueStep);
}

function cueUp(id) {
  const deck = decks[id];
  if (!deck.preview) return;
  deck.preview = false;
  deck.playing = false;
  jumpTo(deck, deck.cueStep);
}

function loadTrack(id, track) {
  const deck = decks[id];
  deck.track = track;
  deck.wave = waveformOf(track);
  deck.playing = false;
  deck.preview = false;
  deck.hotCues = Array(8).fill(null);
  deck.memories = [];
  deck.memoryIndex = -1;
  deck.loop = { active: false, start: 0, end: 16 };
  deck.keyShift = 0;
  deck.pitchSlider = 0;
  deck.cueStep = 0;
  deck.cursor = 0;
  deck.originStep = 0;
  deck.originTime = engine ? engine.ctx.currentTime : 0;
  deck.nextTime = 0;
  renderCrate(deck);
  announce(`${track.title} no deck ${id.toUpperCase()}.`);
}

function syncDeck(id) {
  const sourceId = state.masterDeck && state.masterDeck !== id ? state.masterDeck : id === "a" ? "b" : "a";
  const source = decks[sourceId];
  const deck = decks[id];
  if (!source.track || !deck.track) return;
  if (state.masterDeck === id) return;
  deck.syncUsed = true;
  const targetRate = (source.track.bpm * deckRate(source)) / deck.track.bpm;
  const ranges = [6, 10, 16, 100];
  const need = Math.abs(targetRate - 1) * 100;
  if (need > deck.range) deck.range = ranges.find((item) => item >= need - 0.01) ?? 100;
  rebase(deck);
  deck.pitchSlider = clamp((targetRate - 1) / (deck.range / 100), -1, 1);
  const sourcePhase = visualStep(source) % 4;
  const deckPhase = visualStep(deck) % 4;
  let delta = sourcePhase - deckPhase;
  if (delta > 2) delta -= 4;
  if (delta < -2) delta += 4;
  jumpTo(deck, visualStep(deck) + delta);
  announce("Sync alinhou tempo e fase. Para o treino de ouvido, zere e faça de novo.");
}

function setLoop(deck, start, length) {
  const total = totalSteps(deck.track);
  const safeStart = mod(start, total);
  const len = clamp(Math.round(length), 1, total);
  deck.loop.start = safeStart;
  deck.loop.end = Math.min(total, safeStart + len);
  if (deck.loop.end <= deck.loop.start) {
    deck.loop.start = 0;
    deck.loop.end = Math.min(total, len);
  }
  deck.loop.active = true;
  if (deck.slip && engine) {
    deck.slipOriginStep = visualStep(deck);
    deck.slipOriginTime = engine.ctx.currentTime;
  }
}

function exitLoop(deck) {
  if (!deck.loop.active) {
    if (deck.loop.end > deck.loop.start) {
      deck.loop.active = true;
      jumpTo(deck, deck.loop.start);
    }
    return;
  }
  deck.loop.active = false;
  if (deck.slip) jumpTo(deck, slipStep(deck));
}

function onAction(id, action, button) {
  const deck = decks[id];
  if (!deck?.track && !["shift", "vinyl", "quantize", "slip", "mt", "master"].includes(action)) {
    if (action === "play" || action === "cue") announce("Escolha uma faixa na crate.");
  }
  switch (action) {
    case "play":
      ensureAudio().then(() => togglePlay(id));
      break;
    case "sync":
      ensureAudio().then(() => syncDeck(id));
      break;
    case "master":
      state.masterDeck = state.masterDeck === id ? null : id;
      break;
    case "shift":
      deck.shift = !deck.shift;
      break;
    case "vinyl":
      deck.vinyl = !deck.vinyl;
      break;
    case "quantize":
      deck.quantize = !deck.quantize;
      break;
    case "slip":
      deck.slip = !deck.slip;
      break;
    case "mt":
      rebase(deck);
      deck.masterTempo = !deck.masterTempo;
      break;
    case "pitch-reset":
      rebase(deck);
      deck.pitchSlider = 0;
      break;
    case "time-mode":
      deck.timeMode = deck.timeMode === "remain" ? "elapsed" : "remain";
      break;
    case "loop-in":
      if (deck.track) deck.loop.start = quantizeStep(deck, visualStep(deck));
      break;
    case "loop-out":
      if (deck.track) {
        const end = quantizeStep(deck, visualStep(deck));
        if (end > deck.loop.start) setLoop(deck, deck.loop.start, end - deck.loop.start);
      }
      break;
    case "reloop":
      if (deck.track) exitLoop(deck);
      break;
    case "loop-4":
      if (deck.track) {
        setLoop(deck, quantizeStep(deck, visualStep(deck)), 16);
        deck.loopUsed4 = true;
      }
      break;
    case "loop-half":
      if (deck.track && deck.loop.end > deck.loop.start) {
        setLoop(deck, deck.loop.start, Math.max(1, (deck.loop.end - deck.loop.start) / 2));
      }
      break;
    case "loop-double":
      if (deck.track && deck.loop.end > deck.loop.start) {
        setLoop(deck, deck.loop.start, (deck.loop.end - deck.loop.start) * 2);
      }
      break;
    case "search-back":
      if (deck.track) jumpTo(deck, visualStep(deck) - 4);
      break;
    case "search-fwd":
      if (deck.track) jumpTo(deck, visualStep(deck) + 4);
      break;
    case "jump-back":
      if (deck.track) jumpTo(deck, visualStep(deck) - deck.jumpBeats * 4);
      break;
    case "jump-fwd":
      if (deck.track) jumpTo(deck, visualStep(deck) + deck.jumpBeats * 4);
      break;
    case "jump-size": {
      const sizes = [1, 2, 4, 8, 16];
      const index = sizes.indexOf(deck.jumpBeats);
      deck.jumpBeats = sizes[(index + 1) % sizes.length];
      button.textContent = String(deck.jumpBeats);
      break;
    }
    case "key-down":
      deck.keyShift = clamp(deck.keyShift - 1, -6, 6);
      break;
    case "key-up":
      deck.keyShift = clamp(deck.keyShift + 1, -6, 6);
      break;
    case "mem":
      if (!deck.track) break;
      if (deck.shift) {
        deck.memories.push(quantizeStep(deck, visualStep(deck)));
        deck.memoryIndex = deck.memories.length - 1;
        announce("Memory cue guardado.");
      } else if (deck.memories.length) {
        jumpTo(deck, deck.memories[Math.max(0, deck.memoryIndex)]);
        deck.playing = true;
      }
      break;
    case "call":
      if (!deck.memories.length) break;
      deck.memoryIndex = (deck.memoryIndex + 1) % deck.memories.length;
      jumpTo(deck, deck.memories[deck.memoryIndex]);
      break;
    case "hot": {
      if (!deck.track) break;
      const index = Number(button.dataset.index);
      if (deck.shift) {
        deck.hotCues[index] = null;
        break;
      }
      if (deck.hotCues[index] == null) {
        deck.hotCues[index] = quantizeStep(deck, visualStep(deck));
        break;
      }
      jumpTo(deck, deck.hotCues[index]);
      ensureAudio().then(() => {
        deck.playing = true;
        deck.played = true;
      });
      break;
    }
    default:
      break;
  }
}

function renderCrate(deck) {
  const list = deck.el.querySelector("[data-bind='crate']");
  list.replaceChildren();
  TRACKS.forEach((track) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crate__track";
    button.setAttribute("aria-pressed", deck.track?.id === track.id ? "true" : "false");
    button.innerHTML = `<strong>${track.title}</strong><span>${track.bpm} · ${track.camelot} · ${track.genre}${track.pair ? " · par" : ""}</span>`;
    button.addEventListener("click", () => loadTrack(deck.id, track));
    list.append(button);
  });
}

function mountDeck(id, slot) {
  const deck = decks[id];
  const node = document.getElementById("deck-template").content.firstElementChild.cloneNode(true);
  node.classList.add(id === "a" ? "deck--a" : "deck--b");
  node.dataset.deck = id;
  node.querySelector("[data-bind='heading']").textContent = id === "a" ? "Deck A" : "Deck B";
  const cues = node.querySelector("[data-bind='hotcues']");
  for (let i = 0; i < 8; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "hot";
    button.dataset.index = String(i);
    button.textContent = String(i + 1);
    button.setAttribute("aria-label", `Hot cue ${i + 1}`);
    button.style.setProperty("--cue", CUE_COLORS[i]);
    cues.append(button);
  }
  const ranges = node.querySelector("[data-bind='ranges']");
  [6, 10, 16, 100].forEach((range) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.range = String(range);
    button.textContent = range === 100 ? "WIDE" : `±${range}`;
    button.addEventListener("click", () => {
      rebase(deck);
      const rate = deckRate(deck);
      deck.range = range;
      deck.pitchSlider = clamp((rate - 1) / (range / 100), -1, 1);
    });
    ranges.append(button);
  });
  deck.el = node;
  slot.append(node);
  renderCrate(deck);
  bindJog(node.querySelector("[data-action='jog']"), deck);
  bindPitch(node.querySelector("[data-action='pitch']"), deck);
  const overview = node.querySelector("[data-bind='overview']");
  overview.addEventListener("pointerdown", (event) => seekOverview(deck, overview, event));
  const cueButton = node.querySelector("[data-action='cue']");
  cueButton.addEventListener("pointerdown", () => {
    cueHold[id] = true;
    const run = () => {
      if (cueHold[id]) cueDown(id);
    };
    if (state.powered && engine?.ctx.state === "running") run();
    else ensureAudio().then(run);
  });
  const releaseCue = () => {
    cueHold[id] = false;
    cueUp(id);
  };
  cueButton.addEventListener("pointerup", releaseCue);
  cueButton.addEventListener("pointercancel", releaseCue);
}

function bindJog(el, deck) {
  let last = 0;
  const move = (event) => {
    if (!deck.touching || !deck.track) return;
    const angle = angleOf(event, el);
    const delta = deltaAngle(angle, last);
    last = angle;
    if (deck.scratching) {
      const steps = (delta / (Math.PI / 2)) * 4;
      const next = mod(visualStep(deck) + steps, totalSteps(deck.track));
      deck.originStep = next;
      deck.originTime = engine ? engine.ctx.currentTime : 0;
      deck.cursor = mod(Math.round(next), totalSteps(deck.track));
      deck.nudged = true;
    } else {
      rebase(deck);
      deck.bend = clamp(1 + delta * 0.9, 0.9, 1.1);
      deck.nudged = true;
    }
  };
  el.addEventListener("pointerdown", (event) => {
    el.setPointerCapture(event.pointerId);
    last = angleOf(event, el);
    deck.touching = true;
    deck.scratching = Boolean(deck.vinyl && isInner(event, el) && deck.track);
    if (deck.scratching) deck.nudged = true;
  });
  el.addEventListener("pointermove", move);
  const end = () => {
    if (!deck.touching) return;
    deck.touching = false;
    const wasScratch = deck.scratching;
    deck.scratching = false;
    if (wasScratch && deck.track) jumpTo(deck, visualStep(deck));
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (event) => {
    if (!deck.track) return;
    if (event.key === "ArrowRight") jumpTo(deck, visualStep(deck) + (event.shiftKey ? 1 : 4));
    if (event.key === "ArrowLeft") jumpTo(deck, visualStep(deck) - (event.shiftKey ? 1 : 4));
  });
}

function bindPitch(el, deck) {
  const apply = (event) => {
    const rect = el.getBoundingClientRect();
    const ratio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    rebase(deck);
    deck.pitchSlider = ratio * 2 - 1;
    deck.nudged = true;
  };
  el.addEventListener("pointerdown", (event) => {
    el.setPointerCapture(event.pointerId);
    el.dataset.drag = "1";
    apply(event);
  });
  el.addEventListener("pointermove", (event) => {
    if (el.dataset.drag === "1") apply(event);
  });
  const end = () => {
    if (el.dataset.drag !== "1") return;
    el.dataset.drag = "0";
    if (Math.abs(deck.pitchSlider) < 0.035) {
      rebase(deck);
      deck.pitchSlider = 0;
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("dblclick", () => {
    rebase(deck);
    deck.pitchSlider = 0;
  });
  el.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.08 : 0.02;
    if (event.key === "ArrowDown") {
      rebase(deck);
      deck.pitchSlider = clamp(deck.pitchSlider + step, -1, 1);
      deck.nudged = true;
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      rebase(deck);
      deck.pitchSlider = clamp(deck.pitchSlider - step, -1, 1);
      deck.nudged = true;
      event.preventDefault();
    } else if (event.key === "Home") {
      rebase(deck);
      deck.pitchSlider = 0;
      event.preventDefault();
    }
  });
}

function seekOverview(deck, canvas, event) {
  if (!deck.track) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const step = ratio * totalSteps(deck.track);
  ensureAudio().then(() => jumpTo(deck, deck.quantize ? quantizeStep(deck, step) : step));
}

function angleOf(event, el) {
  const rect = el.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
}

function deltaAngle(next, prev) {
  let delta = next - prev;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function isInner(event, el) {
  const rect = el.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  return Math.hypot(dx, dy) < rect.width * 0.34;
}

function frame() {
  requestAnimationFrame(frame);
  if (state.powered && engine && document.visibilityState === "visible" && engine.ctx.state === "suspended") {
    engine.ctx.resume();
  }
  for (const id of ["a", "b"]) {
    const deck = decks[id];
    if (!deck.touching) deck.bend += (1 - deck.bend) * 0.2;
  }
  paint();
  updateMissions();
}

function paint() {
  for (const id of ["a", "b"]) paintDeck(decks[id]);
  paintMixer();
  const hint = document.getElementById("cue-hint");
  if (hint) {
    const cueOn = mix.a.cue || mix.b.cue;
    hint.hidden = !(cueOn && mix.cueMix < 0.08);
  }
}

function paintDeck(deck) {
  if (!deck.el) return;
  const q = (name) => deck.el.querySelector(`[data-bind="${name}"]`);
  const bpm = q("bpm");
  const pitch = q("pitch");
  const maskedBpm = state.ear && deck.track;
  const maskedPitch = state.hidePitch && deck.track;
  if (!deck.track) {
    bpm.textContent = "000.0";
    pitch.textContent = "0.00%";
    q("title").textContent = "Nenhuma faixa";
    q("artist").textContent = "";
    q("key").textContent = "—";
    q("phrase").textContent = "–. –";
    q("section").textContent = "Crate vazia";
    q("time").textContent = "--:--";
  } else {
    const effective = deck.track.bpm * deckRate(deck) * deck.bend;
    bpm.textContent = maskedBpm ? "···" : effective.toFixed(1);
    bpm.setAttribute("aria-label", `BPM efetivo ${effective.toFixed(1)}`);
    const percent = (deckRate(deck) - 1) * 100;
    pitch.textContent = maskedPitch ? "···" : `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
    q("title").textContent = deck.track.title;
    q("artist").textContent = deck.track.artist;
    const pc = mod(deck.track.pc + deck.keyShift, 12);
    const name = `${NOTE_NAMES[pc]} ${deck.track.minor ? "menor" : "maior"}`;
    q("key").textContent = deck.keyShift === 0 ? `${deck.track.camelot} · ${name}` : `${name} · ${deck.keyShift > 0 ? "+" : ""}${deck.keyShift}`;
    const step = visualStep(deck);
    const bar = Math.floor(step / 16) + 1;
    const beat = Math.floor((step % 16) / 4) + 1;
    q("phrase").textContent = `${((bar - 1) % 8) + 1}.${beat}`;
    q("section").textContent = deck.track ? sectionName(deck, step) : "—";
    const beats = deck.track.bars * 4;
    const secondsTotal = (beats * 60) / (deck.track.bpm * deckRate(deck));
    const elapsed = (step / 4) * (60 / (deck.track.bpm * deckRate(deck)));
    q("time-label").textContent = deck.timeMode === "remain" ? "RESTA" : "TOCOU";
    q("time").textContent = formatTime(deck.timeMode === "remain" ? secondsTotal - elapsed : elapsed);
    q("blurb").textContent = deck.track.blurb;
  }
  q("keyshift").textContent = deck.keyShift > 0 ? `+${deck.keyShift}` : String(deck.keyShift);
  const cap = q("pitch-cap");
  cap.style.top = `calc(${((deck.pitchSlider + 1) / 2) * 100}% - 10px)`;
  q("platter").style.transform = `rotate(${visualStep(deck) * 22.5}deg)`;
  q("beat-led").classList.toggle("is-on", Boolean(deck.playing && deck.track && visualStep(deck) % 4 < 0.45));
  press(deck.el, "play", deck.playing);
  press(deck.el, "shift", deck.shift);
  press(deck.el, "vinyl", deck.vinyl);
  press(deck.el, "quantize", deck.quantize);
  press(deck.el, "slip", deck.slip);
  press(deck.el, "mt", deck.masterTempo);
  press(deck.el, "master", state.masterDeck === deck.id);
  press(deck.el, "reloop", deck.loop.active);
  deck.el.querySelectorAll("[data-range]").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.range) === deck.range ? "true" : "false");
  });
  deck.el.querySelectorAll("[data-action='hot']").forEach((button) => {
    const filled = deck.hotCues[Number(button.dataset.index)] != null;
    button.classList.toggle("is-set", filled);
  });
  drawWave(q("zoom"), deck, "zoom");
  drawWave(q("overview"), deck, "overview");
  const pitchEl = deck.el.querySelector("[data-action='pitch']");
  const percent = deck.track ? (deckRate(deck) - 1) * 100 : 0;
  pitchEl.setAttribute("aria-valuenow", percent.toFixed(2));
  pitchEl.setAttribute("aria-valuetext", `${percent.toFixed(2)} por cento. Para baixo acelera.`);
}

function sectionName(deck, step) {
  const bar = Math.floor(step / 16);
  const found = [
    [0, 8, "Intro"],
    [8, 16, "Base"],
    [16, 24, "Quebra"],
    [24, 32, "Drop"],
  ].find(([from, to]) => bar >= from && bar < to);
  return found ? found[2] : "—";
}

function paintMixer() {
  document.querySelectorAll("[data-read]").forEach((node) => {
    const param = node.dataset.read;
    const channel = node.closest("[data-channel]")?.dataset.channel;
    const value = channel ? mix[channel][param] : mix[param];
    node.textContent = readValue(param, value);
  });
  document.querySelectorAll("[data-param='cue']").forEach((button) => {
    const channel = button.closest("[data-channel]").dataset.channel;
    button.setAttribute("aria-pressed", mix[channel].cue ? "true" : "false");
  });
  document.querySelectorAll("[data-curve]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.curve === mix.curve ? "true" : "false");
  });
  if (!engine) return;
  paintMeter("a", peak(engine.decks.a.analyser, engine.decks.a.meterBuf));
  paintMeter("b", peak(engine.decks.b.analyser, engine.decks.b.meterBuf));
  paintMeter("master", peak(engine.booth, engine.boothBuf));
}

const meterHold = { a: 0, b: 0, master: 0 };

function paintMeter(id, level) {
  const meter = document.querySelector(`[data-meter="${id}"] span`);
  if (!meter) return;
  meterHold[id] = Math.max(level, meterHold[id] * 0.82);
  const shown = clamp(meterHold[id] * 1.35, 0, 1);
  meter.style.transform = `scaleY(${shown})`;
  meter.parentElement.classList.toggle("is-hot", shown > 0.92);
}

function readValue(param, value) {
  if (param === "hi" || param === "mid" || param === "low") {
    const db = eqDb(value);
    if (db <= -36) return "KILL";
    if (Math.abs(db) < 0.4) return "0";
    return `${db > 0 ? "+" : ""}${db.toFixed(0)}`;
  }
  if (param === "filter") {
    if (value > 0.47 && value < 0.53) return "OFF";
    return value < 0.5 ? "LPF" : "HPF";
  }
  if (param === "cueMix") {
    if (value < 0.05) return "SALA";
    if (value > 0.95) return "FONE";
    return "MISTO";
  }
  if (param === "trim") {
    if (value < 0.02) return "MUTE";
    const db = ((value - 0.75) / 0.25) * 6;
    if (Math.abs(db) < 0.35) return "0 dB";
    return `${db > 0 ? "+" : ""}${db.toFixed(1)}`;
  }
  return `${Math.round(value * 100)}`;
}

function drawWave(canvas, deck, mode) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#070806";
  ctx.fillRect(0, 0, width, height);
  if (!deck.track || !deck.wave) return;
  const total = totalSteps(deck.track);
  const stepNow = visualStep(deck);
  if (mode === "overview") {
    for (let bar = 0; bar < deck.track.bars; bar += 8) {
      const name = sectionName(deck, bar * 16);
      ctx.fillStyle = SECTION_TINT[name] ?? "transparent";
      ctx.fillRect((bar / deck.track.bars) * width, 0, (8 / deck.track.bars) * width, height);
    }
  }
  const windowSteps = mode === "zoom" ? 64 : total;
  const start = mode === "zoom" ? stepNow - windowSteps / 2 : 0;
  for (let x = 0; x < width; x += 1) {
    const index = mod(Math.floor(start + (x / width) * windowSteps), total);
    const low = deck.wave[index * 3];
    const mid = deck.wave[index * 3 + 1];
    const high = deck.wave[index * 3 + 2];
    const maxH = height - 6;
    let y = height - 3;
    const lowH = low * maxH * 0.5;
    const midH = mid * maxH * 0.3;
    const highH = high * maxH * 0.24;
    ctx.fillStyle = "#ff6a3d";
    ctx.fillRect(x, y - lowH, 1, lowH);
    y -= lowH;
    ctx.fillStyle = "#e4ff57";
    ctx.fillRect(x, y - midH, 1, midH);
    y -= midH;
    ctx.fillStyle = "#7ed0c4";
    ctx.fillRect(x, y - highH, 1, highH);
  }
  ctx.fillStyle = "#e4ff57";
  if (mode === "zoom") ctx.fillRect(width / 2, 0, Math.max(1, dpr), height);
  else ctx.fillRect((stepNow / total) * width, 0, Math.max(1, dpr), height);
}

function updateMissions() {
  const now = performance.now();
  state.missions.load = Boolean(decks.a.track && decks.b.track);
  state.missions.transport = Boolean(decks.a.played && decks.a.cueHits > 0);
  const locked = phaseLocked();
  if (locked && !decks.a.syncUsed && !decks.b.syncUsed && practiced()) {
    if (!state.phaseSince) state.phaseSince = now;
  } else state.phaseSince = 0;
  state.missions.match = Boolean(state.phaseSince && now - state.phaseSince > 1200);
  if (bassSwap()) {
    if (!state.swapSince) state.swapSince = now;
  } else state.swapSince = 0;
  state.missions.swap = Boolean(state.swapSince && now - state.swapSince > 900);
  state.missions.loop = decks.a.loopUsed4 || decks.b.loopUsed4;

  const order = ["load", "transport", "match", "swap", "loop"];
  let current = order.find((id) => !state.missions[id]) ?? "loop";
  document.querySelectorAll("[data-mission]").forEach((item) => {
    const id = item.dataset.mission;
    item.classList.toggle("is-done", state.missions[id]);
    item.classList.toggle("is-now", id === current && !state.missions[id]);
  });
  const note = document.getElementById("mission-note");
  if (!note) return;
  if ((decks.a.syncUsed || decks.b.syncUsed) && !state.missions.match) {
    note.textContent = "O sync cumpriu o tempo. Zere a tentativa para treinar o ouvido.";
  } else if (state.missions.loop && state.missions.match && state.missions.swap) {
    note.textContent = "As cinco missões fecharam. Grave o que a mão fez e repita amanhã, mais devagar.";
  } else {
    note.textContent = "";
  }
}

function phaseLocked() {
  if (!decks.a.playing || !decks.b.playing || !decks.a.track || !decks.b.track) return false;
  const bpmA = decks.a.track.bpm * deckRate(decks.a);
  const bpmB = decks.b.track.bpm * deckRate(decks.b);
  if (Math.abs(bpmA - bpmB) > 0.35) return false;
  let delta = Math.abs(visualStep(decks.a) - visualStep(decks.b)) % 4;
  if (delta > 2) delta = 4 - delta;
  return delta < 0.28;
}

function practiced() {
  return decks.a.nudged || decks.b.nudged || Math.abs(decks.a.pitchSlider) > 0.02 || Math.abs(decks.b.pitchSlider) > 0.02;
}

function bassSwap() {
  if (!decks.a.playing || !decks.b.playing) return false;
  if (mix.a.fader < 0.6 || mix.b.fader < 0.6) return false;
  const lowA = mix.a.low;
  const lowB = mix.b.low;
  return (lowA < 0.14 && lowB > 0.4) || (lowB < 0.14 && lowA > 0.4);
}

function press(root, action, on) {
  const button = root.querySelector(`[data-action="${action}"]`);
  if (button) button.setAttribute("aria-pressed", on ? "true" : "false");
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function announce(text) {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = text;
  });
}

function bindMixer() {
  document.querySelectorAll("input[data-param]").forEach((input) => {
    const apply = () => {
      const param = input.dataset.param;
      const channel = input.closest("[data-channel]")?.dataset.channel;
      const value = Number(input.value);
      if (channel) mix[channel][param] = value;
      else mix[param] = value;
      applyMixer();
    };
    input.addEventListener("input", apply);
    apply();
  });
  document.querySelectorAll("[data-param='cue']").forEach((button) => {
    button.addEventListener("click", () => {
      const channel = button.closest("[data-channel]").dataset.channel;
      mix[channel].cue = !mix[channel].cue;
      applyMixer();
    });
  });
  document.querySelectorAll("[data-curve]").forEach((button) => {
    button.addEventListener("click", () => {
      mix.curve = button.dataset.curve;
      applyMixer();
    });
  });
}

function bindKeys() {
  const down = new Set();
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.target.closest("input, textarea")) return;
    if (event.code === "KeyZ") ensureAudio().then(() => togglePlay("a"));
    if (event.code === "KeyN") ensureAudio().then(() => togglePlay("b"));
    if (event.code === "KeyX") {
      down.add("a");
      ensureAudio().then(() => cueDown("a"));
    }
    if (event.code === "KeyM") {
      down.add("b");
      ensureAudio().then(() => cueDown("b"));
    }
    if (event.code === "KeyC") syncDeck("a");
    if (event.code === "KeyK") syncDeck("b");
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyX") cueUp("a");
    if (event.code === "KeyM") cueUp("b");
  });
}

function init() {
  mountDeck("a", document.getElementById("slot-a"));
  mountDeck("b", document.getElementById("slot-b"));
  bindMixer();
  bindKeys();
  const booth = document.getElementById("booth");
  booth.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.dataset.action === "cue" || button.dataset.action === "jog" || button.dataset.action === "pitch") return;
    const deckEl = button.closest(".deck");
    if (!deckEl) return;
    onAction(deckEl.dataset.deck, button.dataset.action, button);
  });
  document.getElementById("power").addEventListener("click", () => {
    ensureAudio().then(() => announce("Sistema ligado. Volume do master em torno da metade."));
  });
  document.getElementById("ear").addEventListener("change", (event) => {
    state.ear = event.target.checked;
  });
  document.getElementById("hide-pitch").addEventListener("change", (event) => {
    state.hidePitch = event.target.checked;
  });
  document.getElementById("reset-match").addEventListener("click", () => {
    decks.a.syncUsed = false;
    decks.b.syncUsed = false;
    rebase(decks.b);
    decks.b.pitchSlider = 0;
    announce("Pitch do deck B zerado. O sync não conta nesta tentativa.");
  });
  document.querySelectorAll(".panel-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      booth.dataset.panel = button.dataset.panel;
      document.querySelectorAll(".panel-switch button").forEach((item) => {
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      });
    });
  });
  const status = document.getElementById("booth-status");
  window.VIBEDJ = {
    decks,
    mix,
    state,
    playing: (id) => decks[id].playing,
    bpm: (id) => (decks[id].track ? decks[id].track.bpm * deckRate(decks[id]) : 0),
  };
  setInterval(() => {
    const line = ["a", "b"]
      .map((id) => {
        const deck = decks[id];
        const bpm = deck.track ? (deck.track.bpm * deckRate(deck)).toFixed(1) : "—";
        return `${id.toUpperCase()} ${deck.playing ? "toca" : "parado"} ${state.ear ? "" : bpm}`.trim();
      })
      .join(" · ");
    status.textContent = line;
  }, 250);
  requestAnimationFrame(frame);
}

init();
