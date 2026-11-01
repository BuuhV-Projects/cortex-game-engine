#!/usr/bin/env node
// Contrato do export nativo (SPEC-0643 da engine; nasceu na SPEC-0033 do Port Hollow): checagem ESTÁTICA, sem rodar o host, do
// que o jogo precisa ter configurado para o nativo andar bem (ERRO) e do que ele usa e o nativo ainda não tem (DÉBITO
// técnico: o objeto cai no three em JS, ou a sombra volta para o three, e o quadro fica caro).
//
// Uso:  node .claude/hooks/native-contract.mjs [pasta do jogo]      relatório completo; sai 1 se houver ERRO
//       node .claude/hooks/native-contract.mjs --hook               hook Stop/SubagentStop do Claude Code (lê o JSON do stdin)
// Em ambos os modos regrava `docs/debito-nativo.md` (lista de débito do jogo).
//
// As regras espelham a engine (renderer próprio, ADR-0605; sombra do sol em C++, SPEC-0289). Quando a engine ganhar
// uma feature, apague a regra aqui (no template `templates/new-project/.claude/hooks/` da engine e nos jogos).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep, dirname } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', '.claude', 'dist', 'dist-native', '.cortex', 'tests', 'public']);
const GLB_MAGIC = 0x46546c67;
const GLB_HEADER = 12;
const CHUNK_HEAD = 8;
const DEBT_FILE = join('docs', 'debito-nativo.md');

// ── Regras de asset (materiais do glTF) ─────────────────────────────────────
/**
 * Extensões que fazem o GLTFLoader criar MeshPhysicalMaterial, que o modelo `standard` nativo recusa (`feature:specularIor`)
 * mesmo com valor neutro — o exportador do Blender põe `KHR_materials_specular` por padrão. O `matte` do `buildScene`
 * troca por material fosco; peça carregada pelo código do jogo continua física.
 */
const PHYSICAL_EXTENSIONS = ['KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_clearcoat', 'KHR_materials_transmission',
  'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_volume', 'KHR_materials_anisotropy'];
/** Texturas do PBR que o modelo nativo ainda não lê (`feature:normalMap`, `feature:metalRoughMap`). */
const UNSUPPORTED_TEXTURES = { normalTexture: 'normal map', metallicRoughnessTexture: 'mapa de metal/rugosidade' };
/** Sombra do sol em C++ recusa caster com recorte alfa (`recorte-alfa`) até a SPEC-0642 da engine entrar: vire `true`. */
const SHADOW_ALPHA_CLIP = false;

/** Campos do `outdoorLighting` que geram environment não uniforme (a engine só adapta o uniforme, SPEC-0645). */
const NON_UNIFORM_SKY = ['hdri', 'skyTop', 'skyMiddle', 'skyBottom', 'skyboxLighting'];

// ── Regras de código ─────────────────────────────────────────────────────────
const CODE_RULES = [
  { re: /new\s+AmbientLight\s*\(/, debt: 'AmbientLight: o bloco de luz nativo só tem sol + hemisfério + spots; o renderer próprio recusa a cena inteira' },
  { re: /new\s+(PointLight|RectAreaLight)\s*\(/, debt: 'luz pontual/área: o bloco de luz nativo só tem sol + hemisfério + spots' },
  { re: /\.environment\s*=(?!=)/, debt: 'scene.environment: o renderer próprio recusa o objeto (`lights:environment`)' },
  { re: /\.toneMapping\s*=(?!=)/, debt: 'toneMapping no renderer do three: o renderer próprio recusa tudo (ACES vai no composite, PostFX nativo)' },
  { re: /new\s+MeshPhysicalMaterial\s*\(/, debt: 'MeshPhysicalMaterial: o renderer próprio recusa' },
  { re: /\b(colorNode|positionNode|normalNode|emissiveNode)\s*=/, debt: 'nó TSL no material sem `userData.nativeMaterial` (WGSL do jogo): o renderer próprio recusa', unless: /nativeMaterial/ },
];

/**
 * Loader do three direto no jogo: cada chamada relê e redecodifica o arquivo e o objeto guarda a sua cópia (RGBA na
 * memória externa do Hermes, teto de 2 GB no host). Foi o OOM do Port Hollow: 176 terrenos × 4 camadas = 704 cópias
 * das mesmas texturas (SPEC-0652 da engine). `loadTexture`/`loadGLB` da engine têm cache por URL.
 */
const DIRECT_LOADER = /new\s+(TextureLoader|ImageLoader|ImageBitmapLoader|GLTFLoader|KTX2Loader)\s*\(/;

function walk(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), ext, out); }
    else if (ext.some((x) => e.name.endsWith(x))) out.push(join(dir, e.name));
  }
  return out;
}

