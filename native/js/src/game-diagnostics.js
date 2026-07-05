// Roda ENTRE o prelude e o main.ts do jogo (ordem de import no game-entry):
// diagnóstico do boot + atalho de fase.

// `?level=fase-1` pula o menu (mesmo atalho que o jogo usa no browser).
// __CORTEX_LEVEL é substituído pelo define do bundle (identificador bare).
const SKIP_LEVEL = typeof __CORTEX_LEVEL !== 'undefined' ? __CORTEX_LEVEL : '';
if (SKIP_LEVEL) {
  globalThis.location.search = '?level=' + SKIP_LEVEL;
  print('[game] pulando menu: ' + globalThis.location.search);
}

// Estágio do bootstrap visível no console do host (o main.ts marca
// window.__bootStage a cada etapa: fase → scene → audio → pronto).
let lastStage = '';
function watchBootStage() {
  const stage = globalThis.__bootStage;
  if (stage && stage !== lastStage) {
    lastStage = stage;
    print('[game] boot stage: ' + stage);
  }
  requestAnimationFrame(watchBootStage);
}
requestAnimationFrame(watchBootStage);

print('[game] shims prontos — carregando main.ts do jogo...');
