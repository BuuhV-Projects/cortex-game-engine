// Converte scene_engine.json (Demonstration do .blend, espaço-engine) numa
// FASE 6 do teste4: gera scenes/fase6.data.json (nós da cena) + scenes/fase6.ts.
// Uso: node convert_fase6.mjs <scene_engine.json> <teste4Dir>
import fs from 'node:fs';
import path from 'node:path';

const [sceneFile, gameDir] = process.argv.slice(2);
const { bbox, pieces } = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
const kitDir = path.join(gameDir, 'assets', 'kit');
const kit = new Set(fs.readdirSync(kitDir));

// Resolve o ARQUIVO do kit a partir do nome da peça no .blend:
//  1) tira o sufixo de instância `.NNN` (tree_001.005 → tree_001.glb);
//  2) duplicata renomeada (obstacle_5_007) → canônico do tipo (obstacle_5_001.glb);
//  3) senão, tenta <tipo>.glb. Devolve null pra sobras (Circle/Cube).
function resolveKitFile(name) {
  const noInst = name.replace(/\.\d+$/, '');
  if (kit.has(`${noInst}.glb`)) return `${noInst}.glb`;
  const m = noInst.match(/^(.*)_(\d+)$/);
  if (m) {
    if (kit.has(`${m[1]}_001.glb`)) return `${m[1]}_001.glb`;
    if (kit.has(`${m[1]}.glb`)) return `${m[1]}.glb`;
  }
  return null;
}

// scripts por categoria (nomes reais dos ScriptBehavior do teste4)
const SCRIPT = {
  hazard: 'Perigo',
  trampoline: 'Trampolim',
  checkpoint: 'Checkpoint',
  finish: 'Chegada',
};

const nodes = [];
const missing = {};
let used = 0;
pieces.forEach((p, i) => {
  const file = resolveKitFile(p.name);
  if (!file) { missing[p.asset] = (missing[p.asset] || 0) + 1; return; }
  const node = {
    type: 'model',
    id: `f6_${i}`,
    url: `assets/kit/${file}`,
    transform: { position: p.pos, rotation: p.rot, scale: p.scale },
    castShadow: true,
  };
  const s = SCRIPT[p.cat];
  if (s) node.scripts = [{ type: s }];
  nodes.push(node);
  used++;
});

// ── SPAWN: ponta de menor X, na faixa central (|Z|<6), no topo do chão de lá.
const startX = bbox.min[0];
const nearStart = pieces.filter((p) => p.cat === 'ground' && p.pos[0] < startX + 8 && Math.abs(p.pos[2]) < 8);
const startTopY = nearStart.length ? Math.max(...nearStart.map((p) => p.pos[1])) : 2;
const spawn = [Math.round((startX + 3) * 10) / 10, Math.round((startTopY + 2) * 10) / 10, 0];

// ── COINS (não existem no mapa; adiciona pela skill: linha de risco perto de
//    hazards da faixa central, ~a cada 12m). Recompensa quem encara o perigo.
const coins = [];
const centralHaz = pieces
  .filter((p) => p.cat === 'hazard' && Math.abs(p.pos[2]) < 12)
  .sort((a, b) => a.pos[0] - b.pos[0]);
let lastCoinX = -Infinity;
for (const h of centralHaz) {
  if (h.pos[0] - lastCoinX < 12) continue;
  lastCoinX = h.pos[0];
  coins.push([h.pos[0], h.pos[1] + 1.3, h.pos[2]]);
}

// meta (finish central mais distante) só pra doc/spawn — o 'Chegada' já vence.
const finishes = pieces.filter((p) => p.cat === 'finish').sort((a, b) => b.pos[0] - a.pos[0]);

fs.writeFileSync(
  path.join(gameDir, 'scenes', 'fase6.data.json'),
  JSON.stringify({ spawn, coins, seaY: Math.round((bbox.min[1] - 2) * 10) / 10, nodes }),
);

console.log('peças usadas:', used, '/', pieces.length);
console.log('sem arquivo no kit:', Object.keys(missing).length, 'tipos ->', Object.entries(missing).slice(0, 20));
console.log('spawn:', spawn, '| coins:', coins.length, '| seaY:', Math.round((bbox.min[1] - 2) * 10) / 10);
console.log('finish central (goal ref):', finishes[0]?.pos);

// ── fase6.ts (fino: importa os dados, adiciona água + player + coins + luz) ──
const ts = `/**
 * **Fase 6 — Deathrun** (mapa profissional \`Platformer_Deathrun.blend\` convertido
 * pro Studio). A cena vem de \`fase6.data.json\` — gerado a partir da coleção
 * \`Demonstration\` do .blend (Blender API → espaço-engine), cada peça um nó
 * data-driven (posição/rotação/escala reais) referenciando o kit em \`assets/kit/\`.
 * O CHÃO (grass/land) é o piso: o character raycasta o mesh real (terreno
 * contínuo, não plataformas). Hazards/checkpoint/chegada/trampolim ganham o
 * script de gameplay pelo nome. Coins e player são adicionados aqui (não vêm do
 * mapa). Editável no Inspector como qualquer fase — física é dado do nó.
 *
 * Regenerar: \`node convert_fase6.mjs scene_engine.json <teste4>\` (ver skill
 * level-design-plataforma e o scratchpad da sessão).
 */
import type { CourseData } from './course.js'
import data from './fase6.data.json'

type Node = Record<string, unknown>

export function buildFase6(): CourseData {
  const nodes: Node[] = [...(data.nodes as Node[])]

  // ── Coins na linha de risco (skill: recompensa perto do perigo).
  for (const [x, y, z] of data.coins as [number, number, number][]) {
    nodes.push({
      type: 'model', id: \`f6coin_\${x}_\${z}\`, url: 'assets/kit/coin_001.glb',
      place: { x, y, z }, castShadow: true,
      scripts: [{ type: 'Moeda' }],
      material: { type: 'unlit', color: '#ffd83a', textured: false, outline: 0.02 },
    })
  }

  // ── MAR bem embaixo: cair = respawn (CourseController). Nó water do engine.
  nodes.push({
    type: 'water', id: 'sea', y: data.seaY,
    color: '#33b3e6', causticsUrl: 'assets/textures/caustics.png',
    repeat: 24, causticsIntensity: 0.7, flowSpeed: [0.02, 0.013],
  })

  // ── Player (mannequin que já bate com o controlador). groundY baixo = sem
  //    piso invisível; o respawn ao cair é do controller.
  const spawn = data.spawn as [number, number, number]
  nodes.push({
    type: 'model', id: 'player', url: 'assets/characters/player.glb',
    place: { x: spawn[0], y: spawn[1], z: spawn[2] }, matte: false,
    character: { radius: 0.4, height: 1.8, jumpForce: 13, groundY: -100, stepHeight: 0.5 },
  })

  const def = {
    version: 1,
    background: '#a9e2ff',
    outdoorLighting: { sky: '#a9e2ff', sunIntensity: 3.2, exposure: 1.12 },
    nodes,
  }
  return { def, spawn }
}
`;
fs.writeFileSync(path.join(gameDir, 'scenes', 'fase6.ts'), ts);
console.log('escrito: scenes/fase6.ts + scenes/fase6.data.json');
