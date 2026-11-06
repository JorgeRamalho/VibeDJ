import { ACCEPT, decodeAudioFile, scanOverview } from "./leitura-audio-core.js";
import { estimateMusicalKeyFromMono } from "./camelot-key.js";
import { buildElementInventory, leituraChecklist, renderInventarioCards } from "./inventario-elementos.js?v=2";
import { CHAIRS, mergeLabPacket } from "./clonagem-model.js";
import { compassosEscolhidos, realizarELer } from "./realizacao-receptor.js";
import { extractElementLayers, layerSourceLabel } from "./extracao-elementos.js?v=4";
import { createStemLayer, renderStemsPanelHtml } from "./isolamento-cadeiras.js";
import { bindStemsPanel } from "./stems-import.js";
import { montarTrackRealELer, renderElementStemsForEdicao } from "./montagem-receptor.js";
import { downloadTrack, downloadWav } from "./export-audio.js";
import { preencherCadeirasVazias } from "./stem-separa.js";
import { separarDoador } from "./stem-onnx.js";

const mount = document.querySelector("[data-transplante]");
if (mount) boot(mount);

function boot(root) {
  let ctx = null;
  const donors = { a: emptyDonor(), b: emptyDonor() };
  /** @type {Record<string, "a" | "b" | null>} */
  const receita = Object.fromEntries(CHAIRS.map((chair) => [chair.id, null]));
  let nome = "Track nova";
  let mesaAberta = false;
  /** @type {AudioBufferSourceNode | null} */
  let previewSource = null;
  let previewStatus = "";
  /** @type {AudioBuffer | null} */
  let resultBuffer = null;
  /** @type {AudioBufferSourceNode | null} */
  let resultSource = null;
  let resultSignature = "";
  /** @type {Record<"a"|"b", AbortController | null>} */
  const separacao = { a: null, b: null };
  /** @type {Record<"a"|"b", number>} */
  const geracaoSeparacao = { a: 0, b: 0 };

  root.innerHTML = `
    <ol class="mesa-passos" aria-label="Como a mesa funciona">
      <li><b>1</b> Carregue duas tracks. As duas são doadoras.</li>
      <li><b>2</b> A mesa abre sozinha quando as duas leituras terminam.</li>
      <li><b>3</b> Para cada elemento, retire de A, de B, ou deixe a cadeira vazia. O receptor é a track nova.</li>
    </ol>
    <div class="transplante transplante--doadores">
      ${donorCard("a", "Doador A")}
      ${donorCard("b", "Doador B")}
    </div>
    <div class="mesa-espera" data-espera>
      <p>A mesa fica fechada até as duas tracks terem inventário.</p>
    </div>
    <div class="mesa-reabrir" data-reabrir hidden>
      <p>As duas doadoras estão prontas. O receptor é a track que você monta na mesa.</p>
      <button type="button" class="btn btn--acid" data-abrir-mesa>Abrir mesa de operação</button>
    </div>
    <dialog class="mesa-dialog" data-mesa aria-labelledby="mesa-dialog-title">
      <form method="dialog" class="mesa-dialog__form">
        <header class="mesa-dialog__head">
          <p class="eyebrow">Mesa de operação</p>
          <h3 id="mesa-dialog-title">Receptor — track nova</h3>
          <p class="mesa-dialog__intro">Monte a track nova elemento por elemento. Cada linha compara o mesmo papel nas duas doadoras; o centro mostra o que entrou no receptor.</p>
          <label class="mesa-nome">Nome da track
            <input type="text" data-nome value="Track nova" maxlength="80" autocomplete="off">
          </label>
        </header>
        <div class="mesa-body">
          <div class="mesa-matriz">
            <div class="mesa-ajuda" role="note">
              <p><strong>Como usar:</strong> clique no card da <span class="mesa-tag mesa-tag--a">Doador A</span> ou da <span class="mesa-tag mesa-tag--b">Doador B</span> para colocar aquele elemento no receptor. Use <em>Devolver</em> no centro para deixar a cadeira vazia. O painel à direita mostra a receita ao vivo.</p>
            </div>
            <div class="mesa-grade" data-grade role="region" aria-label="Matriz de transplante por elemento"></div>
          </div>
          <aside class="mesa-receptor-panel" aria-labelledby="mesa-receptor-title">
            <h4 id="mesa-receptor-title">Resultado do receptor</h4>
            <p class="mesa-receptor__lead">A lista é a receita. A leitura final gera o áudio da track nova, no tamanho que você escolher, e mede esse resultado.</p>
            <p class="mesa-receptor__nome" data-receptor-nome></p>
            <p class="mesa-receptor__stats" data-receptor-stats aria-live="polite"></p>
            <ol class="mesa-receptor__lista" data-receptor-lista></ol>
            <p class="mesa-receptor__play" data-receptor-play hidden></p>
            <button type="button" class="btn btn--ghost btn--sm" data-parar-preview hidden>Parar trecho</button>
            <details class="mesa-receptor__json">
              <summary>Ver receita em JSON</summary>
              <pre class="mesa-receptor__pre" data-receptor-json></pre>
            </details>
            <section class="mesa-leitura" aria-labelledby="mesa-leitura-title">
              <h4 id="mesa-leitura-title">Leitura final</h4>
              <p class="mesa-leitura__lead">Montagem híbrida: extração espectral por elemento ao carregar cada doador; stems UVR/Demucs substituem a cadeira. Gere a track, baixe a mix ou <strong>elementos em WAV</strong> para editar no LMMS. <a href="../docs/clonagem/stems-mesa-transplante.md">Guia de stems</a>.</p>
              <label class="mesa-modo">
                Modo de construção
                <select data-modo-montagem>
                  <option value="montagem" selected>Track montada — áudio dos doadores</option>
                  <option value="sintese">Track sintética — exercício (osciladores)</option>
                </select>
              </label>
              <label class="mesa-modo">
                Duração da track nova
                <select data-duracao>
                  <option value="16" selected>16 compassos — um ciclo</option>
                  <option value="32">32 compassos — dois ciclos</option>
                  <option value="64">64 compassos — quatro ciclos</option>
                </select>
              </label>
              <p class="mesa-leitura__lead">Cada ciclo repete a arquitetura: intro, groove, break e drop. Na montagem, o kick ataca e cala, o baixo sustenta e cede no chute, o hat fica curto e os lados se abrem.</p>
              <label class="mesa-modo">
                Formato do arquivo
                <select data-formato-export>
                  <option value="wav" selected>WAV (sem perda)</option>
                  <option value="mp3">MP3 (192 kbps)</option>
                </select>
              </label>
              <button type="button" class="btn btn--acid btn--sm" data-gerar-leitura>Gerar track e ler resultado</button>
              <p class="mesa-leitura__status" data-leitura-status aria-live="polite">Ainda sem áudio da track nova.</p>
              <div class="mesa-leitura__player" data-leitura-player hidden>
                <div class="transplante-actions">
                  <button type="button" class="btn btn--ghost btn--sm" data-tocar-resultado>Ouvir resultado</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-parar-resultado>Parar</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-copiar-leitura>Copiar leitura JSON</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-baixar-track hidden>Baixar track</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-baixar-elementos hidden>Baixar elementos (WAV)</button>
                </div>
                <canvas class="mesa-leitura__wave" data-leitura-wave width="640" height="72" aria-hidden="true"></canvas>
                <div data-leitura-cards></div>
              </div>
              <details class="mesa-receptor__json" data-leitura-json-wrap hidden>
                <summary>Ver leitura final em JSON</summary>
                <pre class="mesa-receptor__pre" data-leitura-json></pre>
              </details>
            </section>
          </aside>
        </div>
        <footer class="mesa-dialog__foot">
          <p data-resumo aria-live="polite"></p>
          <div class="transplante-actions">
            <button type="button" class="btn btn--ghost" data-esvaziar>Esvaziar receptor</button>
            <button type="button" class="btn btn--acid" data-copiar-receita>Copiar receita da track nova</button>
            <button type="button" class="btn btn--ghost" data-copiar-pacote>Pacote completo</button>
            <button type="submit" class="btn btn--ghost" value="fechar">Fechar mesa</button>
          </div>
        </footer>
      </form>
    </dialog>`;

  const ui = {
    espera: root.querySelector("[data-espera]"),
    reabrir: root.querySelector("[data-reabrir]"),
    abrir: root.querySelector("[data-abrir-mesa]"),
    dialog: root.querySelector("[data-mesa]"),
    grade: root.querySelector("[data-grade]"),
    nome: root.querySelector("[data-nome]"),
    resumo: root.querySelector("[data-resumo]"),
    esvaziar: root.querySelector("[data-esvaziar]"),
    copiar: root.querySelector("[data-copiar-receita]"),
    pacote: root.querySelector("[data-copiar-pacote]"),
    receptorNome: root.querySelector("[data-receptor-nome]"),
    receptorStats: root.querySelector("[data-receptor-stats]"),
    receptorLista: root.querySelector("[data-receptor-lista]"),
    receptorJson: root.querySelector("[data-receptor-json]"),
    receptorPlay: root.querySelector("[data-receptor-play]"),
    pararPreview: root.querySelector("[data-parar-preview]"),
    gerarLeitura: root.querySelector("[data-gerar-leitura]"),
    leituraStatus: root.querySelector("[data-leitura-status]"),
    leituraPlayer: root.querySelector("[data-leitura-player]"),
    tocarResultado: root.querySelector("[data-tocar-resultado]"),
    pararResultado: root.querySelector("[data-parar-resultado]"),
    copiarLeitura: root.querySelector("[data-copiar-leitura]"),
    leituraCards: root.querySelector("[data-leitura-cards]"),
    leituraWave: root.querySelector("[data-leitura-wave]"),
    leituraWrap: root.querySelector("[data-leitura-json-wrap]"),
    leituraJson: root.querySelector("[data-leitura-json]"),
    modoMontagem: root.querySelector("[data-modo-montagem]"),
    duracao: root.querySelector("[data-duracao]"),
    formatoExport: root.querySelector("[data-formato-export]"),
    baixarTrack: root.querySelector("[data-baixar-track]"),
    baixarElementos: root.querySelector("[data-baixar-elementos]"),
  };

  ui.nome.addEventListener("input", () => {
    nome = ui.nome.value.trim() || "Track nova";
    publish();
    if (ui.dialog.open) paintReceptorPanel();
  });
  ui.abrir.addEventListener("click", () => openMesa());
  ui.esvaziar.addEventListener("click", () => {
    CHAIRS.forEach((chair) => {
      receita[chair.id] = null;
    });
    paintMesa();
    publish();
  });
  ui.copiar.addEventListener("click", () => copyText(documentReceita(), "Receita da track nova copiada."));
  ui.pacote.addEventListener("click", () => {
    const lab = window.__vibedjLabReport?.();
    copyText(
      {
        ...mergeLabPacket(lab, window.__vibedjLastAnalise ?? null),
        transplante: window.__vibedjTransplante,
      },
      "Pacote com a mesa copiado.",
    );
  });
  ui.dialog.querySelector("form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "fechar") event.preventDefault();
  });
  ui.dialog.addEventListener("close", () => {
    mesaAberta = false;
    stopPreview();
    stopResult();
    syncChrome();
  });
  ui.pararPreview.addEventListener("click", () => stopPreview());
  ui.gerarLeitura.addEventListener("click", () => gerarLeituraFinal());
  ui.tocarResultado.addEventListener("click", () => playResult());
  ui.pararResultado.addEventListener("click", () => stopResult());
  ui.copiarLeitura.addEventListener("click", () => {
    if (!ui.leituraJson.textContent) return;
    copyText(JSON.parse(ui.leituraJson.textContent), "Leitura final copiada.");
  });
  ui.baixarTrack.addEventListener("click", () => baixarResultado());
  ui.baixarElementos.addEventListener("click", () => baixarElementosEdicao());
  ui.receptorLista.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ouvir]");
    if (!button) return;
    const side = button.dataset.ouvir;
    if (side === "a" || side === "b") playDonorExcerpt(side, button.dataset.elemento || "");
  });
  ui.grade.addEventListener("click", (event) => {
    const button = event.target.closest("[data-origem]");
    if (!button) return;
    const id = button.dataset.elemento;
    const origem = button.dataset.origem;
    if (!id || (origem !== "a" && origem !== "b" && origem !== "vazio")) return;
    receita[id] = origem === "vazio" ? null : origem;
    paintMesa();
    publish();
  });

  ["a", "b"].forEach((id) => {
    const input = root.querySelector(`[data-file-${id}]`);
    input.addEventListener("change", () => loadDonor(id, input.files?.[0]));
    bindDrop(root.querySelector(`[data-drop-${id}]`), (file) => loadDonor(id, file));
    root.querySelector(`[data-separar-${id}]`)?.addEventListener("click", () => separarDonor(id));
    root.querySelector(`[data-cancelar-${id}]`)?.addEventListener("click", () => separacao[id]?.abort());
  });

  const stemsPanels = {
    a: bindDonorStems("a"),
    b: bindDonorStems("b"),
  };

  function bindDonorStems(id) {
    return bindStemsPanel({
      root,
      idPrefix: id,
      getCtx: () => {
        if (!ctx) ctx = new AudioContext();
        return ctx;
      },
      getLayers: () => donors[id].elementLayers,
      setLayers: (layers) => {
        donors[id].elementLayers = layers;
        donors[id].elementLayersDirty = false;
      },
      getExtractionBase: () => donors[id].extractionBase,
      setExtractionBase: (base) => {
        donors[id].extractionBase = base;
      },
      onStemMeta: (chairId, layer) => {
        if (layer) {
          donors[id].stems[chairId] = {
            mono: layer.mono,
            rate: layer.rate,
            name: layer.stemName || "",
          };
        } else {
          delete donors[id].stems[chairId];
        }
      },
      onUpdated: () => {
        patchDonorInventario(id);
        if (ui.dialog.open) paintMesa();
        publish();
      },
    });
  }

  function patchDonorInventario(id) {
    const slot = donors[id];
    if (!slot.inventario || !slot.elementLayers) return;
    CHAIRS.forEach((chair) => {
      const layer = slot.elementLayers[chair.id];
      if (!layer) return;
      const el = slot.inventario.elementos[chair.id];
      el.extracao = layer.source;
      el.qualidade_extracao = layer.qualidade ?? null;
      if (layer.source === "stem") el.confianca = Math.max(el.confianca, 95);
    });
    const body = root.querySelector(`[data-body-${id}]`);
    if (body && !body.hidden) body.innerHTML = donorSummary(slot);
  }

  syncChrome();

  function bothReady() {
    return Boolean(donors.a.inventario && donors.b.inventario);
  }

  async function loadDonor(id, file) {
    if (!file) return;
    separacao[id]?.abort();
    geracaoSeparacao[id] += 1;
    const status = root.querySelector(`[data-status-${id}]`);
    const body = root.querySelector(`[data-body-${id}]`);
    status.textContent = `Lendo ${file.name}…`;
    try {
      if (!ctx) ctx = new AudioContext();
      await ctx.resume();
      const decoded = await decodeAudioFile(file, ctx);
      status.textContent = `Medindo espectro de ${file.name}…`;
      const overview = await scanOverview(decoded.mono, decoded.rate, decoded.buffer);
      status.textContent = `Separando elementos de ${file.name}…`;
      const elementLayers = await extractElementLayers(decoded.buffer, {
        onProgress: (msg) => {
          status.textContent = msg;
        },
        bpm: overview.bpm,
        qualityMode: "fino",
      });
      status.textContent = `Lendo tonalidade (Camelot) de ${file.name}…`;
      overview.key = await estimateMusicalKeyFromMono(decoded.mono, decoded.rate);
      status.textContent = `Medindo inventário de ${file.name}…`;
      const inventario = buildElementInventory({
        overview,
        mono: decoded.mono,
        rate: decoded.rate,
        duration: decoded.duration,
        canais: decoded.buffer.numberOfChannels,
        elementLayers,
      });
      inventario.arquivo = decoded.name;
      const wasReady = bothReady();
      donors[id] = {
        name: decoded.name,
        duration: decoded.duration,
        inventario,
        buffer: decoded.buffer,
        mono: decoded.mono,
        rate: decoded.rate,
        stems: {},
        extractionBase: elementLayers,
        elementLayers: { ...elementLayers },
        elementLayersDirty: false,
      };
      body.hidden = false;
      body.innerHTML = donorSummary(donors[id]);
      stemsPanels[id].show();
      stemsPanels[id].resetLabels();
      const separarBox = root.querySelector(`[data-separar-box-${id}]`);
      if (separarBox) separarBox.hidden = false;
      const separarStatus = root.querySelector(`[data-separar-status-${id}]`);
      if (separarStatus) separarStatus.textContent = "";
      status.textContent = "Inventário pronto. Os elementos entram na mesa.";
      const readyNow = bothReady();
      syncChrome();
      publish();
      if (readyNow && !wasReady) openMesa();
      else if (ui.dialog.open) paintMesa();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
    }
  }

  function openMesa() {
    if (!bothReady()) return;
    paintMesa();
    if (!ui.dialog.open) ui.dialog.showModal();
    mesaAberta = true;
    syncChrome();
  }

  function paintMesa() {
    ui.grade.innerHTML = `
      <div class="mesa-cols" role="row">
        <span class="mesa-col mesa-col--a" role="columnheader" id="mesa-col-a">Doador A · ${shortFileName(donors.a.name)}</span>
        <span class="mesa-col mesa-col--receptor" role="columnheader" id="mesa-col-receptor">Receptor (track nova)</span>
        <span class="mesa-col mesa-col--b" role="columnheader" id="mesa-col-b">Doador B · ${shortFileName(donors.b.name)}</span>
      </div>
      ${CHAIRS.map((chair) => rowHtml(chair)).join("")}`;
    paintReceptorPanel();
  }

  function paintReceptorPanel() {
    const counts = countOrigens();
    const filled = counts.a + counts.b;
    ui.receptorNome.textContent = nome;
    ui.receptorStats.textContent =
      filled === 0
        ? "Nenhum elemento no receptor ainda. Escolha cards na matriz à esquerda."
        : `${filled} de ${CHAIRS.length} elementos definidos · ${counts.a} de A · ${counts.b} de B · ${counts.vazio} vazios.`;
    ui.resumo.textContent = `${nome}: ${counts.a} de A · ${counts.b} de B · ${counts.vazio} cadeiras vazias.`;
    ui.receptorLista.innerHTML = CHAIRS.map((chair) => receptorItemHtml(chair)).join("");
    ui.receptorJson.textContent = JSON.stringify(documentReceita(), null, 2);
    if (previewStatus) {
      ui.receptorPlay.hidden = false;
      ui.receptorPlay.textContent = previewStatus;
      ui.pararPreview.hidden = false;
    } else {
      ui.receptorPlay.hidden = true;
      ui.pararPreview.hidden = true;
    }
    if (!leituraBusy && resultSignature && resultSignature !== recipeSignature()) {
      ui.leituraStatus.textContent = "A receita mudou. Gere de novo para a leitura bater com o receptor.";
    }
  }

  function receptorItemHtml(chair) {
    const origem = receita[chair.id];
    if (!origem) {
      return `<li class="mesa-receptor-item mesa-receptor-item--vazio">
        <span class="mesa-receptor-item__elemento">${chair.label}</span>
        <span class="mesa-receptor-item__origem">Vazio</span>
        <span class="mesa-receptor-item__leitura">Cadeira ainda não preenchida na track nova.</span>
      </li>`;
    }
    const el = donors[origem].inventario.elementos[chair.id];
    const layer = donors[origem].elementLayers?.[chair.id];
    const fonte = layerSourceLabel(layer);
    const tag = origem === "a" ? "Doador A" : "Doador B";
    const donorFile = shortFileName(donors[origem].name);
    return `<li class="mesa-receptor-item mesa-receptor-item--${origem}">
      <span class="mesa-receptor-item__elemento">${chair.label}</span>
      <span class="mesa-receptor-item__origem">${tag} · ${donorFile} · ${fonte}</span>
      <span class="mesa-receptor-item__leitura">${el.leitura}</span>
      <button type="button" class="mesa-ouvir" data-ouvir="${origem}" data-elemento="${chair.id}">${donors[origem].stems?.[chair.id] || layer?.source === "stem" ? `Ouvir stem de ${chair.label}` : `Ouvir trecho da mix do ${tag}`}</button>
    </li>`;
  }

  function rowHtml(chair) {
    const chosen = receita[chair.id];
    const rowLabel = `Elemento ${chair.label}`;
    return `<section class="mesa-row" role="group" aria-label="${rowLabel}">
      ${elementButton("a", chair, chosen)}
      <div class="mesa-leito ${chosen ? "is-filled" : ""}" aria-live="polite">
        <strong>${chair.label}</strong>
        <span>${leitoLabel(chair.id, chosen)}</span>
        <button type="button" class="mesa-limpar" data-origem="vazio" data-elemento="${chair.id}" ${chosen ? "" : "disabled"} aria-label="${chosen ? `Devolver ${chair.label} ao vazio no receptor` : `Nada a devolver em ${chair.label}`}">Devolver</button>
      </div>
      ${elementButton("b", chair, chosen)}
    </section>`;
  }

  function elementButton(side, chair, chosen) {
    const el = donors[side].inventario.elementos[chair.id];
    const active = chosen === side;
    const donorLabel = side === "a" ? "Doador A" : "Doador B";
    const action = active ? "já está no receptor" : "colocar no receptor";
    const aria = `${chair.label} · ${donorLabel} (${shortFileName(donors[side].name)}): ${el.leitura}. ${active ? "Pressione para trocar de origem." : `Pressione para ${action}.`}`;
    return `<button type="button" class="mesa-elemento mesa-elemento--${side} mesa-elemento--${el.presenca}${active ? " is-retirado" : ""}" data-origem="${side}" data-elemento="${chair.id}" aria-pressed="${active}" aria-label="${escapeAttr(aria)}">
      <b>${el.rotulo}</b>
      <small>${donorLabel} · ${el.presenca} · ${el.confianca}%</small>
      <span>${active ? "No receptor" : "Retirar para o receptor"}</span>
    </button>`;
  }

  let leituraBusy = false;

  function recipeSignature() {
    return JSON.stringify({ nome, receita });
  }

  function stopPreview(repaint = true) {
    if (previewSource) {
      try {
        previewSource.stop();
      } catch {
        /* já parado */
      }
      previewSource = null;
    }
    previewStatus = "";
    if (repaint && ui.dialog.open) paintReceptorPanel();
  }

  function stopResult() {
    if (!resultSource) return;
    try {
      resultSource.stop();
    } catch {
      /* já parado */
    }
    resultSource = null;
  }

  async function gerarLeituraFinal() {
    const counts = countOrigens();
    if (counts.a + counts.b === 0) {
      ui.leituraStatus.textContent = "Escolha ao menos um elemento na matriz antes de gerar a track.";
      return;
    }
    leituraBusy = true;
    ui.gerarLeitura.disabled = true;
    stopPreview(false);
    stopResult();
    ui.leituraStatus.textContent = "Preparando…";
    try {
      if (!ctx) ctx = new AudioContext();
      const modo = ui.modoMontagem.value;
      const compassos = compassosEscolhidos(ui.duracao.value);
      const onProgress = (msg) => {
        ui.leituraStatus.textContent = msg;
      };
      const rendered =
        modo === "montagem"
          ? await montarTrackRealELer({ nome, receita, donors, compassos, onProgress })
          : await realizarELer({ nome, receita, donors, compassos });
      resultBuffer = rendered.buffer;
      resultSignature = recipeSignature();
      ui.leituraJson.textContent = JSON.stringify(rendered.leitura, null, 2);
      ui.leituraCards.innerHTML = renderInventarioCards(rendered.leitura.inventario);
      ui.leituraPlayer.hidden = false;
      ui.leituraWrap.hidden = false;
      ui.baixarTrack.hidden = false;
      ui.baixarElementos.hidden = modo !== "montagem";
      drawWave(ui.leituraWave, rendered.buffer);
      const rotulo = modo === "montagem" ? "Track montada" : "Track sintética";
      const fmt = ui.formatoExport.value.toUpperCase();
      ui.leituraStatus.textContent = `${rotulo} · ${nome}: ${rendered.leitura.bpm_usado} BPM · ${rendered.leitura.duracao_compassos} compassos · ${rendered.leitura.duracao_segundos} s. Pronto para baixar em ${fmt}.`;
    } catch (err) {
      ui.leituraStatus.textContent = err instanceof Error ? err.message : "Falha ao gerar a track.";
    } finally {
      leituraBusy = false;
      ui.gerarLeitura.disabled = false;
    }
  }

  async function baixarResultado() {
    if (!resultBuffer) return;
    const format = ui.formatoExport.value === "mp3" ? "mp3" : "wav";
    ui.leituraStatus.textContent = format === "mp3" ? "Codificando MP3…" : "Preparando WAV…";
    try {
      await downloadTrack(resultBuffer, nome, format);
      ui.leituraStatus.textContent = `Download ${format.toUpperCase()} iniciado (${nome}).`;
    } catch (err) {
      ui.leituraStatus.textContent =
        err instanceof Error ? err.message : "Falha ao exportar. Tente WAV ou FFmpeg no guia de stems.";
    }
  }

  async function baixarElementosEdicao() {
    const counts = countOrigens();
    if (counts.a + counts.b === 0) {
      ui.leituraStatus.textContent = "Monte a receita com ao menos um elemento antes de exportar.";
      return;
    }
    if (ui.modoMontagem.value !== "montagem") {
      ui.leituraStatus.textContent = "Elementos em WAV só no modo track montada.";
      return;
    }
    leituraBusy = true;
    ui.baixarElementos.disabled = true;
    try {
      const compassos = compassosEscolhidos(ui.duracao.value);
      const safe = nome.replace(/[^\w\-]+/g, "_").slice(0, 32) || "track-nova";
      const stems = await renderElementStemsForEdicao({
        receita,
        donors,
        compassos,
        onProgress: (msg) => {
          ui.leituraStatus.textContent = msg;
        },
      });
      let index = 0;
      for (const chair of CHAIRS) {
        const buffer = stems[chair.id];
        if (!buffer) continue;
        index += 1;
        downloadWav(buffer, `${safe}_${chair.id}.wav`);
        await wait(120);
      }
      ui.leituraStatus.textContent =
        index > 0
          ? `${index} WAV(s) da track nova (${compassos} compassos). Importe no LMMS, um elemento por faixa.`
          : "Nenhum elemento na receita para exportar.";
    } catch (err) {
      ui.leituraStatus.textContent = err instanceof Error ? err.message : "Falha ao exportar elementos.";
    } finally {
      leituraBusy = false;
      ui.baixarElementos.disabled = false;
    }
  }

  async function playResult() {
    if (!resultBuffer) return;
    stopPreview(false);
    stopResult();
    if (!ctx) ctx = new AudioContext();
    await ctx.resume();
    resultSource = ctx.createBufferSource();
    resultSource.buffer = resultBuffer;
    resultSource.connect(ctx.destination);
    resultSource.onended = () => {
      resultSource = null;
    };
    resultSource.start();
    const stale = resultSignature !== recipeSignature();
    ui.leituraStatus.textContent = stale
      ? `Tocando a versão anterior de ${nome}. A receita mudou — gere de novo para atualizar.`
      : `Tocando ${nome}.`;
  }

  function drawWave(canvas, buffer) {
    const data = buffer.getChannelData(0);
    const pen = canvas.getContext("2d");
    if (!pen) return;
    const width = canvas.width;
    const height = canvas.height;
    pen.fillStyle = "#070806";
    pen.fillRect(0, 0, width, height);
    pen.strokeStyle = "#e4ff57";
    pen.beginPath();
    const hop = Math.max(1, Math.floor(data.length / width));
    for (let x = 0; x < width; x += 1) {
      let peak = 0;
      const start = x * hop;
      for (let index = 0; index < hop; index += 8) peak = Math.max(peak, Math.abs(data[start + index] || 0));
      const amp = peak * (height / 2);
      pen.moveTo(x, height / 2 - amp);
      pen.lineTo(x, height / 2 + amp);
    }
    pen.stroke();
  }

  /**
   * Toca a stem da cadeira quando ela existe. Sem stem, toca um trecho da mix do doador.
   * @param {"a"|"b"} side Lado do doador.
   * @param {string} elementId Identificador da cadeira, ou vazio para a mix.
   */
  async function playDonorExcerpt(side, elementId) {
    const slot = donors[side];
    if (!slot.buffer || !ctx) return;
    stopPreview();
    await ctx.resume();
    const found = CHAIRS.find((c) => c.id === elementId);
    const label = found ? found.label : "mix";
    const quem = side === "a" ? "Doador A" : "Doador B";
    const stem = elementId ? slot.stems?.[elementId] : null;
    const layer = elementId ? slot.elementLayers?.[elementId] : null;
    const stemMono = stem?.mono?.length ? stem : (layer?.source === "stem" && layer.mono?.length ? layer : null);
    previewSource = ctx.createBufferSource();
    previewSource.connect(ctx.destination);
    previewSource.onended = () => {
      previewSource = null;
      previewStatus = "";
      paintReceptorPanel();
    };
    if (stemMono?.mono?.length) {
      const buffer = ctx.createBuffer(1, stemMono.mono.length, stemMono.rate);
      buffer.copyToChannel(stemMono.mono, 0);
      previewSource.buffer = buffer;
      previewSource.start();
      previewStatus = `Tocando a stem de ${label} do ${quem}. É estimativa, para estudo.`;
    } else {
      const duration = slot.buffer.duration;
      const start = Math.max(0, duration * 0.2);
      const len = Math.min(10, Math.max(0.5, duration - start));
      previewSource.buffer = slot.buffer;
      previewSource.start(0, start, len);
      previewStatus = `Tocando ~${Math.round(len)} s da mix do ${quem} (trecho de referência para ${label}; não isola o elemento).`;
    }
    paintReceptorPanel();
  }

  /**
   * Roda as duas passagens no doador e preenche só as cadeiras que ainda não têm arquivo.
   * @param {"a"|"b"} id
   */
  async function separarDonor(id) {
    const slot = donors[id];
    if (!slot.buffer || separacao[id]) return;
    const controller = new AbortController();
    const geracao = geracaoSeparacao[id];
    separacao[id] = controller;
    const status = root.querySelector(`[data-separar-status-${id}]`);
    const botao = root.querySelector(`[data-separar-${id}]`);
    const cancelar = root.querySelector(`[data-cancelar-${id}]`);
    if (botao instanceof HTMLButtonElement) botao.disabled = true;
    if (cancelar instanceof HTMLButtonElement) cancelar.hidden = false;
    if (status) status.textContent = "Preparando a separação…";
    try {
      const separados = await separarDoador(slot.buffer, slot.inventario?.bpm_estimado, {
        signal: controller.signal,
        onProgress: (mensagem) => {
          if (status) status.textContent = mensagem;
        },
      });
      if (separacao[id] !== controller || geracaoSeparacao[id] !== geracao) return;
      const aviso = separados.aviso;
      const preenchido = preencherCadeirasVazias(slot.stems, separados, slot.rate || 44100);
      slot.stems = preenchido.stems;
      const layers = { ...(slot.elementLayers || {}) };
      preenchido.preenchidas.forEach((chairId) => {
        const stem = slot.stems[chairId];
        if (!stem?.mono?.length) return;
        layers[chairId] = createStemLayer(stem.mono, stem.rate, stem.name);
        const label = root.querySelector(`[data-stem-label-${id}-${chairId}]`);
        if (label && stem.name) label.textContent = stem.name;
      });
      slot.elementLayers = layers;
      slot.elementLayersDirty = false;
      const vazias = preenchido.preenchidas.length;
      const mantidas = preenchido.mantidas.length;
      if (status) {
        status.textContent = aviso
          ? aviso
          : vazias === 0
            ? "Nenhuma cadeira vazia para preencher. As stems que você anexou foram mantidas."
            : `Preenchi ${vazias} cadeira${vazias === 1 ? "" : "s"}.${mantidas ? ` Mantive ${mantidas} anexo${mantidas === 1 ? "" : "s"}.` : ""} Stab e transição continuam no filtro da mix.`;
      }
      if (ui.dialog.open) paintMesa();
    } catch (err) {
      if (separacao[id] !== controller || geracaoSeparacao[id] !== geracao) return;
      if (status) {
        status.textContent =
          err instanceof Error && err.name === "AbortError"
            ? "Separação cancelada."
            : err instanceof Error
              ? err.message
              : "Falha ao separar as stems.";
      }
    } finally {
      if (separacao[id] === controller) separacao[id] = null;
      if (botao instanceof HTMLButtonElement) botao.disabled = false;
      if (cancelar instanceof HTMLButtonElement) cancelar.hidden = true;
    }
  }

  function leitoLabel(id, chosen) {
    if (!chosen) return "Cadeira vazia";
    const el = donors[chosen].inventario.elementos[id];
    const nomeDoador = chosen === "a" ? "Doador A" : "Doador B";
    return `${nomeDoador} · ${el.leitura}`;
  }

  function syncChrome() {
    const ready = bothReady();
    ui.espera.hidden = ready;
    ui.reabrir.hidden = !ready || ui.dialog.open;
  }

  function publish() {
    if (!bothReady()) {
      window.__vibedjTransplante = null;
      return;
    }
    window.__vibedjTransplante = documentReceita();
    window.dispatchEvent(new CustomEvent("vibedj:transplante", { detail: window.__vibedjTransplante }));
  }

  function documentReceita() {
    return {
      tipo: "track-nova-transplante",
      versao: 1,
      nome,
      duracao_compassos: compassosEscolhidos(ui.duracao.value),
      mapa: "Ciclos de 16 compassos: intro, groove, break, drop.",
      aviso: "Receita de papéis. O áudio do receptor não existe ainda: cada elemento marca de qual doador veio a função. O som final é recriado por você.",
      doador_a: donorMeta("a"),
      doador_b: donorMeta("b"),
      elementos: Object.fromEntries(
        CHAIRS.map((chair) => {
          const origem = receita[chair.id];
          const fonte = origem ? donors[origem].inventario.elementos[chair.id] : null;
          return [
            chair.id,
            {
              cadeira: chair.label,
              origem: origem ? (origem === "a" ? "doador_a" : "doador_b") : "vazio",
              presenca_na_origem: fonte ? fonte.presenca : null,
              leitura: fonte ? fonte.leitura : "Cadeira deixada vazia na track nova.",
              funcao: fonte ? fonte.funcao : chair.label,
            },
          ];
        }),
      ),
    };
  }

  function donorMeta(id) {
    const slot = donors[id];
    return {
      arquivo: slot.name,
      bpm_estimado: slot.inventario?.bpm_estimado ?? null,
      duracao_segundos: slot.inventario?.duracao_segundos ?? null,
      amostragem_hz: slot.inventario?.amostragem_hz ?? slot.rate ?? null,
      canais: slot.inventario?.canais ?? null,
      tonalidade: slot.inventario?.tonalidade ?? null,
      camelot: slot.inventario?.camelot ?? null,
      confianca: slot.inventario?.confianca ?? null,
      leitura: slot.inventario ? leituraChecklist(slot.inventario) : null,
    };
  }

  function countOrigens() {
    let a = 0;
    let b = 0;
    let vazio = 0;
    CHAIRS.forEach((chair) => {
      const origem = receita[chair.id];
      if (origem === "a") a += 1;
      else if (origem === "b") b += 1;
      else vazio += 1;
    });
    return { a, b, vazio };
  }

  async function copyText(payload, ok) {
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ui.resumo.textContent = ok;
    } catch {
      ui.resumo.textContent = "Selecione e copie o JSON manualmente.";
    }
  }
}

