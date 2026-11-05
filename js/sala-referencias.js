/**
 * Vídeos e links externos por aula da sala e por treino do laboratório.
 * Edite `youtubeId` e `url` para trocar referências; `destaque: true` embute o player ao abrir a aula.
 */

/** @typedef {{ titulo: string, url: string, youtubeId?: string, canal?: string, duracao?: string, nota?: string, destaque?: boolean }} ReferenciaAula */

/** @type {Record<string, ReferenciaAula[]>} */
export const SALA_REFERENCIAS = {
  cabine: [
    {
      titulo: "How to DJ for Beginners",
      url: "https://www.youtube.com/watch?v=gzjasvooSG8",
      youtubeId: "gzjasvooSG8",
      canal: "DJing basics",
      duracao: "~45 min",
      destaque: true,
      nota: "Visão geral de decks, mixer, fones e o fluxo cue → fader → master.",
    },
    {
      titulo: "Mixer Basics — DJ'ing for Beginners",
      url: "https://www.youtube.com/watch?v=6HagbFSshHY",
      youtubeId: "6HagbFSshHY",
      canal: "Ellaskins",
      duracao: "~12 min",
      nota: "Caminho do sinal, booth e por que o cue não vai para a pista.",
    },
  ],
  frase: [
    {
      titulo: "PHRASE MIXING Explained for Beginners | DJ ESSENTIALS",
      url: "https://www.youtube.com/watch?v=_O-yX9MnGMw",
      youtubeId: "_O-yX9MnGMw",
      canal: "Crossfader",
      duracao: "~18 min",
      destaque: true,
      nota: "Barra de 4 tempos, frase de 8 compassos e por que a troca precisa de estrutura.",
    },
    {
      titulo: "How DJs Know EXACTLY When To Mix (Phrasing Explained)",
      url: "https://www.youtube.com/watch?v=1dLfSkKLhuk",
      youtubeId: "1dLfSkKLhuk",
      canal: "Blakey",
      duracao: "~20 min",
      nota: "Alinhar drops e energia quando o beatmatch sozinho não basta.",
    },
  ],
  ganho: [
    {
      titulo: "EASY DJ Audio System Settings For GREAT Sound",
      url: "https://www.youtube.com/watch?v=lMRXSdHplPw",
      youtubeId: "lMRXSdHplPw",
      canal: "DJ Tech Tools",
      duracao: "~25 min",
      destaque: true,
      nota: "Trim, fader de canal e master sem estourar o limiter.",
    },
    {
      titulo: "Trim vs Volume on a DJ controller",
      url: "https://www.youtube.com/watch?v=Lnx3bh4Lo84",
      youtubeId: "Lnx3bh4Lo84",
      duracao: "Short",
      nota: "Diferença prática entre trim e volume quando as faixas não têm o mesmo tamanho.",
    },
  ],
  pitch: [
    {
      titulo: "How to practice DJing everyday",
      url: "https://www.youtube.com/watch?v=u2WJ3LFBle8",
      youtubeId: "u2WJ3LFBle8",
      canal: "Crossfader",
      duracao: "~15 min",
      destaque: true,
      nota: "Drill de beatmatch: sync off, pitch depois jog, ouvido no centro.",
    },
    {
      titulo: "PHRASE MIXING Explained for Beginners | DJ ESSENTIALS",
      url: "https://www.youtube.com/watch?v=_O-yX9MnGMw",
      youtubeId: "_O-yX9MnGMw",
      nota: "Revisão rápida: tempo certo ainda precisa de frase certa.",
    },
  ],
  grave: [
    {
      titulo: "Bass Swap EQ Mixing Technique | Mix & Tricks #4 with XDJ-RX3",
      url: "https://www.youtube.com/watch?v=Dmb5GmLkbrY",
      youtubeId: "Dmb5GmLkbrY",
      canal: "Pioneer DJ",
      duracao: "~8 min",
      destaque: true,
      nota: "Troca de grave em 8 compassos: um low por vez.",
    },
    {
      titulo: "You're Overcomplicating EQ's... This Is Way Easier",
      url: "https://www.youtube.com/watch?v=UKdeDWJFw4s",
      youtubeId: "UKdeDWJFw4s",
      nota: "O que low, mid e high fazem no espectro antes de misturar.",
    },
  ],
  troca: [
    {
      titulo: "How to Mix Like a Pro: Perfect DJ Transitions Every Time",
      url: "https://www.youtube.com/watch?v=j1P2T3X5mEQ",
      youtubeId: "j1P2T3X5mEQ",
      destaque: true,
      nota: "Escolher o gesto da transição antes de abrir o fader.",
    },
    {
      titulo: "PHRASE MIXING Explained for Beginners | DJ ESSENTIALS",
      url: "https://www.youtube.com/watch?v=_O-yX9MnGMw",
      youtubeId: "_O-yX9MnGMw",
      nota: "Entrada no downbeat da frase, não no meio do vocal.",
    },
  ],
  sync: [
    {
      titulo: "The sync button!",
      url: "https://www.youtube.com/watch?v=TOQkZbDi11M",
      youtubeId: "TOQkZbDi11M",
      duracao: "Short",
      destaque: true,
      nota: "O que o sync iguala — e por que ainda precisa desligar para treinar.",
    },
    {
      titulo: "How to practice DJing everyday",
      url: "https://www.youtube.com/watch?v=u2WJ3LFBle8",
      youtubeId: "u2WJ3LFBle8",
      nota: "Recuperar tempo e fase manualmente depois de usar sync.",
    },
  ],
  faixa: [
    {
      titulo: "How to DJ for Beginners",
      url: "https://www.youtube.com/watch?v=gzjasvooSG8",
      youtubeId: "gzjasvooSG8",
      destaque: true,
      nota: "Carregar decks, ler BPM na tela e montar um par de estudo coerente.",
    },
    {
      titulo: "tags + intelligent playlists in rekordbox",
      url: "https://www.youtube.com/watch?v=I5p6LOECmhw",
      youtubeId: "I5p6LOECmhw",
      nota: "Nomear a crate com tags, BPM e sensação — biblioteca real, não streaming na cabine.",
    },
  ],
  harmonia: [
    {
      titulo: "The Ultimate Guide to Mixing in Key for DJs",
      url: "https://www.youtube.com/watch?v=Ypou-YcnCzM",
      youtubeId: "Ypou-YcnCzM",
      duracao: "~30 min",
      destaque: true,
      nota: "Roda Camelot, vizinhos, relativos e o quadrado 8A → 8B → 9B → 9A.",
    },
    {
      titulo: "The Camelot Wheel - DJ Harmonic mixing in 60 seconds!",
      url: "https://www.youtube.com/watch?v=Xchl_W3s0Cc",
      youtubeId: "Xchl_W3s0Cc",
      duracao: "Short",
      nota: "Revisão rápida dos três vizinhos de um código.",
    },
  ],
  loop: [
    {
      titulo: "Pioneer Rekordbox | Hot Cue Loop Trick",
      url: "https://www.youtube.com/watch?v=oJY4Rzv9lSM",
      youtubeId: "oJY4Rzv9lSM",
      duracao: "~4 min",
      destaque: true,
      nota: "Hot cue laranja = loop de 4 ou 8 tempos guardado no ponto.",
    },
    {
      titulo: "Rekordbox Features YOU Need to Know...Part 1.",
      url: "https://www.youtube.com/watch?v=5SRSNJQpOFU",
      youtubeId: "5SRSNJQpOFU",
      duracao: "Short",
      nota: "Salvar loop no hot cue antes de exportar para o USB.",
    },
  ],
  set: [
    {
      titulo: "The Secret to Building DJ Sets That Make Sense",
      url: "https://www.youtube.com/watch?v=c0MXfZMy2jc",
      youtubeId: "c0MXfZMy2jc",
      destaque: true,
      nota: "Abertura, pico, respiração e fechamento como frases estendidas.",
    },
    {
      titulo: "How to create a DJ set everyone remembers",
      url: "https://www.youtube.com/watch?v=et1XofhkuUg",
      youtubeId: "et1XofhkuUg",
      nota: "Construir um pico memorável sem furar a curva de energia.",
    },
  ],
  pista: [
    {
      titulo: "DJ Tips - 6 Things to Remember for Sound Check",
      url: "https://www.youtube.com/watch?v=Wn4fLdAOJgY",
      youtubeId: "Wn4fLdAOJgY",
      destaque: true,
      nota: "Soundcheck antes da sala encher: ganho, PA e plano B.",
    },
    {
      titulo: "EASY DJ Audio System Settings For GREAT Sound",
      url: "https://www.youtube.com/watch?v=lMRXSdHplPw",
      youtubeId: "lMRXSdHplPw",
      nota: "Revisão de trim e master para não descobrir o limiter no primeiro drop.",
    },
  ],
};

