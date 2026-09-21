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
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, palette, prune } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

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
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() : (position?.getCount() ?? 0);
      triangles += Math.floor(count / 3);
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

/** Aplica o refino. Devolve o relatório. */
export async function refineDocument(document, { keep = [], keepHierarchy = false } = {}) {
  // O logger da biblioteca escreve no stdout e quebraria o `--json`, que é
  // justamente a saída que o Chat IA vai ler.
  document.setLogger(new Logger(Logger.Verbosity.SILENT));
  const antes = measure(document);
  const avisos = collectWarnings(document, antes);
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

function parseArgs(argv) {
  const args = argv.slice(2);
  const valor = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    alvo: args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--keep'),
    out: valor('--out'),
    keep: (valor('--keep') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    inPlace: args.includes('--in-place'),
    keepHierarchy: args.includes('--keep-hierarchy'),
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
    console.error('uso: node scripts/refine-asset.mjs <arquivo.glb | pasta> [--out <dir>] [--in-place] [--keep Mat1,Mat2] [--keep-hierarchy] [--check] [--json]');
    process.exit(1);
  }

  const arquivos = listarGlbs(path.resolve(opts.alvo));
  const relatorios = [];

  for (const arquivo of arquivos) {
    const document = await io.read(arquivo);
    const relatorio = await refineDocument(document, { keep: opts.keep, keepHierarchy: opts.keepHierarchy });
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
