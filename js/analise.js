import { buildElementInventory, renderInventarioCards } from "./inventario-elementos.js";

const ACCEPT = "audio/*,.mp3,.wav,.wave,.flac,.ogg,.oga,.m4a,.aac,.aiff,.aif,.webm";
const MAX_BYTES = 80 * 1024 * 1024;
const NFFT = 2048;
const HOP = 1024;
const BANDS = [
  { id: "sub", label: "Sub", lo: 20, hi: 90, hint: "20–90 Hz" },
  { id: "grave", label: "Grave", lo: 90, hi: 220, hint: "90–220 Hz" },
  { id: "corpo", label: "Corpo", lo: 220, hi: 900, hint: "220–900 Hz" },
  { id: "presenca", label: "Presença", lo: 900, hi: 4500, hint: "0,9–4,5 kHz" },
  { id: "ar", label: "Ar", lo: 4500, hi: 24000, hint: "4,5 kHz+" },
];

const mount = document.querySelector("[data-analise]");
if (mount) boot(mount);

function boot(root) {
  const state = {
    ctx: null,
    buffer: null,
    mono: null,
    peaks: null,
    duration: 0,
    excerptStart: 0,
    excerptSeconds: 12,
    layers: new Map(),
    playing: false,
    source: null,
    layerId: "",
    startedAt: 0,
    fileTimeAtStart: 0,
    frame: 0,
    job: 0,
    inventario: null,
  };

  root.innerHTML = renderShell();
  const ui = bind(root);

  ui.input.addEventListener("change", () => {
    const file = ui.input.files && ui.input.files[0];
    if (file) readFile(file);
  });
  ui.drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.drop.classList.add("is-over");
  });
  ui.drop.addEventListener("dragleave", () => ui.drop.classList.remove("is-over"));
  ui.drop.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.drop.classList.remove("is-over");
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) readFile(file);
  });
  ui.wave.addEventListener("click", (event) => {
    if (!state.duration) return;
    const ratio = event.offsetX / ui.wave.clientWidth;
    state.excerptStart = clamp(ratio * state.duration, 0, Math.max(0, state.duration - 0.25));
    ui.window.textContent = windowLabel();
    drawWave();
    if (state.playing && state.layerId === "original") playOriginal(state.excerptStart);
  });
  ui.seconds.addEventListener("change", () => {
    state.excerptSeconds = Number(ui.seconds.value);
    ui.window.textContent = windowLabel();
    drawWave();
  });
  ui.read.addEventListener("click", () => separateExcerpt());
  ui.play.addEventListener("click", () => playOriginal(state.excerptStart));
  ui.stop.addEventListener("click", () => halt());
  ui.copy.addEventListener("click", () => copyReport());
  root.querySelectorAll("[data-layer]").forEach((button) => {
    button.addEventListener("click", () => playLayer(button.dataset.layer));
  });

  function ensureCtx() {
    if (!state.ctx) state.ctx = new AudioContext();
    return state.ctx;
  }

  async function readFile(file) {
    const mine = ++state.job;
    mountJob = mine;
    state.name = file.name;
    halt();
    state.layers.clear();
    paintLayers();
    ui.result.hidden = true;
    if (file.size > MAX_BYTES) {
      say(`Este arquivo tem ${mb(file.size)} MB. O limite desta leitura é ${mb(MAX_BYTES)} MB.`);
      return;
    }
    say(`Decodificando ${file.name}…`);
    try {
      const ctx = ensureCtx();
      await ctx.resume();
      const bytes = await file.arrayBuffer();
      if (mine !== state.job) return;
      const audio = await ctx.decodeAudioData(bytes.slice(0));
      if (mine !== state.job) return;
      state.buffer = audio;
      state.mono = mixdown(audio);
      state.duration = audio.duration;
      state.excerptStart = 0;
      state.peaks = peaksOf(state.mono, 1600);
      ui.file.textContent = state.name;
      ui.result.hidden = false;
      fillFacts({
        duration: formatTime(audio.duration),
        rate: `${audio.sampleRate} Hz`,
        channels: audio.numberOfChannels === 1 ? "Mono" : `${audio.numberOfChannels} canais`,
        bpm: "…",
      });
      ui.window.textContent = windowLabel();
      drawWave();
      const overview = await scanFile(state.mono, audio.sampleRate, audio, (ratio) => {
        if (mine === state.job) say(`Espectrograma… ${Math.round(ratio * 100)}%`);
      }, mine);
      if (mine !== state.job || !overview) return;
      state.overview = overview;
      fillFacts({
        duration: formatTime(audio.duration),
        rate: `${audio.sampleRate} Hz`,
        channels: audio.numberOfChannels === 1 ? "Mono" : `${audio.numberOfChannels} canais`,
        bpm: overview.bpm ? `${overview.bpm.toFixed(1)} BPM` : "—",
      });
      ui.centroid.textContent = overview.centroid ? `${Math.round(overview.centroid)} Hz` : "—";
      ui.width.textContent = audio.numberOfChannels > 1 ? `${Math.round(overview.side * 100)}%` : "Mono";
      paintShares(ui.bands, overview.bands, "is-copper");
      paintShares(ui.image, [
        { id: "centro", label: "Centro", share: 1 - overview.side },
        { id: "lados", label: "Lados", share: overview.side },
      ], "");
      paintInventario();
      const analisePayload = report();
      ui.report.textContent = JSON.stringify(analisePayload, null, 2);
      window.__vibedjLastAnalise = analisePayload;
      window.dispatchEvent(new CustomEvent("vibedj:analise", { detail: analisePayload }));
      say(overview.bpm ? `Andamento estimado: ${overview.bpm.toFixed(1)} BPM. ${overview.note}` : overview.note);
      drawWave();
      await separateExcerpt();
    } catch {
      if (mine !== state.job) return;
      say("O navegador não decodificou este arquivo. WAV ou MP3 costumam abrir.");
    }
  }

  async function scanFile(mono, rate, audio, onProgress, mine) {
    const cols = 840;
    const rows = 280;
    const canvas = ui.spec;
    canvas.width = cols;
    canvas.height = rows;
    const ctx2d = canvas.getContext("2d");
    const image = ctx2d.createImageData(cols, rows);
    const bandEnergy = BANDS.map(() => 0);
    let magSum = 0;
    let centroidSum = 0;
    const re = new Float32Array(NFFT);
    const im = new Float32Array(NFFT);
    const window = hann(NFFT);
    const usable = Math.max(0, mono.length - NFFT);
    for (let col = 0; col < cols; col += 1) {
      if (mine !== state.job) return null;
      const start = usable ? Math.floor((col / cols) * usable) : 0;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < NFFT; i += 1) re[i] = (mono[start + i] || 0) * window[i];
      fft(re, im);
      let frameMag = 0;
      let frameCentroid = 0;
      const mags = new Float32Array(NFFT / 2);
      for (let bin = 1; bin < NFFT / 2; bin += 1) {
        const mag = Math.hypot(re[bin], im[bin]);
        mags[bin] = mag;
        const freq = (bin * rate) / NFFT;
        frameMag += mag;
        frameCentroid += freq * mag;
        const band = BANDS.findIndex((item) => freq >= item.lo && freq < item.hi);
        if (band >= 0) bandEnergy[band] += mag;
      }
      magSum += frameMag;
      centroidSum += frameCentroid;
      for (let row = 0; row < rows; row += 1) {
        const freq = freqOfRow(row, rows, rate);
        const bin = clamp(Math.round((freq * NFFT) / rate), 1, NFFT / 2 - 1);
        const mag = mags[bin];
        const db = 20 * Math.log10(mag / NFFT + 1e-9);
        const tone = clamp((db + 82) / 76, 0, 1);
        const color = heat(tone);
        const pixel = ((row * cols) + col) * 4;
        image.data[pixel] = color[0];
        image.data[pixel + 1] = color[1];
        image.data[pixel + 2] = color[2];
        image.data[pixel + 3] = 255;
      }
      if (col % 24 === 0) {
        ctx2d.putImageData(image, 0, 0);
        onProgress(col / cols);
        await wait(0);
      }
    }
    ctx2d.putImageData(image, 0, 0);
    paintScale(ctx2d, cols, rows);
    const total = bandEnergy.reduce((sum, value) => sum + value, 0) || 1;
    const bands = BANDS.map((band, index) => ({
      id: band.id,
      label: band.label,
      share: bandEnergy[index] / total,
    }));
    const bpm = estimateBpm(mono, rate);
    const side = stereoSide(audio);
    return {
      bpm: bpm.bpm,
      note: bpm.note,
      centroid: magSum ? centroidSum / magSum : 0,
      bands,
      side,
    };
  }

  async function separateExcerpt() {
    if (!state.buffer) return;
    const mine = ++state.job;
    mountJob = mine;
    const rate = state.buffer.sampleRate;
    const span = Math.min(state.excerptSeconds, state.duration - state.excerptStart);
    if (span * rate < NFFT) {
      say("O trecho ficou curto demais para separar.");
      return;
    }
    say("Separando o trecho…");
    ui.read.disabled = true;
    const start = Math.floor(state.excerptStart * rate);
    const length = Math.min(Math.floor(span * rate), state.buffer.length - start);
    const slice = state.mono.subarray(start, start + length);
    const mono = new Float32Array(slice);
    const stft = await computeStft(mono, mine);
    if (!stft || mine !== state.job) {
      ui.read.disabled = false;
      return;
    }
    const masks = await harmonicMasks(stft, (ratio) => {
      if (mine === state.job) say(`Separando ataque e harmonia… ${Math.round(ratio * 100)}%`);
    }, mine);
    if (!masks || mine !== state.job) {
      ui.read.disabled = false;
      return;
    }
    const ctx = ensureCtx();
    const layers = new Map();
    layers.set("original", { buffer: sliceBuffer(ctx, state.buffer, start, length), share: 1, hint: "A mix do trecho" });
    const midSide = midSideBuffers(ctx, state.buffer, start, length);
    layers.set("mid", { buffer: midSide.mid, share: 1 - (state.overview ? state.overview.side : 0), hint: "O que está no centro" });
    layers.set("side", { buffer: midSide.side, share: state.overview ? state.overview.side : 0, hint: "O que está dos lados" });
    const harmonic = await istft(stft, (frame, bin) => masks.harmonic[frame * masks.bins + binIndex(bin, stft.nfft)], mine);
    const percussive = await istft(stft, (frame, bin) => 1 - masks.harmonic[frame * masks.bins + binIndex(bin, stft.nfft)], mine);
    if (!harmonic || !percussive || mine !== state.job) {
      ui.read.disabled = false;
      return;
    }
    const hShare = maskEnergy(stft, masks, true);
    layers.set("percussivo", { buffer: audioBuffer(ctx, normalize(percussive), rate), share: 1 - hShare, hint: "Ataques" });
    layers.set("harmonico", { buffer: audioBuffer(ctx, normalize(harmonic), rate), share: hShare, hint: "Notas sustentadas" });
    for (const band of BANDS) {
      if (mine !== state.job) {
        ui.read.disabled = false;
        return;
      }
      const samples = await istft(stft, (frame, bin) => bandGain(binFreq(bin, stft.nfft, rate), band.lo, band.hi, rate), mine);
      if (!samples) {
        ui.read.disabled = false;
        return;
      }
      const found = state.overview && state.overview.bands.find((item) => item.id === band.id);
      layers.set(band.id, {
        buffer: audioBuffer(ctx, normalize(samples), rate),
        share: found ? found.share : 0,
        hint: band.hint,
      });
      say(`Faixa ${band.label} pronta.`);
      await wait(0);
    }
    if (mine !== state.job) return;
    state.layers = layers;
    paintLayers();
    paintShares(ui.texture, [
      { id: "percussivo", label: "Ataque", share: 1 - hShare },
      { id: "harmonico", label: "Harmonia", share: hShare },
    ], "is-sea");
    paintInventario();
    const analisePayload = report();
    ui.report.textContent = JSON.stringify(analisePayload, null, 2);
    window.__vibedjLastAnalise = analisePayload;
    window.dispatchEvent(new CustomEvent("vibedj:analise", { detail: analisePayload }));
    ui.read.disabled = false;
    say("Trecho separado. Cada botão é uma escuta, nivelada para você ouvir. A porcentagem é a energia real.");
  }

  function playOriginal(offset) {
    if (!state.buffer) return;
    ensureCtx().resume();
    startSource(state.buffer, clamp(offset, 0, Math.max(0, state.duration - 0.05)), false, "original");
    say("Tocando o arquivo.");
  }

  function playLayer(id) {
    const layer = state.layers.get(id);
    if (!layer) return;
    ensureCtx().resume();
    startSource(layer.buffer, 0, true, id);
    say(`Tocando ${layerName(id)}, em loop no trecho.`);
  }

  function startSource(buffer, offset, loop, id) {
    halt(false);
    const ctx = ensureCtx();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0, offset);
    source.onended = () => {
      if (state.source !== source) return;
      state.playing = false;
      paintLayers();
      drawWave();
    };
    state.source = source;
    state.playing = true;
    state.layerId = id;
    state.startedAt = ctx.currentTime;
    state.fileTimeAtStart = id === "original" ? offset : state.excerptStart;
    state.layerDuration = buffer.duration;
    paintLayers();
    state.frame = requestAnimationFrame(tick);
  }

  function halt(announce = true) {
    state.playing = false;
    cancelAnimationFrame(state.frame);
    if (state.source) {
      try {
        state.source.stop();
      } catch {
        /* já parou */
      }
      state.source = null;
    }
    paintLayers();
    drawWave();
    if (announce) say("Parado.");
  }

  function tick() {
    if (!state.playing) return;
    drawWave();
    state.frame = requestAnimationFrame(tick);
  }

  function drawWave() {
    const canvas = ui.wave;
    const width = canvas.width;
    const height = canvas.height;
    const ctx2d = canvas.getContext("2d");
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.fillStyle = "#070806";
    ctx2d.fillRect(0, 0, width, height);
    if (!state.peaks) return;
    const span = Math.min(state.excerptSeconds, Math.max(0, state.duration - state.excerptStart));
    if (state.duration) {
      const x0 = (state.excerptStart / state.duration) * width;
      const x1 = ((state.excerptStart + span) / state.duration) * width;
      ctx2d.fillStyle = "rgba(228, 255, 87, 0.12)";
      ctx2d.fillRect(x0, 0, Math.max(2, x1 - x0), height);
    }
    ctx2d.strokeStyle = "#e8e2d4";
    ctx2d.beginPath();
    const mid = height / 2;
    for (let x = 0; x < width; x += 1) {
      const index = Math.floor((x / width) * state.peaks.length);
      const peak = state.peaks[index] || 0;
      const y = peak * (mid - 4);
      ctx2d.moveTo(x + 0.5, mid - y);
      ctx2d.lineTo(x + 0.5, mid + y);
    }
    ctx2d.stroke();
    if (state.overview && state.overview.bpm && state.duration) {
      const beat = 60 / state.overview.bpm;
      ctx2d.strokeStyle = "rgba(215, 176, 138, 0.35)";
      for (let time = 0; time < state.duration; time += beat) {
        const x = (time / state.duration) * width;
        ctx2d.beginPath();
        ctx2d.moveTo(x, 0);
        ctx2d.lineTo(x, height);
        ctx2d.stroke();
      }
    }
    if (state.playing && state.ctx) {
      const elapsed = state.ctx.currentTime - state.startedAt;
      const time = state.layerId === "original"
        ? state.fileTimeAtStart + elapsed
        : state.excerptStart + (elapsed % Math.max(state.layerDuration, 0.001));
      const x = clamp(time / state.duration, 0, 1) * width;
      ctx2d.strokeStyle = "#e4ff57";
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, height);
      ctx2d.stroke();
    }
  }

  function paintLayers() {
    root.querySelectorAll("[data-layer]").forEach((button) => {
      const ready = state.layers.has(button.dataset.layer);
      button.disabled = !ready;
      button.setAttribute("aria-pressed", String(state.playing && state.layerId === button.dataset.layer));
      const share = ready ? state.layers.get(button.dataset.layer).share : null;
      const small = button.querySelector("small");
      if (small && share != null && button.dataset.layer !== "original") {
        small.textContent = `${Math.round(share * 100)}% · ${layerHint(button.dataset.layer)}`;
      }
    });
    ui.play.disabled = !state.buffer;
  }

  function paintShares(list, items, tone) {
    list.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = tone;
      const name = document.createElement("span");
      name.textContent = item.label;
      const bar = document.createElement("i");
      const fill = document.createElement("b");
      fill.style.width = `${Math.round(item.share * 100)}%`;
      bar.append(fill);
      const value = document.createElement("span");
      value.textContent = `${Math.round(item.share * 100)}%`;
      row.append(name, bar, value);
      list.append(row);
    });
  }

  function fillFacts(facts) {
    ui.duration.textContent = facts.duration;
    ui.rate.textContent = facts.rate;
    ui.channels.textContent = facts.channels;
    ui.bpm.textContent = facts.bpm;
  }

  function paintInventario() {
    if (!state.overview || !state.mono) return;
    state.inventario = buildElementInventory({
      overview: state.overview,
      mono: state.mono,
      rate: state.buffer.sampleRate,
      duration: state.duration,
      layers: state.layers.size ? state.layers : null,
    });
    if (ui.inventarioWrap) {
      ui.inventarioWrap.hidden = false;
      ui.inventarioWrap.innerHTML = `<h3>Inventário por elemento</h3>
        <p class="lab-caption">Kick, clap, hi-hat, baixo, stab, transição, percussão e vocal — estimativa ao decodificar. Refine ouvindo o trecho separado.</p>
        ${renderInventarioCards(state.inventario)}`;
    }
  }

  function report() {
    const overview = state.overview || {};
    return {
      arquivo: state.name || "",
      origem: "arquivo local, lido só neste navegador",
      aviso: "Estimativas de mix. Não são as faixas da sessão e não formam uma cópia da obra.",
      duracao_segundos: round(state.duration, 2),
      amostragem_hz: state.buffer ? state.buffer.sampleRate : 0,
      canais: state.buffer ? state.buffer.numberOfChannels : 0,
      bpm_estimado: overview.bpm ? round(overview.bpm, 1) : null,
      centroide_hz: overview.centroid ? Math.round(overview.centroid) : null,
      lados_energia: overview.side != null ? round(overview.side, 3) : null,
      faixas: overview.bands || [],
      inventario_elementos: state.inventario,
      trecho: {
        inicio_segundos: round(state.excerptStart, 2),
        duracao_segundos: state.excerptSeconds,
      },
    };
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(ui.report.textContent);
      say("Leitura copiada.");
    } catch {
      say("Selecione o JSON e copie manualmente.");
    }
  }

  function say(text) {
    ui.status.textContent = text;
  }

  function windowLabel() {
    if (!state.duration) return "Nenhum arquivo.";
    const span = Math.min(state.excerptSeconds, Math.max(0, state.duration - state.excerptStart));
    return `Trecho ${formatTime(state.excerptStart)} → ${formatTime(state.excerptStart + span)}. Clique na forma de onda para mover.`;
  }
}