/** JSON de um .glb lendo só o cabeçalho e o 1º chunk (sem carregar o binário). */
function glbJson(file) {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(GLB_HEADER + CHUNK_HEAD);
    if (readSync(fd, head, 0, head.length, 0) < head.length || head.readUInt32LE(0) !== GLB_MAGIC) return null;
    const len = head.readUInt32LE(GLB_HEADER);
    const json = Buffer.alloc(len);
    readSync(fd, json, 0, len, GLB_HEADER + CHUNK_HEAD);
    return JSON.parse(json.toString('utf8'));
  } catch { return null; } finally { closeSync(fd); }
}

function checkAssets(root, debt) {
  for (const file of walk(root, ['.glb'])) {
    const gltf = glbJson(file);
    if (!gltf) continue;
    const rel = relative(root, file).split(sep).join('/');
    const found = new Set();
    for (const m of gltf.materials ?? []) {
      for (const ext of Object.keys(m.extensions ?? {})) if (PHYSICAL_EXTENSIONS.includes(ext)) found.add(`material físico (${ext}): recusado pelo renderer próprio se não passar pelo \`matte\` do buildScene`);
      for (const [k, label] of Object.entries(UNSUPPORTED_TEXTURES)) if (m[k] ?? m.pbrMetallicRoughness?.[k]) found.add(label);
      if (!SHADOW_ALPHA_CLIP && m.alphaMode === 'MASK') found.add('recorte alfa (MASK): a sombra em C++ volta para o three se ele projetar sombra');
    }
    // vegetação vira InstancedMesh por sub-malha: cada malha/material a mais é um draw a mais por espécie
    const meshes = gltf.meshes?.reduce((n, m) => n + (m.primitives?.length ?? 1), 0) ?? 0;
    if (rel.includes('vegetation/') && meshes > 2) found.add(`${meshes} malhas na vegetação = ${meshes} draws por espécie (junte numa malha/atlas)`);
    for (const f of found) debt.push({ where: rel, what: f });
  }
}

function checkCode(root, errors, debt) {
  for (const file of walk(root, ['.ts', '.tsx', '.js', '.mjs'])) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(root, file).split(sep).join('/');
    for (const r of CODE_RULES) if (r.re.test(text) && !(r.unless && r.unless.test(text))) debt.push({ where: rel, what: r.debt });
    const loader = text.match(DIRECT_LOADER);
    if (loader) errors.push({ where: rel, what: `\`new ${loader[1]}()\` fora do cache: cada objeto relê e redecodifica o arquivo e o export estoura a memória (SPEC-0652 da engine) — use \`loadTexture\`/\`loadGLB\` da engine (cache por URL) ou guarde o resultado num Map por URL` });
  }
}

