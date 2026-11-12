// Bancada do efeito embaixo d'água (SPEC-0726): postes listrados (as faixas da
// ondulação aparecem nas verticais), água e uma HUD fixa, que não pode ondular.
// O efeito liga e desliga a cada CYCLE_SECONDS, com rampa, para a captura pegar
// os dois estados. `?on` deixa sempre ligado e `?off` sempre desligado.
import { BoxGeometry, Color, DirectionalLight, Game, HemisphereLight, Mesh, MeshStandardMaterial, UiLabel, UiPanel, Water } from '../../src/index-runtime.js';

const CYCLE_SECONDS = 2;
const RAMP_SECONDS = 0.3;
const DEPTH_METERS = 25;
const CAMERA_HEIGHT = 15;
const CAMERA_DISTANCE = 25;
const POLE_COUNT = 9;
const POLE_SPACING = 3;
const POLE_HEIGHT = 9;
const POLE_WIDTH = 0.5;
const STRIPE_COLORS = [0xf2f2f2, 0x1f2a44] as const;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game({ canvas, far: 250 });
game.scene.getThreeScene().background = new Color(0x66c9f0);
game.scene.add(new HemisphereLight(0xbfefff, 0x42718b, 2.2));
const sun = new DirectionalLight(0xffedc7, 3);
sun.position.set(-20, 40, 10);
game.scene.add(sun);
game.maxFps = 0;
game.camera.position.set(18, CAMERA_HEIGHT, CAMERA_DISTANCE);
game.camera.lookAt(0, 0, 0);

new Water(game.scene, {
  style: 'cartoon', size: 180, color: 0x089dc4,
  waveHeight: 0.2, waveLength: 16, waveSpeed: 1, foamStrength: 0.8, segments: 128,
});
for (let i = 0; i < POLE_COUNT; i++) {
  const pole = new Mesh(
    new BoxGeometry(POLE_WIDTH, POLE_HEIGHT, POLE_WIDTH),
    new MeshStandardMaterial({ color: STRIPE_COLORS[i % STRIPE_COLORS.length] }),
  );
  pole.position.set((i - (POLE_COUNT - 1) / 2) * POLE_SPACING, POLE_HEIGHT / 2, 0);
  game.scene.add(pole);
}

// HUD: uma moldura de bordas retas, que denunciaria qualquer distorção da UI.
game.ui.add(new UiPanel({
  anchor: 'top-left', x: 24, y: 24, width: 360, height: 64,
  background: '#000000aa', borderWidth: 4, borderColor: '#ffffff',
}));
const label = game.ui.add(new UiLabel({ anchor: 'top-left', x: 44, y: 44, text: '', fontSize: 24 }));

const query = typeof location !== 'undefined' ? location.search : '';
const forced = query.includes('on') ? 1 : query.includes('off') ? 0 : null;
let elapsed = 0;

game.onUpdate((dt) => {
  elapsed += dt;
  const inCycle = elapsed % (CYCLE_SECONDS * 2);
  const ramp = inCycle < CYCLE_SECONDS
    ? Math.min(1, inCycle / RAMP_SECONDS)
    : Math.max(0, 1 - (inCycle - CYCLE_SECONDS) / RAMP_SECONDS);
  const amount = forced ?? ramp;
  game.renderer.setUnderwater(amount > 0 ? { amount, depth: DEPTH_METERS } : null);
  label.set({ text: `HUD fixa - embaixo d'água ${Math.round(amount * 100)}%` });
});

// Os dois caminhos de render aquecidos no carregamento (SPEC-0726).
await game.precompile();
game.renderer.setUnderwater({ amount: 1 });
await game.precompile();
game.renderer.setUnderwater(null);
game.start();