function renderShell() {
  const layers = [
    ["original", "Arquivo", "O trecho inteiro"],
    ["mid", "Centro", "Kick, baixo, voz"],
    ["side", "Lados", "Hats, ar, efeitos"],
    ["percussivo", "Percussivo", "Ataques"],
    ["harmonico", "Harmônico", "Notas longas"],
    ["sub", "Sub", "20–90 Hz"],
    ["grave", "Grave", "90–220 Hz"],
    ["corpo", "Corpo", "220–900 Hz"],
    ["presenca", "Presença", "0,9–4,5 kHz"],
    ["ar", "Ar", "4,5 kHz+"],
  ].map(([id, name, hint]) => `<button type="button" data-layer="${id}" disabled><b>${name}</b><small>${hint}</small></button>`).join("");
  return `<label class="drop">
      <input type="file" accept="${ACCEPT}" data-file>
      <span>Solte um MP3, WAV, FLAC, OGG ou M4A. Ou clique para escolher. A leitura fica neste navegador.</span>
    </label>
    <p class="lab-status" data-status aria-live="polite">Nenhum arquivo aberto.</p>
    <div data-result hidden>
      <p data-filename></p>
      <div class="analise-facts">
        <p><span>Duração</span><strong data-duration>—</strong></p>
        <p><span>Amostragem</span><strong data-rate>—</strong></p>
        <p><span>Canais</span><strong data-channels>—</strong></p>
        <p><span>Andamento</span><strong data-bpm>—</strong></p>
      </div>
      <div class="analise-facts">
        <p><span>Brilho</span><strong data-centroid>—</strong></p>
        <p><span>Lados</span><strong data-width>—</strong></p>
      </div>
      <canvas class="analise-canvas analise-canvas--wave" data-wave width="1600" height="180" aria-label="Forma de onda. Clique para escolher o início do trecho."></canvas>
      <p class="lab-caption" data-window></p>
      <canvas class="analise-canvas analise-canvas--spec" data-spec width="840" height="280" aria-label="Espectrograma. Grave embaixo, agudo em cima."></canvas>
      <p class="lab-caption">Espectrograma do arquivo inteiro. Cobre é o que mal aparece, lima é o que ocupa o ar. Grave embaixo, agudo em cima.</p>
      <h3>Energia por faixa</h3>
      <div class="share" data-bands></div>
      <h3>Imagem estéreo</h3>
      <div class="share" data-image></div>
      <h3>Ataque e harmonia do trecho</h3>
      <div class="share" data-texture></div>
      <div class="analise-tools">
        <label>Duração do trecho
          <select data-seconds>
            <option value="8">8 s</option>
            <option value="12" selected>12 s</option>
            <option value="16">16 s</option>
            <option value="24">24 s</option>
          </select>
        </label>
        <button type="button" class="btn btn--acid" data-read>Ler este trecho</button>
        <button type="button" class="btn btn--ghost" data-play disabled>Ouvir arquivo</button>
        <button type="button" class="btn btn--ghost" data-stop>Parar</button>
      </div>
      <div class="layer-grid">${layers}</div>
      <p class="lab-caption">Centro e lados vêm do estéreo. Percussivo e harmônico separam ataque de nota. As faixas cortam o espectro. Nenhuma delas é o kick, o baixo ou o vocal isolados da sessão.</p>
      <div data-inventario-wrap hidden></div>
      <h3>Leitura</h3>
      <pre data-report></pre>
      <button type="button" class="btn btn--ghost" data-copy>Copiar JSON</button>
    </div>`;
}

