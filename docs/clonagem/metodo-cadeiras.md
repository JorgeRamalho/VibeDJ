# Método das cadeiras — clonagem e composição

A track é uma **construção editável**: mesma grade para compor do zero ou fazer engenharia reversa. Referência numa faixa **muda** (só tempo); o que exporta é o **projeto novo**.

Fonte: plano **Tech House Reverse Lab** + material *Elementos da música eletrônica* (PDF).

---

## Três operações por elemento (por bloco de 8 compassos)

| Operação | Significado |
|----------|-------------|
| **Estrutura** | A cadeira fica no lugar e no tempo certos; o som que senta nela é **seu** (no lab: *manter* o papel com voz de referência do exercício → no LMMS, seu sample/MIDI) |
| **Troca** | O **papel** continua; o som muda (lab: *substituir*) |
| **Retirada** | Cadeira vazia; o buraco vira arranjo (lab: *rejeitar*) |

Compor do zero = grade com cadeiras vazias, depois preencher. Engenharia reversa = preencher a partir da referência, depois editar ordens.

---

## Cadeiras típicas (Tech House)

Kick (4/4), clap (2/4), hi-hat (contratempo), baixo (dialoga com kick), stab curto, vocal chop (opcional), efeito de transição. Percussão (shaker, conga, rimshot) e snare no build são camadas extras na grade.

---

## Fluxo completo

```
referência (muda) → BPM e seções → stems (estudo, não master) → grade 8×papéis
  → estrutura / troca / retirada → MIDI + samples no LMMS → aprovação → export
```

Ferramentas do plano gratuito: LMMS, Sonic Visualiser, UVR/Demucs, Audacity; analisador Python (BPM + JSON de grade) como apoio, não substituto do ouvido.

---

## Como estudar a referência

1. **Mapa de 8 compassos** — linhas = papéis, colunas = blocos de 8.  
2. **Esqueleto mudo** — clips MIDI vazios onde o papel existe.  
3. **Cinco escutas** — composição, arranjo, som, mix, master (separadas).  
4. **Subtração** — drop = groove cheio; intro/break nascem **apagando** cadeiras.  
5. **Passes** — forma → bateria/baixo → harmonia → timbre/espaço.

Stems de IA: ouvir e marcar; artefato fica na análise; som novo é sample/synth seu.

---

## Registro

Cada cadeira: o que entrou, o que foi trocado, o que ficou vazio. A **grade web** (`js/grade-cadeiras.js`) guarda presença por seção; a **bancada** guarda manter/substituir/rejeitar por camada. **Pacote completo** = leitura + grade + bancada (JSON).

---

## Ver também

- [elementos-musica-eletronica.md](./elementos-musica-eletronica.md) — vocabulário das sete famílias e mapa para o lab  
- [lmms-16-compassos.md](./lmms-16-compassos.md) — checklist LMMS  
- `scripts/analisador/grade_v0.py` — BPM + grade vazia (CLI)