/** @type {Record<string, ReferenciaAula[]>} */
export const LAB_REFERENCIAS = {
  metronomo: [
    {
      titulo: "PHRASE MIXING Explained for Beginners | DJ ESSENTIALS",
      url: "https://www.youtube.com/watch?v=_O-yX9MnGMw",
      youtubeId: "_O-yX9MnGMw",
      destaque: true,
      nota: "Contagem em cima do kick antes do clique da aula da frase.",
    },
  ],
  "duplo-kick": [
    {
      titulo: "How to practice DJing everyday",
      url: "https://www.youtube.com/watch?v=u2WJ3LFBle8",
      youtubeId: "u2WJ3LFBle8",
      nota: "Beatmatch sem sync — base do treino Duplo kick.",
    },
    {
      titulo: "Bass Swap EQ Mixing Technique | Mix & Tricks #4 with XDJ-RX3",
      url: "https://www.youtube.com/watch?v=Dmb5GmLkbrY",
      youtubeId: "Dmb5GmLkbrY",
      destaque: true,
      nota: "Troca de grave na frase depois que o tempo casou.",
    },
  ],
  "curva-energia": [
    {
      titulo: "The Secret to Building DJ Sets That Make Sense",
      url: "https://www.youtube.com/watch?v=c0MXfZMy2jc",
      youtubeId: "c0MXfZMy2jc",
      destaque: true,
      nota: "Desenhar o arco antes de tocar as quatro faixas.",
    },
  ],
  booth: [
    {
      titulo: "Mixer Basics — DJ'ing for Beginners",
      url: "https://www.youtube.com/watch?v=6HagbFSshHY",
      youtubeId: "6HagbFSshHY",
      destaque: true,
      nota: "Cue, booth e passagem no downbeat com um grave só.",
    },
  ],
};