function bind(root) {
  return {
    drop: root.querySelector(".drop"),
    input: root.querySelector("[data-file]"),
    status: root.querySelector("[data-status]"),
    result: root.querySelector("[data-result]"),
    file: root.querySelector("[data-filename]"),
    duration: root.querySelector("[data-duration]"),
    rate: root.querySelector("[data-rate]"),
    channels: root.querySelector("[data-channels]"),
    bpm: root.querySelector("[data-bpm]"),
    centroid: root.querySelector("[data-centroid]"),
    width: root.querySelector("[data-width]"),
    wave: root.querySelector("[data-wave]"),
    spec: root.querySelector("[data-spec]"),
    window: root.querySelector("[data-window]"),
    bands: root.querySelector("[data-bands]"),
    image: root.querySelector("[data-image]"),
    texture: root.querySelector("[data-texture]"),
    seconds: root.querySelector("[data-seconds]"),
    read: root.querySelector("[data-read]"),
    play: root.querySelector("[data-play]"),
    stop: root.querySelector("[data-stop]"),
    report: root.querySelector("[data-report]"),
    copy: root.querySelector("[data-copy]"),
    inventarioWrap: root.querySelector("[data-inventario-wrap]"),
  };
}

function mixdown(buffer) {
  const mono = new Float32Array(buffer.length);
  const channels = buffer.numberOfChannels;
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / channels;
  }
  return mono;
}

