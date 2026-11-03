// Refinador de asset 3D (ADR-0230 / SPEC-0231): transforma materiais de cor
// sólida num atlas de paleta e funde o que passa a ser fundível, preservando a
// aparência.
//
// Existe porque o custo de render do host é POR OBJETO (medido na SPEC-0227:
// 33,5 us por draw e 7,8 us por nó por frame), e modelo gerado sem
// direcionamento vem com um material por peça — o que impede o merge da engine
// e transforma cada peça numa draw.
//
// Uso: node scripts/refine-asset.mjs <arquivo.glb | pasta> [opções]
import { Logger, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, palette, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { trianglesOf } from './kit-tris.mjs';

/** Lado (px) de cada bloco na textura de paleta. Blocos com folga evitam que o
 * filtro bilinear puxe a cor do vizinho. */
const PALETTE_BLOCK_SIZE = 4;
/** Mínimo de materiais distintos para valer uma paleta. */
const PALETTE_MIN_BLOCKS = 2;
/** Textura branca 1x1 (PNG) usada para proteger material da paleta. */
const WHITE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

// Limites que disparam aviso (SPEC-0231). Vêm do custo por draw e por nó
// medido na SPEC-0227, não de gosto.
const MAX_MATERIALS = 4;
const MAX_PRIMITIVES_PER_MESH = 2;
const MAX_NODES = 24;

// Peso de cada atributo no erro do `--simplify` (SPEC-0670): UV (inclusive a de lightmap) e cor de vértice (AO ou
// degradê assado) pesam como posição, normal pela metade.
const UV_WEIGHT = 1;
const COLOR_WEIGHT = 1;
const NORMAL_WEIGHT = 0.5;
const SIMPLIFY_ATTRIBUTES = [
  ['TEXCOORD_0', UV_WEIGHT],
  ['TEXCOORD_1', UV_WEIGHT],
  ['COLOR_0', COLOR_WEIGHT],
  ['NORMAL', NORMAL_WEIGHT],
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Números que descrevem o peso de um asset para o render. */
function measure(document) {
  const root = document.getRoot();
  const meshes = root.listMeshes();
  let primitives = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      primitives++;
      triangles += trianglesOf(prim);
    }
  }
  return {
    nodes: root.listNodes().length,
    meshes: meshes.length,
    primitives,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    triangles,
  };
}

/** O que a ferramenta vê e reporta, mas não conserta sozinha (SPEC-0231). */
function collectWarnings(document, stats) {
  const root = document.getRoot();
  const warnings = [];
  if (stats.materials > MAX_MATERIALS) {
    warnings.push(`${stats.materials} materiais (acima de ${MAX_MATERIALS}): cada um vira uma draw que o merge não funde`);
  }
  if (stats.nodes > MAX_NODES) {
    warnings.push(`${stats.nodes} nós (acima de ${MAX_NODES}): a travessia e o culling custam por nó, todo frame`);
  }
  const gordas = root.listMeshes().filter((m) => m.listPrimitives().length > MAX_PRIMITIVES_PER_MESH);
  if (gordas.length > 0) {
    warnings.push(`${gordas.length} malha(s) com mais de ${MAX_PRIMITIVES_PER_MESH} primitivas: cada primitiva é uma malha depois do merge`);
  }
  const doubleSided = root.listMaterials().filter((m) => m.getDoubleSided());
  if (doubleSided.length > 0) {
    warnings.push(
      `${doubleSided.length} material(is) doubleSided: dobra o trabalho de fragmento. Desligue SÓ depois de conferir as normais — em peça com normal invertida vira buraco`,
    );
  }
  return warnings;
}

/**
 * Impede que os materiais nomeados entrem na paleta, dando a cada um uma
 * textura branca de 1x1 — `palette()` só recolhe material sem textura.
 *
 * Existe porque jogo pode achar material pelo NOME em runtime (o `rig.json` do
 * kart-racer aponta `paintMaterial`), e perder o nome quebraria a pintura do
 * carro só na garagem, em runtime.
 */
