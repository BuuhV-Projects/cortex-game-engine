// Entry do bundle quando o alvo é um JOGO REAL (CORTEX_GAME_MAIN definido no
// bundle.mjs): prelude de shims → diagnóstico/atalhos → main.ts do jogo (o
// mesmo arquivo que roda no Studio/browser, sem alterações).
import './prelude.js';
import './game-diagnostics.js';
import 'cortex-game-main';