function peaksOf(mono, columns) {
  const peaks = new Float32Array(columns);
  const block = Math.max(1, Math.floor(mono.length / columns));
  for (let column = 0; column < columns; column += 1) {
    const start = column * block;
    let peak = 0;
    const end = Math.min(mono.length, start + block);
    for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(mono[index]));
    peaks[column] = peak;
  }
  return peaks;
}

function stereoSide(buffer) {
  if (buffer.numberOfChannels < 2) return 0;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let mid = 0;
  let side = 0;
  for (let index = 0; index < left.length; index += 16) {
    const center = 0.5 * (left[index] + right[index]);
    const width = 0.5 * (left[index] - right[index]);
    mid += center * center;
    side += width * width;
  }
  return side / (mid + side + 1e-12);
}

function estimateBpm(mono, rate) {
  const hop = 512;
  const limit = Math.min(mono.length, rate * 45);
  const env = [];
  let previous = 0;
  for (let index = 0; index + hop < limit; index += hop) {
    let energy = 0;
    for (let sample = 0; sample < hop; sample += 4) {
      const value = mono[index + sample];
      energy += value * value;
    }
    env.push(Math.max(0, energy - previous));
    previous = energy;
  }
  if (env.length < 8) return { bpm: 0, note: "Trecho curto demais para o andamento." };
  const frameRate = rate / hop;
  let best = { bpm: 0, score: 0 };
  let second = 0;
  for (let bpm = 80; bpm <= 180; bpm += 0.5) {
    const lag = Math.round((frameRate * 60) / bpm);
    if (lag < 1 || lag >= env.length) continue;
    let score = 0;
    let count = 0;
    for (let index = 0; index + lag < env.length; index += 2) {
      score += env[index] * env[index + lag];
      count += 1;
    }
    score /= count || 1;
    const far = Math.abs(bpm - best.bpm) > 4;
    if (score > best.score) {
      if (far) second = best.score;
      best = { bpm, score };
    } else if (far && score > second) second = score;
  }
  let chosen = best.bpm;
  let note = "Estimativa pelo pulso dos ataques. Metade ou dobro ainda podem ser o compasso que você sente.";
  if (chosen > 145) {
    const half = scoreAt(env, frameRate, chosen / 2);
    if (half > best.score * 0.82) {
      chosen = chosen / 2;
      note = "O pulso forte estava no dobro. A leitura ficou na metade, mais perto do chão da pista.";
    }
  }
  const confidence = best.score ? second / best.score : 1;
  if (confidence > 0.92) note = "O andamento está disputado. Confira batendo o pé.";
  return { bpm: chosen, note };
}