function protectMaterials(document, names) {
  if (names.length === 0) return [];
  const protegidos = [];
  const textura = document
    .createTexture('cortex-protecao')
    .setImage(new Uint8Array(WHITE_PIXEL_PNG))
    .setMimeType('image/png');
  for (const material of document.getRoot().listMaterials()) {
    if (!names.includes(material.getName()) || material.getBaseColorTexture()) continue;
    material.setBaseColorTexture(textura);
    protegidos.push(material);
  }
  if (protegidos.length === 0) textura.dispose();
  return protegidos;
}

/** Tira a textura de proteção; o material volta a ser cor sólida pura. */
function unprotectMaterials(protegidos) {
  for (const material of protegidos) {
    const textura = material.getBaseColorTexture();
    material.setBaseColorTexture(null);
    if (textura && textura.getName() === 'cortex-protecao') textura.dispose();
  }
}

/**
 * Trava (1) todo vértice que divide a posição com outro: depois do `weld()`, só sobram assim os de costura, onde a UV
 * ou a normal muda de um lado para o outro. O(n) por primitiva.
 */
function seamLock(positions, stride) {
  const vertexCount = positions.length / stride;
  const lock = new Uint8Array(vertexCount);
  const first = new Map();
  for (let i = 0; i < vertexCount; i++) {
    const key = `${positions[i * stride]},${positions[i * stride + 1]},${positions[i * stride + 2]}`;
    const j = first.get(key);
    if (j === undefined) first.set(key, i);
    else lock[i] = lock[j] = 1;
  }
  return lock;
}

/**
 * Simplificador para o `simplifyPrimitive` que soma UV e normal da primitiva ao erro (SPEC-0670).
 *
 * O `simplify()` do gltf-transform só passa a posição: numa peça plana o erro de qualquer colapso é zero, e onde a UV
 * não é linear (as ruas do `city_kit`) a textura estica. O `simplifyPrimitive` chama `simplify` depois de compactar a
 * primitiva, então os atributos lidos aqui casam com as posições recebidas. Os vértices de costura ficam travados
 * (`seamLock`): mesmo com a UV no erro, o meshoptimizer 0.22 colapsa ao longo da costura e a UV erra até 1,1 no kit.
 */
function attributeAwareSimplifier(prim) {
  return {
    simplify(indices, positions, stride, target, error, flags) {
      const attributes = SIMPLIFY_ATTRIBUTES.map(([name, weight]) => [prim.getAttribute(name), weight]).filter(([a]) => a);
      if (attributes.length === 0) return MeshoptSimplifier.simplify(indices, positions, stride, target, error, flags);
      const vertexCount = positions.length / stride;
      const weights = attributes.flatMap(([a, weight]) => Array(a.getElementSize()).fill(weight));
      const data = new Float32Array(vertexCount * weights.length);
      let offset = 0;
      for (const [accessor] of attributes) {
        const size = accessor.getElementSize();
        const element = new Array(size);
        for (let i = 0; i < vertexCount; i++) {
          accessor.getElement(i, element);
          for (let c = 0; c < size; c++) data[i * weights.length + offset + c] = element[c];
        }
        offset += size;
      }
      return MeshoptSimplifier.simplifyWithAttributes(
        indices, positions, stride, data, weights.length, weights, seamLock(positions, stride), target, error, flags,
      );
    },
  };
}

