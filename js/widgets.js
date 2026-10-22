const KEYS = [
  { n: 1, minor: "Lá♭ menor", major: "Si maior" },
  { n: 2, minor: "Mi♭ menor", major: "Fá# maior" },
  { n: 3, minor: "Si♭ menor", major: "Ré♭ maior" },
  { n: 4, minor: "Fá menor", major: "Lá♭ maior" },
  { n: 5, minor: "Dó menor", major: "Mi♭ maior" },
  { n: 6, minor: "Sol menor", major: "Si♭ maior" },
  { n: 7, minor: "Ré menor", major: "Fá maior" },
  { n: 8, minor: "Lá menor", major: "Dó maior" },
  { n: 9, minor: "Mi menor", major: "Sol maior" },
  { n: 10, minor: "Si menor", major: "Ré maior" },
  { n: 11, minor: "Fá# menor", major: "Lá maior" },
  { n: 12, minor: "Ré♭ menor", major: "Mi maior" },
];

function mountCamelot() {
  const root = document.getElementById("camelot-app");
  if (!root) return;

  const wheel = document.createElement("div");
  wheel.className = "camelot";
  const read = document.createElement("p");
  read.className = "camelot__read";
  root.append(wheel, read);

  let current = "8A";
  const buttons = [];

  KEYS.forEach((key, index) => {
    ["A", "B"].forEach((letter) => {
      const button = document.createElement("button");
      button.type = "button";
      const code = `${key.n}${letter}`;
      button.dataset.code = code;
      button.textContent = code;
      button.style.setProperty("--i", String(index));
      button.className = letter === "A" ? "camelot__key camelot__key--minor" : "camelot__key camelot__key--major";
      button.setAttribute("aria-pressed", code === current ? "true" : "false");
      button.addEventListener("click", () => {
        current = code;
        paint();
      });
      wheel.append(button);
      buttons.push(button);
    });
  });

  function paint() {
    buttons.forEach((button) => {
      const code = button.dataset.code;
      const on = code === current;
      const near = !on && compatible(current, code);
      button.classList.toggle("is-on", on);
      button.classList.toggle("is-near", near);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const key = KEYS.find((item) => String(item.n) === current.slice(0, -1));
    const letter = current.slice(-1);
    const name = letter === "A" ? key.minor : key.major;
    const number = key.n;
    const prev = `${number === 1 ? 12 : number - 1}${letter}`;
    const next = `${number === 12 ? 1 : number + 1}${letter}`;
    const relative = `${key.n}${letter === "A" ? "B" : "A"}`;
    read.textContent = `${current} é ${name}. Ao lado na roda: ${prev} e ${next}. O par relativo é ${relative}. Energia e ritmo vêm antes; a roda só evita um choque harmônico.`;
  }

  paint();
}

function compatible(code, other) {
  const number = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  const otherNumber = Number(other.slice(0, -1));
  const otherLetter = other.slice(-1);
  const prev = number === 1 ? 12 : number - 1;
  const next = number === 12 ? 1 : number + 1;
  if (letter === otherLetter && (otherNumber === number || otherNumber === prev || otherNumber === next)) return true;
  if (otherNumber === number && otherLetter !== letter) return true;
  return false;
}

function mountPhrase() {
  const root = document.getElementById("phrase-app");
  if (!root) return;

  root.innerHTML = `
    <div class="phrase__bar">
      <button type="button" class="btn btn--acid" id="phrase-toggle">Ouvir o clique</button>
      <label class="phrase__bpm">BPM <output id="phrase-bpm-out">124</output>
        <input id="phrase-bpm" type="range" min="90" max="180" value="124" step="1">
      </label>
    </div>
    <div class="phrase__grid" id="phrase-grid"></div>
    <p class="phrase__math" id="phrase-math"></p>
    <p class="phrase__read" id="phrase-read" aria-live="polite"></p>
  `;

  const grid = root.querySelector("#phrase-grid");
  const cells = [];
  for (let i = 0; i < 32; i += 1) {
    const cell = document.createElement("span");
    const beat = (i % 4) + 1;
    cell.textContent = String(beat);
    if (beat === 1) cell.classList.add("is-down");
    if (i >= 24) cell.classList.add("is-window");
    grid.append(cell);
    cells.push(cell);
  }

  const toggle = root.querySelector("#phrase-toggle");
  const bpmInput = root.querySelector("#phrase-bpm");
  const bpmOut = root.querySelector("#phrase-bpm-out");
  const math = root.querySelector("#phrase-math");
  const read = root.querySelector("#phrase-read");

  let audio = null;
  let timer = 0;
  let next = 0;
  let beat = 0;
  let running = false;

  function paintMath() {
    const bpm = Number(bpmInput.value);
    bpmOut.textContent = String(bpm);
    const phrase = (32 * 60) / bpm;
    math.textContent = `A ${bpm} BPM, uma frase de 8 compassos dura ${phrase.toFixed(1)} segundos. O último quarto dessa frase — compassos 7 e 8 — é a janela mais limpa para a outra faixa entrar no próximo downbeat.`;
  }

  function paintBeat(index) {
    cells.forEach((cell, i) => cell.classList.toggle("is-now", i === index));
    const bar = Math.floor(index / 4) + 1;
    const pulse = (index % 4) + 1;
    if (bar >= 7) {
      read.textContent = `Compasso ${bar}, tempo ${pulse}. A frase está acabando. Prepare a entrada.`;
    } else if (bar === 1 && pulse === 1) {
      read.textContent = `Compasso 1, tempo 1. Downbeat. Se a outra faixa começar aqui, as frases casam.`;
    } else {
      read.textContent = `Compasso ${bar} de 8, tempo ${pulse}. Conte em voz alta.`;
    }
  }

  function clickAt(time, accent) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = accent ? 1400 : 820;
    gain.gain.setValueAtTime(accent ? 0.18 : 0.07, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(gain).connect(audio.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function tick() {
    const horizon = audio.currentTime + 0.12;
    while (next < horizon) {
      clickAt(next, beat % 4 === 0);
      paintBeat(beat);
      next += 60 / Number(bpmInput.value);
      beat = (beat + 1) % 32;
    }
  }

  async function start() {
    if (!audio) audio = new AudioContext();
    if (audio.state !== "running") await audio.resume();
    next = audio.currentTime + 0.05;
    beat = 0;
    running = true;
    toggle.textContent = "Parar o clique";
    timer = window.setInterval(tick, 25);
  }

  function stop() {
    running = false;
    window.clearInterval(timer);
    toggle.textContent = "Ouvir o clique";
  }

  toggle.addEventListener("click", () => {
    if (running) stop();
    else start();
  });

  bpmInput.addEventListener("input", paintMath);
  paintMath();
  paintBeat(0);
}

mountCamelot();
mountPhrase();
