const root = document.querySelector("[data-reel]");

if (root) {
  const track = root.querySelector(".reel__track");
  const frame = root.querySelector(".reel__frame");
  const slides = [...root.querySelectorAll(".reel__slide")];
  const dots = root.querySelector(".reel__dots");
  const status = root.querySelector("[data-reel-status]");
  const bar = root.querySelector(".reel__progress span");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = 6500;
  let index = 0;
  let paused = reduce;
  let held = false;
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  root.style.setProperty("--reel-ms", `${duration}ms`);

  slides.forEach((slide, slideIndex) => {
    const name = slide.querySelector("figcaption span")?.textContent ?? `Cena ${slideIndex + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reel__dot";
    button.dataset.reel = "dot";
    button.dataset.index = String(slideIndex);
    button.setAttribute("aria-label", `Ir para ${name}`);
    dots.append(button);
  });

  const dotButtons = [...dots.querySelectorAll(".reel__dot")];

  function labelOf(slide) {
    return slide.querySelector("figcaption span")?.textContent ?? "";
  }

  function arm() {
    window.clearInterval(timer);
    timer = 0;
    bar.classList.remove("is-run");
    if (paused || held || reduce || document.hidden) return;
    void bar.offsetWidth;
    bar.classList.add("is-run");
    timer = window.setInterval(() => show(index + 1, false), duration);
  }

  function show(next, user) {
    index = (next + slides.length) % slides.length;
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      const on = slideIndex === index;
      slide.setAttribute("aria-hidden", on ? "false" : "true");
      slide.toggleAttribute("inert", !on);
    });
    dotButtons.forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
    });
    if (user) status.textContent = `${index + 1} de ${slides.length}. ${labelOf(slides[index])}.`;
    arm();
  }

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-reel]") : null;
    if (!target || target === root) return;
    const action = target.dataset.reel;
    if (action === "prev") show(index - 1, true);
    else if (action === "next") show(index + 1, true);
    else if (action === "dot") show(Number(target.dataset.index), true);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1, true);
    }
  });

  root.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    held = true;
    arm();
  });

  root.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    held = false;
    arm();
  });

  root.addEventListener("focusin", () => {
    held = true;
    arm();
  });

  root.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    held = false;
    arm();
  });

  frame.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  });

  frame.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    show(index + (dx < 0 ? 1 : -1), true);
  });

  frame.addEventListener("pointercancel", () => {
    tracking = false;
  });

  document.addEventListener("visibilitychange", arm);
  show(0, false);
}
