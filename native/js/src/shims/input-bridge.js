// Ponte de input: recebe eventos do host nativo (__cortexDispatchInput) e
// redistribui como o browser faria — window, document e document.body
// (o InputManager do engine anexa em document.body). Também liga
// navigator.getGamepads ao snapshot nativo (__cortexInput).

// Eventos de mouse de compatibilidade (SPEC-0285): no browser cada pointer*
// do mouse vem acompanhado do mouse* — e o InputManager escuta mouse*.
const MOUSE_COMPAT_TYPE = {
  pointerdown: 'mousedown',
  pointerup: 'mouseup',
  pointermove: 'mousemove',
};
const PRIMARY_BUTTON = 0;

function makeEvent(raw, type) {
  const event = new Event(type);
  for (const key in raw) if (key !== 'type') event[key] = raw[key];
  return event;
}

function deliver(raw, type) {
  const event = makeEvent(raw, type);
  globalThis.dispatchEvent(event);
  // blur da janela não chega ao document/body no browser.
  if (type === 'blur') return;
  document.dispatchEvent(event);
  document.body.dispatchEvent(event);
  // O modo EDITOR anexa os listeners no CANVAS (TransformControls recebe o
  // canvas como domElement, e o ObjectEditSystem escuta pointerdown nele).
  // Sem esta linha dá pra jogar, mas não dá pra selecionar/arrastar (SPEC-0202).
  if (globalThis.__cortexCanvas) globalThis.__cortexCanvas.dispatchEvent(event);
}

export function installInputBridge() {
  globalThis.__cortexDispatchInput = function (raw) {
    deliver(raw, raw.type);
    const compatType = MOUSE_COMPAT_TYPE[raw.type];
    if (compatType) deliver(raw, compatType);
    if (raw.type === 'pointerup' && raw.button === PRIMARY_BUTTON) deliver(raw, 'click');
  };

  if (globalThis.__cortexInput) {
    globalThis.navigator.getGamepads = function () {
      return globalThis.__cortexInput.getGamepads();
    };
  }
}
