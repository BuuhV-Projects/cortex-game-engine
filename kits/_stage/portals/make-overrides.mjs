// Gera o overrides.json do kit portals-warp.
//
// O naming do pack é descritivo, mas o `classify()` do gen-kit é kit-independente
// e não conhece "portal" como categoria — e, mais importante, a SEMÂNTICA que
// importa aqui (o que é moldura atravessável, o que é chão, o que é billboard,
// qual peça vai em qual mundo) só existe se for anotada. Fica em `note`/`altUse`,
// que sobrevivem ao reprocesso do kit.
// Uso: node make-overrides.mjs <overrides_out.json>
import { writeFileSync } from 'node:fs';

const out = process.argv[2];

// Molduras ATRAVESSÁVEIS: `connector` (é passagem), não `platform`.
// `solid: false` de propósito — um collider de caixa taparia justamente o VÃO,
// que é por onde o player entra. Parede é papel da geometria da sala.
const frame = (tags, note, extra = {}) => ({
  role: 'connector',
  tags: ['portal', ...tags, 'L'],
  gameplayRole: ['landmark', 'guidance'],
  solid: false,
  standalone: true,
  note,
  ...extra,
});

// Peça de CHÃO (vórtice/runa/anel horizontal): marca o piso diante do portal.
const floorMark = (tags, note, extra = {}) => ({
  role: 'decoration',
  tags: [...tags, 'ground', 'M'],
  gameplayRole: ['guidance'],
  solid: false,
  standalone: true,
  note,
  ...extra,
});

const effect = (tags, note) => ({
  role: 'decoration',
  tags: ['effect', ...tags, 'M'],
  gameplayRole: [],
  solid: false,
  standalone: false,
  note,
  altUse: ['portal-glow', 'spawn-fx'],
});

const PLASMA_NOTE =
  'O vão é preenchido em runtime pelo plasma procedural do jogo ' +
  '(measurePortalGap + createPlasmaPortal): ele mede a abertura por raycast e ' +
  'recorta a energia na forma exata, então serve qualquer moldura.';

