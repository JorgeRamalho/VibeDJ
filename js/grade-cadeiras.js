import {
  ANALISE_EVENT,
  BLOCKS,
  CELL,
  CHAIRS,
  cellLabel,
  cellSymbol,
  cycleCell,
  didacticGrid,
  exportGradeDocument,
  loadGradeState,
  mergeLabPacket,
  saveGradeState,
} from "./clonagem-model.js";

const mount = document.getElementById("grade-cadeiras-app");
if (mount) boot(mount);

function boot(root) {
  let state = loadGradeState();

  root.innerHTML = `
    <div class="grade-panel">
      <div class="grade-toolbar">
        <button type="button" class="btn btn--ghost" data-fill-didatico>Mapa didático (16 comp.)</button>
        <button type="button" class="btn btn--ghost" data-clear>Limpar grade</button>
        <button type="button" class="btn btn--acid" data-copy-grade>Copiar grade JSON</button>
        <button type="button" class="btn btn--ghost" data-copy-packet disabled data-copy-packet>Pacote completo</button>
      </div>
      <p class="grade-meta" data-meta aria-live="polite"></p>
      <div class="grade-legend">
        <span><i class="grade-cell grade-cell--off" aria-hidden="true">·</i> vazio / retirada</span>
        <span><i class="grade-cell grade-cell--on" aria-hidden="true">●</i> presente · estrutura</span>
        <span><i class="grade-cell grade-cell--swap" aria-hidden="true">↻</i> troca planejada</span>
      </div>
      <div class="grade-scroll">
        <table class="grade-matrix" aria-label="Grade de cadeiras por seção">
          <thead>
            <tr>
              <th scope="col">Cadeira</th>
              ${BLOCKS.map((b) => `<th scope="col"><span>${b.label}</span><small>${b.compassos}</small></th>`).join("")}
            </tr>
          </thead>
          <tbody data-body></tbody>
        </table>
      </div>
      <p class="grade-hint" data-block-hint></p>
      <label class="grade-notes">Notas da referência
        <textarea data-notes rows="3" placeholder="Ex.: break tira kick e baixo; drop traz riser no compasso 13…"></textarea>
      </label>
    </div>`;

  const body = root.querySelector("[data-body]");
  const meta = root.querySelector("[data-meta]");
  const hint = root.querySelector("[data-block-hint]");
  const notes = root.querySelector("[data-notes]");
  const copyPacket = root.querySelector("[data-copy-packet]");

  notes.value = state.meta.notas || "";
  notes.addEventListener("input", () => {
    state.meta.notas = notes.value;
    persist();
  });

  function persist() {
    saveGradeState(state);
    paintMeta();
  }

  function paintMeta() {
    const parts = [];
    if (state.meta.arquivo) parts.push(`Arquivo: ${state.meta.arquivo}`);
    if (state.meta.bpm_estimado) parts.push(`BPM estimado: ${state.meta.bpm_estimado}`);
    parts.push("Clique nas células: vazio → presente → troca → vazio.");
    meta.textContent = parts.join(" · ");
    hint.textContent = BLOCKS[0].hint;
  }

  function renderBody() {
    body.innerHTML = CHAIRS.map((chair) => {
      const cells = state.grid[chair.id]
        .map((value, col) => {
          const block = BLOCKS[col];
          return `<td>
            <button type="button" class="grade-cell grade-cell--${value === CELL.ON ? "on" : value === CELL.SWAP ? "swap" : "off"}"
              data-chair="${chair.id}" data-col="${col}"
              aria-label="${chair.label}, ${block.label}: ${cellLabel(value)}">${cellSymbol(value)}</button>
          </td>`;
        })
        .join("");
      return `<tr>
        <th scope="row">${chair.label}${chair.lab ? "" : " <small>(extra)</small>"}</th>
        ${cells}
      </tr>`;
    }).join("");

    body.querySelectorAll("[data-chair]").forEach((button) => {
      button.addEventListener("click", () => {
        const chairId = button.dataset.chair;
        const col = Number(button.dataset.col);
        state.grid[chairId][col] = cycleCell(state.grid[chairId][col]);
        renderBody();
        persist();
        hint.textContent = BLOCKS[col].hint;
      });
      button.addEventListener("focus", () => {
        hint.textContent = BLOCKS[Number(button.dataset.col)].hint;
      });
    });
  }

  root.querySelector("[data-fill-didatico]").addEventListener("click", () => {
    state.grid = didacticGrid();
    renderBody();
    persist();
  });

  root.querySelector("[data-clear]").addEventListener("click", () => {
    CHAIRS.forEach((chair) => {
      state.grid[chair.id] = BLOCKS.map(() => CELL.OFF);
    });
    renderBody();
    persist();
  });

  root.querySelector("[data-copy-grade]").addEventListener("click", async () => {
    const text = JSON.stringify(exportGradeDocument(state), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      meta.textContent = "Grade JSON copiada.";
    } catch {
      meta.textContent = "Não foi possível copiar. Selecione o JSON manualmente.";
    }
  });

  root.querySelector("[data-copy-packet]").addEventListener("click", async () => {
    const lab = window.__vibedjLabReport?.();
    const analise = window.__vibedjLastAnalise ?? null;
    if (!lab) return;
    const text = JSON.stringify(mergeLabPacket(lab, analise), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      meta.textContent = "Pacote completo copiado (leitura + grade + bancada).";
    } catch {
      meta.textContent = "Copie o pacote manualmente.";
    }
  });

  window.addEventListener(ANALISE_EVENT, (event) => {
    const detail = event.detail;
    if (!detail) return;
    state.meta.arquivo = detail.arquivo || "";
    state.meta.bpm_estimado = detail.bpm_estimado ?? null;
    persist();
  });

  window.addEventListener("vibedj:lab-ready", () => {
    copyPacket.disabled = !window.__vibedjLabReport;
  });

  renderBody();
  paintMeta();
  window.dispatchEvent(new CustomEvent("vibedj:grade-ready"));
}
