// Deriva os fatores de escala do kit a partir de MEDIDAS-ALVO em metros.
// O pack não tem escala unificada (portal 9,4 m, plataforma 38 m, flor 2,8 m),
// então o alvo é declarado por família e o fator sai da medida real — assim o
// número no factors.json é auditável em vez de mágico.
// Referência: player = 1,8 m (REGRA de proporção métrica do projeto).
// Uso: node make-factors.mjs <sizes.json> <factors_out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [sizesPath, outPath] = process.argv.slice(2);
const sizes = JSON.parse(readFileSync(sizesPath, 'utf8')).sizes;

// eixo: qual dimensão do bbox [larg, alt, prof] a medida-alvo governa.
const W = 0, H = 1;
const TARGETS = [
  // --- molduras atravessáveis: mesma ALTURA nas cinco salas, pra warp room ler
  // como um sistema só. 4 m = vão de ~3 m, monumental para um player de 1,8 m.
  { match: /^archway_/, axis: H, meters: 4.0, note: 'portal do M1/M2' },
  { match: /^doorway_/, axis: H, meters: 4.0, note: 'portal do M4' },
  // A cápsula futurista é mais alta de propósito: a silhueta dela é vertical.
  { match: /^futuristic_(black|white)$/, axis: H, meters: 4.6, note: 'portal do M3' },
  // Anéis: a "altura" é o diâmetro do anel.
  { match: /^pillar_circle_/, axis: H, meters: 4.2, note: 'anel fino' },
  { match: /^pillar_(orange|red)$/, axis: H, meters: 4.2, note: 'anel de pedra (extra)' },

  // --- base: pedestal de cada portal. 5,5 m dá pé pro player subir sem virar praça.
  { match: /^stoneplatform_/, axis: W, meters: 5.5, note: 'pedestal do portal' },

  // --- vão / efeito (planos)
  { match: /^pool_(blue|celestial)$/, axis: W, meters: 4.5, note: 'vórtice no chão' },
  { match: /^circle_/, axis: W, meters: 3.2, note: 'mandala do vão' },
  { match: /^futuristic_circle_/, axis: null, meters: 3.5, note: 'anel futurista (maior dim)' },
  { match: /^glare_rising_/, axis: H, meters: 4.0, note: 'raios subindo' },
  { match: /^glare_/, axis: H, meters: 4.0, note: 'clarão radial' },
  { match: /^rune_/, axis: W, meters: 3.0, note: 'runa no chão' },

  // --- ambiente
  { match: /^mist_mesh$/, axis: W, meters: 5.0, note: 'névoa' },
  { match: /^grass_plane$/, axis: H, meters: 0.6, note: 'tufo de grama' },
  { match: /^bellflower$/, axis: H, meters: 0.45, note: 'flor' },
];

const factors = {};
const report = [];
for (const [name, size] of Object.entries(sizes)) {
  const t = TARGETS.find((t) => t.match.test(name));
  if (!t) { report.push(`SEM ALVO: ${name}`); continue; }
  // axis null = usa a maior dimensão (peça cuja orientação ainda não confiamos).
  const current = t.axis === null ? Math.max(...size) : size[t.axis];
  if (!current) { report.push(`DIM ZERO: ${name} eixo=${t.axis}`); continue; }
  const f = Number((t.meters / current).toFixed(5));
  factors[name] = f;
  report.push(`${name.padEnd(26)} x${String(f).padEnd(9)} ${t.meters}m  (${t.note})`);
}

// `pool_green` foi remontado da mesh-base e não carrega a escala TORTA que o
// prefab dos irmãos tinha (`scale [4.14, 2.45, 2.45]`) — sem corrigir por eixo
// ele sai retangular no meio de dois irmãos quase quadrados. O alvo é ficar do
// mesmo tamanho final do `pool_blue` já normalizado.
const blue = sizes['pool_blue'];
const green = sizes['pool_green'];
if (blue && green && factors['pool_blue']) {
  const targetW = blue[0] * factors['pool_blue'];
  const targetH = blue[1] * factors['pool_blue'];
  factors['pool_green'] = [
    Number((targetW / green[0]).toFixed(5)),
    Number((targetH / green[1]).toFixed(5)),
    1,
  ];
  report.push(`pool_green (nao-uniforme)  ${JSON.stringify(factors['pool_green'])} -> ${targetW.toFixed(2)} x ${targetH.toFixed(2)} m`);
}

writeFileSync(outPath, JSON.stringify(factors, null, 2));
console.log(report.join('\n'));
console.log(`\n${Object.keys(factors).length} fatores -> ${outPath}`);
