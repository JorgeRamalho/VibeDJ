import { activateLessonEmbed, initSalaReferencias } from "./sala-referencias.js";

const STORAGE = "vibedj.estudo.v1";

const study = document.querySelector("[data-study]");

if (study) {
  initSalaReferencias(study);

  const opens = [...study.querySelectorAll("[data-open]")];
  const panels = [...study.querySelectorAll("[data-lesson-panel]")];
  const checks = [...study.querySelectorAll("[data-check]")];
  const dones = [...study.querySelectorAll("[data-done]")];
  const meter = study.querySelector("[data-meter]");
  const bar = study.querySelector("[data-meter-bar]");

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return { done: {}, check: {} };
      const parsed = JSON.parse(raw);
      return {
        done: parsed.done && typeof parsed.done === "object" ? parsed.done : {},
        check: parsed.check && typeof parsed.check === "object" ? parsed.check : {},
      };
    } catch {
      return { done: {}, check: {} };
    }
  }

  const state = load();

  function save() {
    localStorage.setItem(STORAGE, JSON.stringify(state));
  }

  function known(id) {
    return panels.some((panel) => panel.dataset.lessonPanel === id);
  }

  function show(id, fromUser) {
    const next = known(id) ? id : "cabine";
    opens.forEach((button) => {
      const on = button.dataset.open === next;
      if (on) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-on", panel.dataset.lessonPanel === next);
    });
    activateLessonEmbed(next);
    if (fromUser) {
      history.replaceState(null, "", `#${next}`);
      const heading = study.querySelector(`[data-lesson-panel="${next}"] h2`);
      heading?.focus();
    }
  }

  function paint() {
    checks.forEach((input) => {
      input.checked = Boolean(state.check[input.dataset.check]);
    });
    dones.forEach((button) => {
      const on = Boolean(state.done[button.dataset.done]);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.textContent = on ? "Aula concluída" : "Concluir aula";
    });
    opens.forEach((button) => {
      button.classList.toggle("is-done", Boolean(state.done[button.dataset.open]));
    });
    const total = dones.length;
    const count = Object.values(state.done).filter(Boolean).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    if (meter) meter.textContent = `${pct}% · ${count} de ${total} aulas`;
    if (bar) bar.style.width = `${pct}%`;
  }

  opens.forEach((button) => {
    button.addEventListener("click", () => show(button.dataset.open, true));
  });

  checks.forEach((input) => {
    input.addEventListener("change", () => {
      state.check[input.dataset.check] = input.checked;
      save();
    });
  });

  dones.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.done;
      state.done[id] = !state.done[id];
      save();
      paint();
    });
  });

  window.addEventListener("hashchange", () => {
    show(location.hash.slice(1), false);
  });

  show(location.hash.slice(1), false);
  paint();
}