const overrides = {
  // ---------------- molduras: uma por mundo (SPEC do hub) ----------------
  archway_lightwood: frame(['arch', 'stone', 'light'],
    `Arco claro de pedra/madeira, vão em tons pastel. Portal do MUNDO 1 (Ilhas). ${PLASMA_NOTE}`),
  archway_darkwood: frame(['arch', 'wood', 'dark'],
    `Arco de madeira escura. Portal do MUNDO 2 (Chocolate) — a madeira lê como chocolate. ${PLASMA_NOTE}`),
  futuristic_white: frame(['futuristic', 'metal', 'light'],
    `Cápsula futurista clara com faixa emissiva ciano. Portal do MUNDO 3 (Espaço). ${PLASMA_NOTE}`),
  futuristic_black: frame(['futuristic', 'metal', 'dark'],
    `Cápsula futurista preta com faixa emissiva verde. Variante escura do portal espacial. ${PLASMA_NOTE}`),
  doorway_white: frame(['door', 'stone', 'light'],
    `Moldura em U clara e VAZIA — a melhor base pro plasma (nada preenche o vão de fábrica). Portal do MUNDO 4 (Aquapark). ${PLASMA_NOTE}`),
  doorway_darkbrown: frame(['door', 'wood', 'dark'],
    `Porta escura com o vão JÁ preenchido por um plano texturizado (roxo). Se for usar o plasma do jogo, esconda o plano filho. ${PLASMA_NOTE}`),
  pillar_red: frame(['ring', 'stone', 'red'],
    `Par de anéis de pedra rachada, vermelhos. Portal do MUNDO EXTRA (submundo/ruínas). Flutua: não tem base própria. ${PLASMA_NOTE}`,
    { altUse: ['floating-gate', 'arena-marker'] }),
  pillar_orange: frame(['ring', 'stone', 'orange'],
    `Par de anéis de pedra rachada, âmbar. Variante quente do portal de ruínas. ${PLASMA_NOTE}`,
    { altUse: ['floating-gate', 'arena-marker'] }),
  pillar_circle_red: frame(['ring', 'thin', 'red'],
    `Par de anéis FINOS vermelhos (sem pedra). Portal mínimo, bom quando o plasma é o protagonista. ${PLASMA_NOTE}`),
  pillar_circle_orange: frame(['ring', 'thin', 'orange'],
    `Par de anéis FINOS âmbar. Portal mínimo. ${PLASMA_NOTE}`),

  // ---------------- base: pedestal de cada portal ----------------
  ...Object.fromEntries(
    [
      ['stoneplatform_green', 'verde', 'MUNDO 1 (Ilhas)'],
      ['stoneplatform_sunburnt', 'âmbar/queimado', 'MUNDO 2 (Chocolate)'],
      ['stoneplatform_celestial', 'violeta/estelar', 'MUNDO 3 (Espaço)'],
      ['stoneplatform_blue', 'azul', 'MUNDO 4 (Aquapark)'],
    ].map(([name, cor, uso]) => [name, {
      role: 'platform',
      tags: ['platform', 'stone', 'runes', cor.split('/')[0], 'L'],
      gameplayRole: ['safe-zone', 'landmark'],
      solid: true,
      standalone: true,
      note: `Plataforma octogonal de pedra com runas emissivas ${cor} no centro (5,5 m de diâmetro, 42 cm de altura). Pedestal do portal do ${uso}; também serve de piso de ilha isolada.`,
      altUse: ['pedestal', 'arena-floor', 'checkpoint'],
    }]),
  ),

  // ---------------- marcas de chão ----------------
  pool_blue: floorMark(['vortex', 'water', 'blue'],
    'Vórtice espiralado azul-água, plano horizontal. Poça de teleporte no piso — leitura de "água" combina com o Aquapark.'),
  pool_celestial: floorMark(['vortex', 'magic', 'violet'],
    'Vórtice espiralado violeta com pontos de estrela. Poça de teleporte mágica.'),
  pool_green: floorMark(['vortex', 'magic', 'green'],
    'Vórtice espiralado verde. REMONTADO da mesh-base: o prefab do pack veio vazio (0 objetos), então este foi reconstruído com a textura T_Pool_Green e a mesma escala dos irmãos.'),
  circle_space: floorMark(['mandala', 'magic', 'star'],
    'Mandala de invocação com estrela de 8 pontas e anel de glifos. Círculo de teleporte no piso.'),
  circle_time: floorMark(['mandala', 'magic', 'clock'],
    'Mandala com ampulheta e algarismos romanos — tema "tempo". Círculo de teleporte no piso.'),
  ...Object.fromEntries(
    ['blue', 'green', 'purple', 'red'].map((cor) => [`futuristic_circle_${cor}`, floorMark(
      ['ring', 'futuristic', cor],
      `Par de anéis futuristas ${cor} deitados na HORIZONTAL (3,5 m no eixo de profundidade, 0,86 m de altura) — é portal de CHÃO, não de parede. Foi autorado assim no pack; para usar em pé, rotacione 90° em X.`,
    )]),
  ),
  rune_magic: floorMark(['rune', 'magic', 'star'],
    'Runa circular com pentagrama, monocromática. Aceita tingimento por cor de material.'),
  rune_swirl: floorMark(['rune', 'magic', 'spiral'],
    'Runa em espiral simples, monocromática. Aceita tingimento por cor de material.'),

  // ---------------- efeitos (planos, encarar a câmera) ----------------
  glare_white: effect(['glow', 'radial', 'white'], 'Clarão radial branco. Plano — trate como billboard.'),
  glare_rainbow: effect(['glow', 'radial', 'rainbow'], 'Clarão radial iridescente. Plano — billboard.'),
  glare_rainbowv2: effect(['glow', 'radial', 'rainbow'], 'Clarão radial iridescente, variante mais densa. Plano — billboard.'),
  glare_rising_white: effect(['glow', 'rising', 'white'], 'Raios verticais subindo (energia). Plano — billboard.'),
  glare_rising_blue: effect(['glow', 'rising', 'blue'], 'Raios verticais azuis subindo. Plano — billboard.'),
  glare_rising_purple: effect(['glow', 'rising', 'violet'], 'Raios verticais violeta subindo. Plano — billboard.'),

  // ---------------- ambiente ----------------
  mist_mesh: {
    role: 'decoration',
    tags: ['mist', 'fog', 'nature', 'M'],
    gameplayRole: [],
    solid: false,
    standalone: true,
    note: 'Volume de névoa em malha (5 m de largura). Assenta a base do portal e esconde a emenda com o piso.',
    altUse: ['ground-fog', 'cloud'],
  },
  grass_plane: {
    role: 'decoration',
    tags: ['grass', 'nature', 'S'],
    gameplayRole: [],
    solid: false,
    standalone: false,
    note: 'Tufo de grama estilizada em planos cruzados (60 cm). Espalhe para vestir o piso.',
    altUse: ['scatter'],
  },
  bellflower: {
    role: 'decoration',
    tags: ['flower', 'nature', 'S'],
    gameplayRole: [],
    solid: false,
    standalone: true,
    note: 'Campânula (45 cm) — flor de haste. Detalhe de canteiro junto ao portal.',
    altUse: ['scatter'],
  },
};

writeFileSync(out, JSON.stringify(overrides, null, 2));
console.log(`${Object.keys(overrides).length} overrides -> ${out}`);
