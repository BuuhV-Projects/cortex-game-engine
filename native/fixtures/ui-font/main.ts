/**
 * Fonte de arquivo por widget (SPEC-0716), nos DOIS backends: o template declara
 * a TTF (Bebas Neue, OFL) com `@font-face` e os widgets a usam por `font-family`;
 * o `<canvas>` usa a mesma família em `ctx.font`. No Studio/browser a fonte vem
 * por `FontFace`; no export nativo, do `assets.pak` (`__cortexLoadFont`).
 *
 * - DOM: `yarn dev:ui-font`
 * - nativo: `node native/scripts/export-game.mjs native/fixtures/ui-font --out <dir>`
 *
 * Imprime o `measuredWidth` das duas linhas: a de Bebas (condensada) mede menos
 * que a de Roboto já na 1ª medida, nos dois backends.
 */
import { Color } from 'three';
import { Game, loadUiTemplate, type UiCanvas } from 'cortex-game-engine';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game({ canvas });
game.scene.getThreeScene().background = new Color(0x1b2230);

const hud = await loadUiTemplate(game.ui, 'assets/ui/hud.html');

const radar = (hud.get('radar') as UiCanvas).canvas.getContext('2d')!;
radar.fillStyle = '#0d1b2a';
radar.fillRect(0, 0, 360, 80);
radar.fillStyle = '#7fdbff';
radar.font = "40px 'Bebas'";
radar.fillText('CANVAS EM BEBAS', 12, 54);

game.start();
let reported = false;
game.onUpdate(() => {
  const bebas = hud.get('bebas')!.measuredWidth;
  if (reported || bebas === 0) return;
  reported = true;
  console.info(
    `[ui-font] measuredWidth Bebas=${bebas} Roboto=${hud.get('roboto')!.measuredWidth} ` +
      `canvas=${radar.measureText('CANVAS EM BEBAS').width.toFixed(1)}`,
  );
});