function scoreAt(env, frameRate, bpm) {
  const lag = Math.round((frameRate * 60) / bpm);
  if (lag < 1 || lag >= env.length) return 0;
  let score = 0;
  let count = 0;
  for (let index = 0; index + lag < env.length; index += 2) {
    score += env[index] * env[index + lag];
    count += 1;
  }
  return score / (count || 1);
}

async function computeStft(mono, mine) {
  const window = hann(NFFT);
  const frames = Math.floor((mono.length - NFFT) / HOP) + 1;
  if (frames < 2) return null;
  const re = new Float32Array(frames * NFFT);
  const im = new Float32Array(frames * NFFT);
  const frameRe = new Float32Array(NFFT);
  const frameIm = new Float32Array(NFFT);
  for (let frame = 0; frame < frames; frame += 1) {
    if (frame % 20 === 0 && mine !== currentJob()) return null;
    frameRe.fill(0);
    frameIm.fill(0);
    const offset = frame * HOP;
    for (let index = 0; index < NFFT; index += 1) frameRe[index] = (mono[offset + index] || 0) * window[index];
    fft(frameRe, frameIm);
    re.set(frameRe, frame * NFFT);
    im.set(frameIm, frame * NFFT);
    if (frame % 30 === 0) await wait(0);
  }
  return { re, im, frames, nfft: NFFT, hop: HOP, window, length: mono.length };
}