const EMBED_BASE = "https://www.youtube-nocookie.com/embed/";

/**
 * @param {ReferenciaAula[]} refs
 * @param {string} headingId
 */
function buildReferenciasSection(refs, headingId) {
  const section = document.createElement("section");
  section.className = "lesson__refs";
  section.setAttribute("aria-labelledby", headingId);

  const heading = document.createElement("h3");
  heading.id = headingId;
  heading.textContent = "Aulas referenciadas";
  section.appendChild(heading);

  const intro = document.createElement("p");
  intro.className = "lesson__refs__lede";
  intro.textContent =
    "Vídeos externos (YouTube) que aprofundam este conteúdo. O player só carrega quando a aula ou o treino está aberto.";
  section.appendChild(intro);

  const destaque = refs.find((ref) => ref.destaque && ref.youtubeId);
  if (destaque?.youtubeId) {
    const embedWrap = document.createElement("div");
    embedWrap.className = "lesson__refs__embed";
    const iframe = document.createElement("iframe");
    iframe.dataset.youtubeId = destaque.youtubeId;
    iframe.title = destaque.titulo;
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    );
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "lazy");
    embedWrap.appendChild(iframe);
    section.appendChild(embedWrap);
  }

  const list = document.createElement("ul");
  list.className = "lesson__refs__list";

  refs.forEach((ref) => {
    const item = document.createElement("li");
    item.className = "lesson__refs__item";

    const link = document.createElement("a");
    link.href = ref.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = ref.titulo;

    const meta = document.createElement("p");
    meta.className = "lesson__refs__meta";
    const bits = [ref.canal, ref.duracao].filter(Boolean);
    if (bits.length) {
      meta.append(document.createTextNode(bits.join(" · ")));
    }

    item.append(link);
    if (ref.nota) {
      const nota = document.createElement("p");
      nota.className = "lesson__refs__nota";
      nota.textContent = ref.nota;
      item.append(nota);
    }
    if (bits.length) item.append(meta);
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

/** @param {ParentNode} root */
function mountLessonReferencias(root) {
  root.querySelectorAll("[data-lesson-panel]").forEach((panel) => {
    const id = panel.dataset.lessonPanel;
    if (!id) return;
    const refs = SALA_REFERENCIAS[id];
    if (!refs?.length) return;

    const prose = panel.querySelector(".prose");
    const checklist = prose?.querySelector("h3");
    if (!prose || !checklist) return;

    const headingId = `refs-${id}`;
    const section = buildReferenciasSection(refs, headingId);
    checklist.before(section);
  });
}

/** @param {ParentNode} root */
function mountLabReferencias(root) {
  root.querySelectorAll("[data-lab]").forEach((article) => {
    const id = article.dataset.lab;
    if (!id) return;
    const refs = LAB_REFERENCIAS[id];
    if (!refs?.length) return;

    const headingId = `refs-lab-${id}`;
    const section = buildReferenciasSection(refs, headingId);
    const steps = article.querySelector("ol");
    if (steps) steps.after(section);
    else article.appendChild(section);
  });
}

/** @param {string | undefined} lessonId */
export function activateLessonEmbed(lessonId) {
  document.querySelectorAll(".lesson__refs__embed iframe[src]").forEach((frame) => {
    frame.removeAttribute("src");
  });

  if (!lessonId) return;

  const panel = document.querySelector(`[data-lesson-panel="${lessonId}"]`);
  const iframe = panel?.querySelector(".lesson__refs__embed iframe[data-youtube-id]");
  const youtubeId = iframe?.dataset.youtubeId;
  if (!iframe || !youtubeId) return;

  iframe.src = `${EMBED_BASE}${youtubeId}?rel=0`;
}

/** @param {ParentNode} studyRoot */
export function initSalaReferencias(studyRoot) {
  mountLessonReferencias(studyRoot);
  mountLabReferencias(studyRoot);
}
