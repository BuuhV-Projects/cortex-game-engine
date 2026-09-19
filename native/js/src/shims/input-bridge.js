// Ponte de input: recebe eventos do host nativo (__cortexDispatchInput) e
// redistribui como o browser faria — window, document e document.body
// (o InputManager do engine anexa em document.body). Também liga
// navigator.getGamepads ao snapshot nativo (__cortexInput).

export function installInputBridge() {
  globalThis.__cortexDispatchInput = function (raw) {
    const event = new Event(raw.type);
    for (const key in raw) if (key !== 'type') event[key] = raw[key];
    globalThis.dispatchEvent(event);
    document.dispatchEvent(event);
    document.body.dispatchEvent(event);
    // O modo EDITOR anexa os listeners no CANVAS (TransformControls recebe o
    // canvas como domElement, e o ObjectEditSystem escuta pointerdown nele).
    // Sem esta linha dá pra jogar, mas não dá pra selecionar/arrastar (SPEC-0202).
    if (globalThis.__cortexCanvas) globalThis.__cortexCanvas.dispatchEvent(event);
  };

  if (globalThis.__cortexInput) {
    globalThis.navigator.getGamepads = function () {
      return globalThis.__cortexInput.getGamepads();
    };
  }
}