function currentJob() {
  return mountJob;
}

let mountJob = 0;

async function harmonicMasks(stft, onProgress, mine) {
  const bins = stft.nfft / 2 + 1;
  const mag = new Float32Array(stft.frames * bins);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      const index = frame * stft.nfft + bin;
      mag[frame * bins + bin] = Math.hypot(stft.re[index], stft.im[index]);
    }
  }
  const harmonicMedian = new Float32Array(mag.length);
  const percussiveMedian = new Float32Array(mag.length);
  const radius = 8;
  const scratch = new Float32Array(radius * 2 + 1);
  for (let bin = 0; bin < bins; bin += 1) {
    if (mine !== currentJob()) return null;
    for (let frame = 0; frame < stft.frames; frame += 1) {
      let count = 0;
      for (let time = frame - radius; time <= frame + radius; time += 1) {
        const clamped = clamp(time, 0, stft.frames - 1);
        scratch[count] = mag[clamped * bins + bin];
        count += 1;
      }
      harmonicMedian[frame * bins + bin] = medianInPlace(scratch, count);
    }
    if (bin % 40 === 0) {
      onProgress(bin / bins / 2);
      await wait(0);
    }
  }
  for (let frame = 0; frame < stft.frames; frame += 1) {
    if (mine !== currentJob()) return null;
    for (let bin = 0; bin < bins; bin += 1) {
      let count = 0;
      for (let freq = bin - radius; freq <= bin + radius; freq += 1) {
        const clamped = clamp(freq, 0, bins - 1);
        scratch[count] = mag[frame * bins + clamped];
        count += 1;
      }
      percussiveMedian[frame * bins + bin] = medianInPlace(scratch, count);
    }
    if (frame % 24 === 0) {
      onProgress(0.5 + frame / stft.frames / 2);
      await wait(0);
    }
  }
  const harmonic = new Float32Array(mag.length);
  for (let index = 0; index < mag.length; index += 1) {
    const tone = harmonicMedian[index] * harmonicMedian[index];
    const hit = percussiveMedian[index] * percussiveMedian[index];
    harmonic[index] = tone / (tone + hit + 1e-12);
  }
  return { harmonic, bins };
}

