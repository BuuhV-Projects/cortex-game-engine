# SPEC-0067 - Reconexão de gamepad via eventos do window

**Data:** 2026-06-15
**Status:** aceito

## Contexto

O `GamepadManager` (ADR-0023) rastreia gamepads por **polling**: a cada frame o
chamador roda `poll()`, que lê `navigator.getGamepads()` e emite transições
(`gamepad:connect`/`disconnect`, `button:down`/`up`). A lógica de reconexão por
polling está correta e testada (slot volta de `null` → recria estado → emite
`gamepad:connect`).

Na prática, porém, um usuário relatou: **"desligo o controle Xbox e ligo de novo, e
não reconecta"**. A causa é uma proteção do Chromium/Electron (anti-fingerprinting):
depois que um gamepad é **religado**, o `navigator.getGamepads()` só volta a
**expor** o dispositivo após o evento `gamepadconnected` ser disparado (o que
acontece num gesto do usuário — apertar um botão). Como o `GamepadManager` só fazia
polling e **não ouvia** esse evento, o pad reconectado podia nunca reaparecer no
array do polling.

## Decisão

O `GamepadManager` passa a **ouvir** `gamepadconnected` e `gamepaddisconnected` no
`window` (quando há `window`), e em ambos chama `poll()` imediatamente pra
re-sincronizar o estado e emitir os eventos de transição na hora. O **polling por
frame continua sendo a fonte de verdade**; os listeners apenas garantem que a
(re)conexão seja detectada de forma confiável e imediata.

Adicionado `dispose()` pra remover os listeners (teardown/hot-reload sem vazar).
Ambos guardam `typeof window !== 'undefined'` → no-op em Node (testes/SSR), sem
mudar o comportamento de `poll()`.

Implementação em `src/core/GamepadManager.ts`; testes em
`tests/core/GamepadManager.test.ts` (stub de `window` como `EventTarget`, dispara os
eventos e verifica o re-sync + o `dispose`).

## Consequências

- **Reconectar o controle volta a funcionar** sem reiniciar o jogo (após o gesto que
  o Chromium exige). O jogo não muda nada: segue só chamando `poll()` por frame
  (ex.: `XboxControls.update()` no Hearthvale).
- Nova API pública: `GamepadManager.dispose()`. Quem cria o manager de forma
  efêmera deve chamá-lo no teardown; em uso singleton/long-lived, é dispensável.
- Os listeners são registrados no construtor — criar muitos `GamepadManager` registra
  muitos listeners. O padrão continua sendo **um** manager por app.
- Como é mudança de API pública do engine, regenerar a doc (`yarn docs:engine`) e
  re-vendorizar os bundles+`.d.ts` nos jogos que consomem o engine (ADR-0009).