function donorCard(id, title) {
  return `<article class="transplante-slot transplante-slot--${id}">
    <header>
      <p class="eyebrow">${title}</p>
      <h3>Elementos desta track</h3>
      <p class="transplante-slot__hint">Kick, clap, hi-hat, baixo, stab e o resto saem daqui para a mesa.</p>
    </header>
    <label class="drop" data-drop-${id}>
      <input type="file" accept="${ACCEPT}" data-file-${id}>
      <span>Solte ou escolha o áudio. Ele fica neste navegador.</span>
    </label>
    <p class="lab-status" data-status-${id} aria-live="polite">Aguardando arquivo.</p>
    <div data-body-${id} hidden></div>
    ${renderStemsPanelHtml(id)}
    <div data-separar-box-${id} hidden>
      <div class="stems-actions">
        <button type="button" class="btn btn--acid btn--sm" data-separar-${id}>Separar stems</button>
        <button type="button" class="btn btn--ghost btn--sm" data-cancelar-${id} hidden>Cancelar</button>
      </div>
      <p class="stems-panel__hint">Estimativa no navegador, nos 16 compassos a partir do primeiro ataque. O master continua sendo a recriação no LMMS. Stab e transição não são preenchidos. Anexo manual não é substituído.</p>
      <p class="lab-status" data-separar-status-${id} aria-live="polite"></p>
    </div>
  </article>`;
}