async function istft(stft, maskAt, mine) {
  const out = new Float32Array(stft.length);
  const norm = new Float32Array(stft.length);
  const re = new Float32Array(stft.nfft);
  const im = new Float32Array(stft.nfft);
  for (let frame = 0; frame < stft.frames; frame += 1) {
    if (frame % 16 === 0 && mine !== currentJob()) return null;
    for (let bin = 0; bin < stft.nfft; bin += 1) {
      const mask = maskAt(frame, bin);
      const index = frame * stft.nfft + bin;
      re[bin] = stft.re[index] * mask;
      im[bin] = stft.im[index] * mask;
    }
    ifft(re, im);
    const offset = frame * stft.hop;
    for (let index = 0; index < stft.nfft; index += 1) {
      if (offset + index >= out.length) break;
      out[offset + index] += re[index] * stft.window[index];
      norm[offset + index] += stft.window[index] * stft.window[index];
    }
    if (frame % 20 === 0) await wait(0);
  }
  for (let index = 0; index < out.length; index += 1) {
    if (norm[index] > 1e-8) out[index] /= norm[index];
  }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >>> 1;
    for (; j & bit; bit >>>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const swapRe = re[i];
      re[i] = re[j];
      re[j] = swapRe;
      const swapIm = im[i];
      im[i] = im[j];
      im[j] = swapIm;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(angle);
    const wlenIm = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const even = i + k;
        const odd = even + half;
        const vRe = re[odd] * wRe - im[odd] * wIm;
        const vIm = re[odd] * wIm + im[odd] * wRe;
        re[odd] = re[even] - vRe;
        im[odd] = im[even] - vIm;
        re[even] += vRe;
        im[even] += vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function ifft(re, im) {
  const n = re.length;
  for (let index = 0; index < n; index += 1) im[index] = -im[index];
  fft(re, im);
  for (let index = 0; index < n; index += 1) {
    re[index] /= n;
    im[index] = -im[index] / n;
  }
}

function hann(n) {
  const window = new Float32Array(n);
  for (let index = 0; index < n; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (n - 1)));
  }
  return window;
}