/** Aplica o refino. Devolve o relatório. */
export async function refineDocument(document, { keep = [], keepHierarchy = false, simplifyError = 0 } = {}) {
  // O logger da biblioteca escreve no stdout e quebraria o `--json`, que é
  // justamente a saída que o Chat IA vai ler.
  document.setLogger(new Logger(Logger.Verbosity.SILENT));
  const antes = measure(document);
  const avisos = collectWarnings(document, antes);
  // SPEC-0670: modo só-geometria para kits — nomes, materiais e hierarquia ficam; a paleta e o join não rodam.
  if (simplifyError > 0) {
    await MeshoptSimplifier.ready;
    // `simplifyWithAttributes` fica atrás desta chave no 0.22.0 (versão pinada).
    MeshoptSimplifier.useExperimentalFeatures = true;
    await document.transform(weld());
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
        // O erro não vê peso de osso nem delta de morph: o defeito só apareceria animando.
        if (prim.getAttribute('JOINTS_0') || prim.listTargets().length > 0) {
          avisos.push(`${mesh.getName()}: malha skinada ou com morph target, não simplificada`);
          continue;
        }
        const simplifier = attributeAwareSimplifier(prim);
        simplifyPrimitive(prim, { simplifier, ratio: 0, error: simplifyError, lockBorder: true });
      }
    }
    await document.transform(prune({ keepLeaves: true, keepAttributes: true }));
    return { antes, depois: measure(document), avisos, protegidos: [] };
  }
  const protegidos = protectMaterials(document, keep);

  // `join()` funde malhas e come nós pelo caminho. Num asset cujos nós são
  // PIVÔS procurados por nome em runtime — o `createCar` do kart-racer faz
  // `getObjectByName('FL')` e lança erro se faltar —, isso quebra o jogo na
  // largada. Com `keepHierarchy`, só a paleta roda: o merge que a engine já faz
  // em runtime (preservando os pivôs) aproveita os materiais unificados e funde
  // do mesmo jeito.
  //
  // `keepLeaves` no prune, pelo mesmo motivo: sem ele o passo varre nós VAZIOS,
  // e pivô costuma ser exatamente isso — um nó sem malha, que existe só para
  // marcar posição (o ponto de escapamento dos carros, por exemplo).
  const passos = keepHierarchy
    ? [
        dedup(),
        palette({ blockSize: PALETTE_BLOCK_SIZE, min: PALETTE_MIN_BLOCKS }),
        prune({ keepLeaves: true }),
      ]
    : [dedup(), palette({ blockSize: PALETTE_BLOCK_SIZE, min: PALETTE_MIN_BLOCKS }), join(), prune()];
  await document.transform(...passos);

  unprotectMaterials(protegidos);

  // A proteção depende de o material ter UV para carregar a textura branca.
  // Sem `TEXCOORD_0` a paleta o engole assim mesmo — e o jogo só descobriria
  // em runtime, quando a pintura do carro não pegasse. Falha alto em vez de
  // escrever um asset quebrado.
  const nomesFinais = document.getRoot().listMaterials().map((m) => m.getName());
  const perdidos = keep.filter((nome) => !nomesFinais.includes(nome));
  if (perdidos.length > 0) {
    throw new Error(
      `material protegido não sobreviveu ao refino: ${perdidos.join(', ')}. ` +
        'Provavelmente a malha não tem UV (TEXCOORD_0), e sem isso não dá para mantê-lo fora da paleta.',
    );
  }

  const depois = measure(document);
  return { antes, depois, avisos, protegidos: protegidos.map((m) => m.getName()) };
}

/** Uma linha legível do tipo `materiais 6 -> 1`. */
function linhaDiff(rotulo, antes, depois) {
  const seta = antes === depois ? '=' : '->';
  const ganho = antes > 0 && depois < antes ? ` (-${Math.round(((antes - depois) / antes) * 100)}%)` : '';
  return `  ${rotulo.padEnd(12)} ${String(antes).padStart(6)} ${seta} ${String(depois).padStart(6)}${ganho}`;
}

/**
 * Valor do `--simplify` (SPEC-0670): `0` sem a flag; com a flag, um número finito e positivo ou `NaN`.
 * `NaN` faz o `main` recusar antes de tocar no arquivo: cair no caminho da paleta/join sobrescreveria um kit
 * sem os nomes que o jogo procura (ex.: `--simplify --in-place`).
 */
