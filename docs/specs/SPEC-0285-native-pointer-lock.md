# SPEC-0285 - Pointer Lock no host nativo

**Data:** 2026-10-02
**Status:** aceito

## Contexto

No export nativo a câmera não gira com o mouse em nenhum sistema:

- `VehicleControlSystem` só lê `input.getMouseDelta()` com `document.pointerLockElement`;
  `ThirdPersonControlSystem` e `FirstPersonCameraSystem` exigem
  `document.pointerLockElement === canvas` e chamam `canvas.requestPointerLock?.()`.
- O crash-bandicoot-racer pede o lock no `click` do canvas
  (`canvas.requestPointerLock?.()?.catch(...)`, espera Promise) e solta com
  `document.exitPointerLock()`.

Investigando, o pointer lock ausente não é o único buraco. São três:

1. **Não há Pointer Lock API** — `document.pointerLockElement` é `undefined`, nem
   `requestPointerLock`/`exitPointerLock` existem.
2. **Não há eventos de mouse de compatibilidade.** O host emite só
   `pointerdown/pointerup/pointermove` (SPEC-0202), mas o `InputManager` escuta
   `mousedown/mouseup/mousemove` no `document.body` — no browser os dois tipos
   disparam para o mesmo gesto. Resultado: `getMouseDelta()` é sempre 0 no host,
   com ou sem lock. Também não existe `click`.
3. **O canvas do host é surdo.** `createCanvas` (webgpu-extras) tem
   `addEventListener` no-op, então o `click` do CarSystem e o `mousedown` dos
   sistemas de câmera nunca rodam.

## Decisão

API fiel ao browser, sem mudar nada no engine nem nos jogos.

**JS — `native/js/src/shims/pointer-lock.js`** (`installPointerLock(canvas)`, chamado
no prelude depois do `installHostCanvas`):

- `document.pointerLockElement` começa `null`.
- `canvas.requestPointerLock()` → `__cortexInput.setPointerLock(true)`,
  `pointerLockElement = canvas`, dispara `pointerlockchange` no `document`,
  devolve `Promise.resolve()` (forma moderna da API).
- `document.exitPointerLock()` → `setPointerLock(false)`, `pointerLockElement = null`,
  `pointerlockchange`; devolve `undefined`, como no browser.
- Sem mudança de estado (pedir lock já travado, soltar já solto) não há evento.
- **Perda de foco** (`blur` no window) e **ESC** (`keydown` com `key === 'Escape'`)
  soltam o lock, como o browser. O `keydown` de Escape continua chegando aos
  listeners do jogo (menus/pausa seguem funcionando); o lock já está solto
  quando eles rodam.
- Não exigimos "user gesture" (o browser rejeita sem gesto): no host não há
  página hostil para se proteger.

**JS — `input-bridge.js`:**

- Depois de cada `pointerdown/pointerup/pointermove`, entrega o par de
  compatibilidade `mousedown/mouseup/mousemove` (mesmos campos, inclusive
  `movementX/Y`) e, no `pointerup` do botão primário (0), um `click` — a ordem do
  browser.
- `blur` vai SÓ para o `window` (no browser o blur da janela não chega ao
  document/body).

**JS — `webgpu-extras.js`:** `createCanvas` ganha um event bus real
(`createEventBus`) no lugar dos listeners no-op.

**C++ — `native/src/shims/input.*`:**

- `registerInput(env, window)` guarda a janela e expõe
  `__cortexInput.setPointerLock(bool)` → `SDL_SetWindowRelativeMouseMode(window, on)`
  (cursor some e fica preso; o SDL3 segue mandando `xrel/yrel`, que já viram
  `movementX/Y` no `pointermove`).
- `SDL_EVENT_WINDOW_FOCUS_LOST` vira `{ type: 'blur' }` para o JS. É
  necessário: o SDL3 **religa** o modo relativo sozinho quando o foco volta, e o
  browser não — o shim solta o lock no `blur`, que desliga o modo relativo de vez.

Deltas: em modo relativo no Windows o SDL3 entrega contagem crua do mouse (sem a
aceleração do SO). O browser, por padrão, entrega o delta acelerado. A diferença
é de sensibilidade, não de direção; fica assim (é o que jogo de câmera prefere) até
alguém pedir paridade (`SDL_HINT_MOUSE_RELATIVE_SYSTEM_SCALE`).

## Consequências

- Câmera por mouse passa a funcionar no export (veículo, 3ª e 1ª pessoa) com o
  mesmo código do browser.
- Jogos que escutam `mousedown/mouseup/mousemove/click` passam a recebê-los no
  host — como no browser. Quem escutava `pointer*` E `mouse*` para o mesmo gesto
  recebe os dois, também como no browser.
- Como a UI de runtime é desenhada no canvas, clicar num botão da UI também gera
  `click` no canvas (no browser, com UI em DOM, não geraria). Jogos que pedem lock
  no clique do canvas devem checar se estão em menu — o CarSystem já checa.
- Teste: `tests/native/pointer-lock.test.ts` (shim JS). O lado C++ é validado
  rodando o jogo no host.