function medianInPlace(values, count) {
  for (let index = 1; index < count; index += 1) {
    const value = values[index];
    let cursor = index - 1;
    while (cursor >= 0 && values[cursor] > value) {
      values[cursor + 1] = values[cursor];
      cursor -= 1;
    }
    values[cursor + 1] = value;
  }
  const mid = count >> 1;
  if (count % 2) return values[mid];
  return 0.5 * (values[mid - 1] + values[mid]);
}

function maskEnergy(stft, masks, harmonic) {
  let tone = 0;
  let hit = 0;
  const bins = masks.bins;
  for (let frame = 0; frame < stft.frames; frame += 4) {
    for (let bin = 1; bin < bins; bin += 4) {
      const index = frame * stft.nfft + bin;
      const mag = Math.hypot(stft.re[index], stft.im[index]);
      const weight = masks.harmonic[frame * bins + bin];
      tone += mag * weight;
      hit += mag * (1 - weight);
    }
  }
  return tone / (tone + hit + 1e-12);
}

function binIndex(bin, nfft) {
  return bin <= nfft / 2 ? bin : nfft - bin;
}

function binFreq(bin, nfft, rate) {
  const folded = bin <= nfft / 2 ? bin : nfft - bin;
  return (folded * rate) / nfft;
}

function bandGain(freq, lo, hi, rate) {
  const nyquist = rate / 2;
  const top = Math.min(hi, nyquist);
  if (top <= lo) return 0;
  const enter = lo <= 0 ? 1 : smoothstep(lo * 0.82, lo * 1.12, freq);
  const leave = hi >= nyquist ? 1 : 1 - smoothstep(top * 0.88, top * 1.08, freq);
  return enter * leave;
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function normalize(samples) {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
  const gain = peak > 0.001 ? 0.89 / peak : 1;
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) out[index] = samples[index] * gain;
  return out;
}

function audioBuffer(ctx, samples, rate) {
  const buffer = ctx.createBuffer(1, samples.length, rate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function sliceBuffer(ctx, buffer, start, length) {
  const channels = buffer.numberOfChannels;
  const out = ctx.createBuffer(channels, length, buffer.sampleRate);
  for (let channel = 0; channel < channels; channel += 1) {
    out.getChannelData(channel).set(buffer.getChannelData(channel).subarray(start, start + length));
  }
  return out;
}

function midSideBuffers(ctx, buffer, start, length) {
  const left = buffer.getChannelData(0).subarray(start, start + length);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).subarray(start, start + length) : left;
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    mid[index] = 0.5 * (left[index] + right[index]);
    side[index] = 0.5 * (left[index] - right[index]);
  }
  return {
    mid: audioBuffer(ctx, normalize(mid), buffer.sampleRate),
    side: audioBuffer(ctx, normalize(side), buffer.sampleRate),
  };
}

function freqOfRow(row, rows, rate) {
  const min = Math.log(28);
  const max = Math.log(rate / 2);
  const amount = 1 - row / (rows - 1);
  return Math.exp(min + amount * (max - min));
}

function heat(amount) {
  const low = [20, 22, 15];
  const mid = [215, 176, 138];
  const high = [228, 255, 87];
  if (amount < 0.55) return mix(low, mid, amount / 0.55);
  return mix(mid, high, (amount - 0.55) / 0.45);
}

function mix(a, b, amount) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}

function paintScale(ctx2d, width, height) {
  ctx2d.fillStyle = "rgba(232, 226, 212, 0.8)";
  ctx2d.font = "12px sans-serif";
  ctx2d.fillText("agudo", 8, 16);
  ctx2d.fillText("grave", 8, height - 8);
}

function layerName(id) {
  const names = {
    original: "o arquivo",
    mid: "o centro",
    side: "os lados",
    percussivo: "o percussivo",
    harmonico: "o harmônico",
    sub: "o sub",
    grave: "o grave",
    corpo: "o corpo",
    presenca: "a presença",
    ar: "o ar",
  };
  return names[id] || id;
}

function layerHint(id) {
  const hints = {
    original: "O trecho inteiro",
    mid: "Centro",
    side: "Lados",
    percussivo: "Ataques",
    harmonico: "Notas longas",
    sub: "20–90 Hz",
    grave: "90–220 Hz",
    corpo: "220–900 Hz",
    presenca: "0,9–4,5 kHz",
    ar: "4,5 kHz+",
  };
  return hints[id] || "";
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remain = whole % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
