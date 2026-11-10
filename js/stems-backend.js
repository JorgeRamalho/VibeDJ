/**
 * Cliente do backend local em 127.0.0.1:8777.
 * O laboratório só fala com ele quando o VibeDJ Stems está aberto na bandeja.
 * O andamento chega por WebSocket. Os WAV ficam na pasta escolhida na caixa nativa.
 */

export const BACKEND_URL = "http://127.0.0.1:8777";
export const BACKEND_WS = "ws://127.0.0.1:8777";

/**
 * @returns {Promise<{ status: string, version?: string, provider?: string, message?: string }>}
 */
export async function checarBackend() {
  try {
    const resposta = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!resposta.ok) return { status: "ausente" };
    return await resposta.json();
  } catch {
    return { status: "ausente" };
  }
}

/**
 * Envia a faixa e devolve o job, novo ou reaproveitado pelo hash.
 * @param {File} file
 */
export async function enviarFaixa(file) {
  const corpo = new FormData();
  corpo.append("file", file, file.name);
  const resposta = await fetch(`${BACKEND_URL}/jobs`, { method: "POST", body: corpo });
  if (!resposta.ok) throw new Error(await textoDeErro(resposta));
  return resposta.json();
}

/**
 * Ouve o job até a mensagem `concluido` ou `falha`.
 * Cada pacote traz tipo, rótulo e progresso. No fim, `destino` é a pasta gravada pela caixa.
 * @param {string} id
 * @param {(job: object) => void} onProgress
 * @returns {Promise<object>}
 */
export function acompanharJob(id, onProgress) {
  return new Promise((resolve, reject) => {
    let encerrou = false;
    const socket = new WebSocket(`${BACKEND_WS}/jobs/${id}/eventos`);
    const falhar = (erro) => {
      if (encerrou) return;
      encerrou = true;
      reject(erro);
    };
    socket.addEventListener("message", (evento) => {
      /** @type {object} */
      let job;
      try {
        job = JSON.parse(evento.data);
      } catch {
        falhar(new Error("O backend mandou um andamento ilegível."));
        socket.close();
        return;
      }
      onProgress(job);
      if (job.tipo === "concluido" || job.tipo === "falha") {
        encerrou = true;
        socket.close();
        resolve(job);
      }
    });
    socket.addEventListener("error", () => {
      falhar(new Error("Não consegui acompanhar o job pelo WebSocket."));
    });
    socket.addEventListener("close", () => {
      if (!encerrou) falhar(new Error("O backend fechou o acompanhamento antes de concluir."));
    });
  });
}

/**
 * @param {Response} resposta
 */
async function textoDeErro(resposta) {
  try {
    const corpo = await resposta.json();
    return corpo.detail || `O backend respondeu HTTP ${resposta.status}.`;
  } catch {
    return `O backend respondeu HTTP ${resposta.status}.`;
  }
}