export function parseSimplifyError(args) {
  const i = args.indexOf('--simplify');
  if (i < 0) return 0;
  const valor = Number(args[i + 1]);
  return Number.isFinite(valor) && valor > 0 ? valor : Number.NaN;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const valor = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    alvo: args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--keep' && args[args.indexOf(a) - 1] !== '--simplify'),
    out: valor('--out'),
    keep: (valor('--keep') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    inPlace: args.includes('--in-place'),
    keepHierarchy: args.includes('--keep-hierarchy'),
    simplifyError: parseSimplifyError(args),
    check: args.includes('--check'),
    json: args.includes('--json'),
  };
}

/** Todos os .glb de um caminho (arquivo ou pasta, recursivo). */
function listarGlbs(alvo) {
  if (fs.statSync(alvo).isFile()) return [alvo];
  const saida = [];
  const andar = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const full = path.join(dir, nome);
      if (fs.statSync(full).isDirectory()) andar(full);
      else if (full.toLowerCase().endsWith('.glb')) saida.push(full);
    }
  };
  andar(alvo);
  return saida;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.alvo || !fs.existsSync(opts.alvo)) {
    console.error('uso: node scripts/refine-asset.mjs <arquivo.glb | pasta> [--out <dir>] [--in-place] [--keep Mat1,Mat2] [--keep-hierarchy] [--simplify <erro, ex. 0.005>] [--check] [--json]');
    process.exit(1);
  }
  if (Number.isNaN(opts.simplifyError)) {
    console.error('--simplify precisa de um erro positivo (ex.: --simplify 0.005); nada foi alterado');
    process.exit(1);
  }

  const arquivos = listarGlbs(path.resolve(opts.alvo));
  const relatorios = [];

  for (const arquivo of arquivos) {
    const document = await io.read(arquivo);
    const relatorio = await refineDocument(document, { keep: opts.keep, keepHierarchy: opts.keepHierarchy, simplifyError: opts.simplifyError });
    relatorio.arquivo = arquivo;

    if (!opts.check) {
      const destino = opts.inPlace
        ? arquivo
        : opts.out
          ? path.join(path.resolve(opts.out), path.basename(arquivo))
          : arquivo.replace(/\.glb$/i, '.refined.glb');
      // Asset do usuário não se perde por conta de script: só `--in-place`
      // autoriza escrever por cima (um `--out` para a pasta de origem cairia
      // exatamente nisso sem querer).
      if (!opts.inPlace && path.resolve(destino) === path.resolve(arquivo)) {
        console.error(`[refine] recusado: ${destino} é o próprio arquivo de entrada. Use --in-place se é isso que você quer.`);
        process.exit(1);
      }
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      await io.write(destino, document);
      relatorio.destino = destino;
    }
    relatorios.push(relatorio);

    if (!opts.json) {
      console.log(`\n[refine] ${path.relative(process.cwd(), arquivo)}`);
      console.log(linhaDiff('materiais', relatorio.antes.materials, relatorio.depois.materials));
      console.log(linhaDiff('primitivas', relatorio.antes.primitives, relatorio.depois.primitives));
      console.log(linhaDiff('malhas', relatorio.antes.meshes, relatorio.depois.meshes));
      console.log(linhaDiff('nós', relatorio.antes.nodes, relatorio.depois.nodes));
      console.log(linhaDiff('texturas', relatorio.antes.textures, relatorio.depois.textures));
      console.log(linhaDiff('triângulos', relatorio.antes.triangles, relatorio.depois.triangles));
      if (relatorio.protegidos.length > 0) console.log(`  protegidos: ${relatorio.protegidos.join(', ')}`);
      for (const aviso of relatorio.avisos) console.log(`  aviso: ${aviso}`);
      if (relatorio.destino) console.log(`  -> ${path.relative(process.cwd(), relatorio.destino)}`);
    }
  }

  if (opts.json) console.log(JSON.stringify(relatorios, null, 2));
}

// Só roda como CLI; importado (pelo Chat IA, por teste) exporta `refineDocument`.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((erro) => {
    console.error('[refine] falhou:', erro.message);
    process.exit(1);
  });
}
