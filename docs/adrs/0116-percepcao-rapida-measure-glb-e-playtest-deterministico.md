# 0116 - Percepção rápida de assets (measure_glb) e playtest determinístico (wait_for/eval_js)

**Data:** 2026-07-16
**Status:** aceito

## Contexto

O loop verificável de fases do teste4 (spec 0002, skill fase-por-trechos) criou
scripts utilitários próprios que o Chat IA do Studio não tinha nativo:

- `measure_glb.mjs` — mede o bounding box de um `.glb` em **Node puro** (parseia
  os accessors min/max do header glTF). No Studio, a única forma de medir era o
  `inspect_assets`, que exige **Blender instalado** e renderiza thumbnail de um
  diretório inteiro — caro quando a IA só quer as medidas de UMA peça (e a regra
  de proporção em metros faz disso uma necessidade constante).
- `shot-gpu.mjs` — screenshot headless com **espera determinística por marco de
  boot** (`window.__bootStage === 'pronto'`, com diagnóstico de recursos
  pendentes no timeout) e **eval pós-boot** (teleportar o player pra um
  checkpoint / ligar câmera overview antes da foto). O `playtest_game` só tinha
  o `waitMs` cego — a IA compensava boot lento aumentando a espera no chute.
- `thumb_glb.py` — thumbnails via Blender; **já coberto** nativamente pelo
  `inspect_assets` (que ainda cruza com a semântica do `kit.json`).

Decidir: trazer como **tools nativas do agente** ou como **scripts no template**?

## Decisão

**Tools nativas, não scripts no template.** Script no template vira cópia
congelada por projeto (desatualiza como o `vendor/`, mas sem re-vendor), depende
do ambiente do usuário e precisa de prompt pra IA saber que existe; tool MCP o
agente descobre sozinho e todo projeto ganha junto quando ela melhora.

1. **`measure_glb`** (server `cortex-assets`, `electron/agent/assets/measureGlb.ts`):
   mede bounding box de `.glb` específicos em Node puro — header GLB + chunk
   JSON, matrizes TRS/matrix acumuladas na hierarquia, união dos min/max dos
   accessors POSITION. Instantâneo, sem Blender. Devolve tabela (tamanho
   L×A×P, min, max) e marca **mesh skinned** (`⚠️ bbox = bind pose` — o gotcha
   "SkinnedMesh mente no bbox"). Por ser leitura pura, entra em
   `APPROVED_AUTO_TOOLS`: roda sem card de aprovação e fica disponível no modo
   plan. O system prompt orienta: medidas pontuais → `measure_glb`; inventário
   visual de diretório → `inspect_assets`.
2. **`playtest_game` ganha `wait_for` e `eval_js`** (`runAndCapture.ts`):
   - `wait_for` — expressão JS avaliada na página a cada 500ms até virar truthy
     (teto 60s), ANTES do `waitMs` (que vira só settle de frames). No timeout,
     o diagnóstico (último valor + últimos recursos de rede com flag
     `[PENDENTE]`) vai pro console e a captura **segue mesmo assim** — foto
     parcial + logs ajudam a diagnosticar o boot travado.
   - `eval_js` — JS arbitrário executado após o boot e antes das `actions`
     (teleporte, overview, disparo de evento); o retorno aparece no console
     como `[eval] …`.
   - O polling é o helper puro `pollUntilTruthy` (deps injetadas), testável sem
     Electron.

O marco de boot (`__bootStage`) **não** virou convenção do engine: `wait_for` é
expressão genérica — cada jogo expõe (ou não) o marco que quiser.

## Consequências

- A IA mede proporção em metros de qualquer peça sem custo de Blender, inclusive
  em modo plan; `inspect_assets` continua sendo o caminho pro inventário visual.
- Playtest de projetos com boot pesado deixa de depender de `waitMs` chutado;
  fases grandes podem ser fotografadas por trecho via `eval_js` (checkpoint).
- Bbox de skinned mesh continua sendo a bind pose (limitação do formato — medir
  a pose animada exigiria avaliar a animação; fora do escopo).
- `eval_js` roda JS arbitrário na página do jogo — mesmo nível de confiança das
  `actions` (o jogo é o próprio projeto do usuário, sandbox do playtest).
- Os scripts do teste4 continuam existindo lá pra uso fora do Studio (CI); a
  fonte de verdade da lógica portada agora é o engine.
