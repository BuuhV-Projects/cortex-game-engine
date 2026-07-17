// Roda ENTRE o prelude e o main.ts do jogo (ordem de import no game-entry):
// diagnóstico do boot + atalho de fase.

// `?level=fase-1` pula o menu (mesmo atalho que o jogo usa no browser).
// __CORTEX_LEVEL é substituído pelo define do bundle (identificador bare).
const SKIP_LEVEL = typeof __CORTEX_LEVEL !== 'undefined' ? __CORTEX_LEVEL : '';
if (SKIP_LEVEL) {
  globalThis.location.search = '?level=' + SKIP_LEVEL;
  print('[game] pulando menu: ' + globalThis.location.search);
}

// Export em modo DEBUG (export-game --debug): o define liga o DebugHud do
// engine (FPS/CPU/memória/GPU na tela — src/ui/DebugHud.ts, lê este global).
if (typeof __CORTEX_DEBUG_HUD !== 'undefined' && __CORTEX_DEBUG_HUD) {
  globalThis.__cortexDebugHud = true;
  print('[game] modo debug: HUD de métricas ligado');
}

// Medidor de FPS do host, opt-in de runtime: liga com `globalThis.__cortexPerf
// = true` antes do boot, ou incluindo 'cortexPerf=1' na CORTEX_LAUNCH_QUERY.
// Conta rAF por janela de ~2s e imprime média + pior frame — foi o instrumento
// que caçou o bug dos 4,7 fps (raycast em SkinnedMesh, ADR-0118); fica
// disponível pra diagnósticos futuros.
const PERF_ON =
  globalThis.__cortexPerf === true ||
  String((globalThis.location && globalThis.location.search) || '').indexOf('cortexPerf=1') >= 0;
if (PERF_ON) {
  let perfCount = 0;
  let perfStart = 0;
  let perfPrev = 0;
  let perfWorst = 0;
  const perfTick = (ts) => {
    if (!perfStart) { perfStart = ts; perfPrev = ts; }
    perfCount++;
    const gap = ts - perfPrev;
    if (gap > perfWorst) perfWorst = gap;
    perfPrev = ts;
    const span = ts - perfStart;
    if (span >= 2000) {
      const fps = (perfCount / span) * 1000;
      print('[perf] fps=' + fps.toFixed(1) + ' worst=' + perfWorst.toFixed(0) + 'ms frames=' + perfCount);
      perfCount = 0; perfStart = ts; perfWorst = 0;
    }
    requestAnimationFrame(perfTick);
  };
  requestAnimationFrame(perfTick);
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