function donorSummary(slot) {
  const chips = CHAIRS.map((chair) => {
    const el = slot.inventario.elementos[chair.id];
    return `<li class="mesa-chip mesa-chip--${el.presenca}">${el.rotulo}<small>${el.presenca}</small></li>`;
  }).join("");
  const bpm = slot.inventario.bpm_estimado ? `${slot.inventario.bpm_estimado} BPM` : "BPM —";
  const key = slot.inventario.camelot
    ? `${slot.inventario.camelot} · ${slot.inventario.tonalidade || "tonalidade"}`
    : "Camelot —";
  return `<p class="inventario-head"><strong>${slot.name}</strong> · ${bpm} · ${key} · ${formatTime(slot.duration)}</p>
    <ul class="mesa-chips">${chips}</ul>`;
}

function emptyDonor() {
  return {
    name: "",
    duration: 0,
    inventario: null,
    buffer: null,
    mono: null,
    rate: 0,
    stems: {},
    extractionBase: null,
    elementLayers: null,
    elementLayersDirty: true,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bindDrop(label, onFile) {
  label.addEventListener("dragover", (event) => {
    event.preventDefault();
    label.classList.add("is-over");
  });
  label.addEventListener("dragleave", () => label.classList.remove("is-over"));
  label.addEventListener("drop", (event) => {
    event.preventDefault();
    label.classList.remove("is-over");
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function shortFileName(name) {
  if (!name) return "—";
  if (name.length <= 36) return name;
  return `${name.slice(0, 16)}…${name.slice(-14)}`;
}

function escapeAttr(text) {
  return text.replace(/"/g, "&quot;");
}