function checkConfig(root, errors, debt) {
  const main = join(root, 'main.ts');
  if (existsSync(main)) {
    const text = readFileSync(main, 'utf8');
    if (/new\s+Game\s*\(/.test(text) && !/nativeRenderer\s*:\s*true/.test(text)) {
      errors.push({ where: 'main.ts', what: '`new Game({ ..., nativeRenderer: true })` ausente: no export o jogo inteiro é desenhado pelo three em JS (ADR-0605)' });
    }
  }
  const scenes = existsSync(join(root, 'scenes')) ? walk(join(root, 'scenes'), ['.json']) : [];
  for (const file of scenes) {
    let scene;
    try { scene = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const o = scene?.outdoorLighting;
    if (!o) continue;
    const rel = relative(root, file).split(sep).join('/');
    if (o.csm !== true) errors.push({ where: rel, what: '`outdoorLighting.csm: true` ausente: sem CSM a sombra do sol é refeita pelo three em JS todo quadro (só o CSM tem o passe em C++, SPEC-0289)' });
    // a engine adapta ACES + ambient + environment UNIFORME no host (SPEC-0645); céu não uniforme continua environment
    const sky = NON_UNIFORM_SKY.filter((k) => o[k]);
    if (o.environment !== false && (sky.length || o.sky === undefined)) {
      debt.push({ where: rel, what: `outdoorLighting com céu não uniforme (${sky.join(', ') || 'sem sky'}): o environment fica e o renderer próprio recusa a cena (lights:environment)` });
    }
  }
}

function report(root) {
  const errors = [];
  const debt = [];
  checkConfig(root, errors, debt);
  checkAssets(root, debt);
  checkCode(root, errors, debt);
  return { errors, debt };
}

function debtMarkdown(debt) {
  const by = new Map();
  for (const d of debt) by.set(d.what, [...(by.get(d.what) ?? []), d.where]);
  let md = '# Débito técnico do export nativo\n\nGerado por `.claude/hooks/native-contract.mjs` (não edite à mão). Cada item é algo que o jogo usa e o\nnativo ainda não tem: o objeto cai no three em JS (ou a sombra volta para o three) e o quadro fica caro.\n';
  for (const [what, where] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `\n## ${what}\n\n${[...new Set(where)].sort().map((w) => `- \`${w}\``).join('\n')}\n`;
  }
  if (by.size === 0) md += '\nNenhum.\n';
  return md;
}

function writeDebt(root, debt) {
  const file = join(root, DEBT_FILE);
  const md = debtMarkdown(debt);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (md !== before) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, md); }
  return md !== before;
}

const lines = (list) => list.map((e) => `- ${e.where}: ${e.what}`).join('\n');

if (process.argv.includes('--hook')) {
  // Hook Stop/SubagentStop: roda ao FIM de cada implementação. Bloqueia (exit 2) com contrato quebrado ou débito novo;
  // na 2ª passada (`stop_hook_active`) só reescreve o relatório, para não prender o agente num laço.
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { /* sem stdin */ }
  let errors, fresh;
  try {
    const root = resolve(input.cwd ?? process.cwd());
    const file = join(root, DEBT_FILE);
    // pares "regra|arquivo" do relatório anterior: só o que não estava lá é débito novo
    const known = new Set();
    let heading = '';
    for (const l of (existsSync(file) ? readFileSync(file, 'utf8') : '').split('\n')) {
      if (l.startsWith('## ')) heading = l.slice(3);
      else if (l.startsWith('- `')) known.add(`${heading}|${l.slice(3, -1)}`);
    }
    const baseline = !existsSync(file); // 1ª execução (projeto novo): só grava a linha de base do débito
    const r = report(root);
    errors = r.errors;
    writeDebt(root, r.debt);
    fresh = baseline ? [] : r.debt.filter((d) => !known.has(`${d.what}|${d.where}`));
  } catch (e) {
    process.stderr.write(`native-contract: falha interna, ignorada (${e?.message ?? e})\n`);
    process.exit(0);
  }
  if (input.stop_hook_active || (errors.length === 0 && fresh.length === 0)) process.exit(0);
  let msg = '';
  if (errors.length) msg += `Contrato do export nativo QUEBRADO — corrija antes de terminar:\n${lines(errors)}\n`;
  if (fresh.length) msg += `Débito NOVO do export nativo (o nativo ainda não tem; cai no three em JS) — registre no backlog do PRD do jogo ou troque o asset/código:\n${lines(fresh)}\n`;
  process.stderr.write(msg);
  process.exit(2);
}

const root = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.cwd());
const { errors, debt } = report(root);
writeDebt(root, debt);
console.log(`Contrato do export nativo — ${root}\n`);
console.log(errors.length ? `ERROS (${errors.length}):\n${lines(errors)}\n` : 'ERROS: nenhum\n');
const groups = new Map();
for (const d of debt) groups.set(d.what, (groups.get(d.what) ?? 0) + 1);
console.log(`DÉBITO (${debt.length} ocorrências, lista por arquivo em ${DEBT_FILE}):`);
for (const [what, n] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`- ${n}× ${what}`);
process.exit(errors.length ? 1 : 0);
