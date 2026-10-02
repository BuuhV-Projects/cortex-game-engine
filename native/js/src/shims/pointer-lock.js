// Pointer Lock API (SPEC-0285): canvas.requestPointerLock /
// document.exitPointerLock / document.pointerLockElement + 'pointerlockchange'.
// O lock de verdade (cursor escondido e preso, deltas relativos) é o modo
// relativo do SDL3, ligado por __cortexInput.setPointerLock.

const ESCAPE_KEY = 'Escape';

export function installPointerLock(canvas) {
  const doc = globalThis.document;
  doc.pointerLockElement = null;

  function setLockedElement(element) {
    if (doc.pointerLockElement === element) return;
    const input = globalThis.__cortexInput;
    if (input && input.setPointerLock) input.setPointerLock(element !== null);
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
  }

  canvas.requestPointerLock = function () {
    setLockedElement(canvas);
    return Promise.resolve();
  };
  doc.exitPointerLock = function () {
    setLockedElement(null);
  };

  // Como o browser: perder o foco ou apertar ESC solta o lock. O keydown de
  // Escape segue até os listeners do jogo (menus/pausa).
  globalThis.addEventListener('blur', function () { setLockedElement(null); });
  globalThis.addEventListener('keydown', function (event) {
    if (event.key === ESCAPE_KEY) setLockedElement(null);
  });
}
