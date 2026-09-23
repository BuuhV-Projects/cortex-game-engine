/**
 * Contrato do `three` para o caminho de render nativo (SPEC-0246).
 *
 * O passe de sombra nativo (SPEC-0245) e o espelho de cena (SPEC-0234)
 * substituem partes do `three` POR DENTRO, e para isso dependem de premissas
 * sobre o comportamento interno dele. Nenhuma é API pública; nenhuma é
 * garantida pelo semver do `three`.
 *
 * O problema é o modo de falha: quando uma premissa deixa de valer, o sintoma
 * é ARTEFATO VISUAL, não exceção — e artefato visual passa despercebido (as
 * bandas da SPEC-0234 passaram por uma captura antes de serem notadas).
 *
 * Por isso este arquivo verifica as premissas POR COMPORTAMENTO: monta o
 * mínimo, executa o código do `three` e observa o que ele fez. E por isso a
 * MENSAGEM de cada falha é o produto aqui, não o `expect` — ela diz qual
 * premissa caiu, o que ela protege e onde está o código nativo que depende
 * dela.
 *
 * A trava de versão no fim fecha o mecanismo: subir o `three` quebra a suíte
 * até alguém percorrer a lista.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
import {
  BackSide,
  DoubleSide,
  DirectionalLight,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PCFShadowMap,
  PCFSoftShadowMap,
  RenderTarget,
  ShadowNode,
  SphereGeometry,
  VSMShadowMap,
  WebGPURenderer,
} from 'three/webgpu';
import { getShadowRenderObjectFunction, lightShadowMatrix } from 'three/tsl';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';

/**
 * Versão do `three` validada contra TODAS as premissas abaixo.
 *
 * Mora aqui, e não num arquivo de dados solto, de propósito (SPEC-0246): quem
 * mexe na trava tem as dez premissas na mesma tela, e o diff do commit que
 * sobe o `three` mostra o revisor se a lista foi revisitada ou se só o número
 * andou.
 */
const VERSAO_DO_THREE_VALIDADA = '0.184.0';

// --------------------------------------------------------------------------
// Registro das premissas — fonte única das mensagens de falha
// --------------------------------------------------------------------------

interface Premissa {
  /** O que o `three` faz hoje. */
  readonly enunciado: string;
  /** O que quebra, e COMO se manifesta, se deixar de valer. */
  readonly protege: string;
  /** Onde está o código nativo que depende dela. */
  readonly dependente: string;
}

const PREMISSAS: Readonly<Record<number, Premissa>> = {
  1: {
    enunciado: "shadow.map.depthTexture existe e tem name === 'ShadowDepthTexture'",
    protege:
      'É a ASSERÇÃO do alvo do passe nativo. O alvo vem por identidade ' +
      '(backend.get(...)) e o rótulo confere que é o objeto certo. Sem ela, o ' +
      'passe pode escrever numa textura que não é o shadow map — corrompe ' +
      'outra coisa, sem erro.',
    dependente: 'src/scene/OutdoorLighting.ts (ROTULO_DA_TEXTURA_DE_SOMBRA)',
  },
  2: {
    enunciado: 'o gate `shadow.needsUpdate || shadow.autoUpdate` controla se o three renderiza a sombra',
    protege:
      'É COMO o nativo desliga o passe do three. Se o three decidir por outro ' +
      'caminho, ou os dois passes escrevem no mesmo alvo no mesmo frame (custo ' +
      'dobrado, imagem dependendo de quem escreveu por último), ou nenhum ' +
      'desenha e a sombra some.',
    dependente: 'src/scene/OutdoorLighting.ts (_desenharPasseDeSombraNativo, cascata.shadow.autoUpdate)',
  },
  3: {
    enunciado: 'LightShadow.copy copia `autoUpdate` NO MOMENTO do clone',
    protege:
      'O CSM clona a shadow da luz POR CASCATA (light.shadow.clone() no _init): ' +
      'mexer no original depois não chega nas cópias. Se o clone virar ' +
      'referência compartilhada, ou parar de copiar o campo, desligar o passe ' +
      'por cascata deixa de funcionar.',
    dependente: 'src/scene/OutdoorLighting.ts (laço `for (const cascata of cascatas)`)',
  },
  4: {
    enunciado:
      'o three desenha a sombra com o lado da face INVERTIDO, pela tabela ' +
      'INTEIRA (material.shadowSide ?? _shadowSide[material.side]: ' +
      'FrontSide -> BackSide, BackSide -> FrontSide, DoubleSide -> DoubleSide)',
    protege:
      'É o que decide o cullMode de CADA caster no passe nativo. Se o three ' +
      'parar de inverter, o nativo corta a face errada: a profundidade sai da ' +
      'face de trás e aparece ACNE e PETER-PANNING — artefato puro, sem erro. ' +
      'E se DoubleSide passar a ser cortado, a folhagem perde a auto-sombra ' +
      'que o three desenha sem culling nenhum.',
    dependente:
      'native/src/render/shadow_math.h (shadowCullMode) e ' +
      'src/core/NativeSceneMirror.ts (LADO_DA_SOMBRA / LADO_AUTORADO)',
  },
  5: {
    enunciado:
      'castShadow é filtrado DEPOIS da RenderList (getShadowRenderObjectFunction), não em _projectObject',
    protege:
      'É a base da conta do M6: a maioria dos itens é percorrida, enfileirada e ' +
      'descartada depois, e é essa travessia que o passe nativo substitui. Se o ' +
      'three passar a podar em _projectObject, o ganho do marco evapora e o ' +
      'enumerador do C++ diverge da lista do three.',
    dependente: 'src/core/NativeSceneMirror.ts (enumeração de casters, drawShadowPass)',
  },
  6: {
    enunciado: 'CSMShadowNode só popula `this.lights` no _init, que roda no primeiro setup',
    protege:
      'Aplicar qualquer coisa nas cascatas antes disso congela ZERO cascatas em ' +
      'SILÊNCIO — foi o que aconteceu ao tentar congelar o passe na criação do ' +
      'nó. Por isso o código vive em updateBefore, não no construtor.',
    dependente: 'src/scene/OutdoorLighting.ts (CameraFollowingCSM.updateBefore)',
  },
  7: {
    enunciado:
      'lightShadowMatrix só chama updateMatrices sozinho quando castShadow !== true ou shadowMap.enabled === false',
    protege:
      'Com o passe do three desligado, ninguém mais chama shadow.updateMatrices ' +
      '— e o uniforme que AMOSTRA o mapa congela, prendendo a sombra ao mundo de ' +
      'um frame antigo. Por isso o preparo nativo TEM de chamar updateMatrices ' +
      'por cascata.',
    dependente: 'src/scene/OutdoorLighting.ts (cascata.shadow.updateMatrices(cascata))',
  },
  8: {
    enunciado:
      'childadded/childremoved são disparados em add/remove, e attach/clear/copy/removeFromParent desembocam neles',
    protege:
      'É COMO o espelho acompanha a cena. Um caminho de mutação que não dispare ' +
      'o evento deixa o espelho defasado: o gate recusa por divergência (melhor ' +
      'caso) ou aceita e o passe nativo desenha uma cena que não existe mais.',
    dependente: "src/core/NativeSceneMirror.ts (addEventListener('childadded'/'childremoved'))",
  },
  9: {
    enunciado: '_projectObject poda a subárvore em `visible === false`',
    protege:
      'O espelho replica essa poda. Se o three parar de podar, ou podar em outro ' +
      'ponto, o nativo e o three passam a desenhar conjuntos diferentes de ' +
      'casters — sombra a mais ou a menos, sem erro.',
    dependente: 'src/core/NativeSceneMirror.ts (flag SYNC_VISIBLE e poda da travessia)',
  },
  10: {
    enunciado: 'PCFSoftShadowMap NÃO entra no ramo VSM',
    protege:
      'O passe nativo é depth-only e só vale fora do VSM: no VSM o three não ' +
      'inverte o lado da face e passa a desenhar também os receiveShadow. Se ' +
      'PCFSoftShadowMap caísse no ramo VSM, o gate aceitaria um caso que o ' +
      'passe nativo desenha errado.',
    dependente: 'src/scene/OutdoorLighting.ts (vsmShadowMap no gate) e native/src/render/shadow_pass.cpp',
  },
};

/**
 * Monta a mensagem de falha de uma premissa.
 *
 * É o produto deste arquivo: quem tropeçar nela seis meses depois precisa
 * saber, sem abrir mais nada, o que caiu, o que isso protegia e onde mexer.
 */
function premissa(numero: number, detalhe?: string): string {
  const p = PREMISSAS[numero]!;
  return [
    '',
    `PREMISSA ${numero} DO THREE CAIU (SPEC-0246)`,
    `  o que valia: ${p.enunciado}`,
    detalhe ? `  o que se observou: ${detalhe}` : '',
    `  o que ela protege: ${p.protege}`,
    `  código nativo que depende dela: ${p.dependente}`,
    `  trava validada em three@${VERSAO_DO_THREE_VALIDADA}`,
    '  o que fazer: confira a premissa contra o novo three, ajuste o código',
    '  nativo se preciso e registre a rodada em docs/specs/SPEC-0246-contrato-do-three.md',
    '',
  ]
    .filter((linha) => linha !== '')
    .join('\n');
}

// --------------------------------------------------------------------------
// Constantes do arranjo (sem números mágicos)
// --------------------------------------------------------------------------

/** Lado do shadow map de mentira; o valor não importa, só tem de ser > 0. */
const LADO_DO_SHADOW_MAP = 1;
/** `frameId` do frame de teste; qualquer inteiro serve, só precisa ser estável. */
const FRAME_ID = 1;
/** Versão de `depthTexture` que NÃO bate com `_depthVersionCached`. */
const VERSAO_DA_TEXTURA = 1;
const VERSAO_EM_CACHE = 0;
/** Ordem de grupo no `_projectObject`; irrelevante para o que se observa. */
const ORDEM_DE_GRUPO = 0;
/** Raio da esfera de teste. */
const RAIO_DA_ESFERA = 1;
/** Quantos diretórios subir procurando o `package.json` do `three`. */
const PROFUNDIDADE_MAXIMA_ATE_O_PACKAGE_JSON = 5;

const ROTULO_ESPERADO_DA_TEXTURA = 'ShadowDepthTexture';

// --------------------------------------------------------------------------
// Premissa 1 — o rótulo do alvo
// --------------------------------------------------------------------------

describe('premissa 1 — rótulo da textura de profundidade da sombra', () => {
  it('o three nomeia a depthTexture do shadow map como ShadowDepthTexture', () => {
    const shadow = {
      mapSize: { width: LADO_DO_SHADOW_MAP, height: LADO_DO_SHADOW_MAP },
      mapType: undefined,
    };
    const builder = {
      renderer: { reversedDepthBuffer: false },
      createRenderTarget: (largura: number, altura: number) => new RenderTarget(largura, altura),
    };

    const { shadowMap, depthTexture } = (
      ShadowNode.prototype as unknown as {
        setupRenderTarget(s: unknown, b: unknown): { shadowMap: RenderTarget; depthTexture: { name: string } };
      }
    ).setupRenderTarget(shadow, builder);

    expect(depthTexture.name, premissa(1, `name === '${depthTexture.name}'`)).toBe(
      ROTULO_ESPERADO_DA_TEXTURA,
    );
    expect(
      shadowMap.depthTexture,
      premissa(1, 'o render target do shadow map não aponta para a mesma depthTexture'),
    ).toBe(depthTexture);
  });
});

// --------------------------------------------------------------------------
// Premissa 2 — o gate needsUpdate || autoUpdate
// --------------------------------------------------------------------------

/**
 * Roda o `updateBefore` do `ShadowNode` com o mínimo, e devolve se ele
 * renderizou a sombra.
 */
function renderizouASombra(autoUpdate: boolean, needsUpdate: boolean): boolean {
  const updateShadow = vi.fn();
  const alvo = {
    shadow: { autoUpdate, needsUpdate },
    _cameraFrameId: {} as Record<string, number>,
    shadowMap: { depthTexture: { version: VERSAO_DA_TEXTURA } },
    _depthVersionCached: VERSAO_EM_CACHE,
    updateShadow,
  };
  (ShadowNode.prototype as unknown as { updateBefore(f: unknown): void }).updateBefore.call(alvo, {
    camera: {},
    frameId: FRAME_ID,
  });
  return updateShadow.mock.calls.length > 0;
}

describe('premissa 2 — gate do passe de sombra do three', () => {
  it('não renderiza com autoUpdate e needsUpdate falsos (é como o nativo desliga o three)', () => {
    expect(
      renderizouASombra(false, false),
      premissa(2, 'o three renderizou a sombra mesmo com autoUpdate=false e needsUpdate=false'),
    ).toBe(false);
  });

  it('renderiza com autoUpdate ligado', () => {
    expect(
      renderizouASombra(true, false),
      premissa(2, 'o three NÃO renderizou a sombra com autoUpdate=true'),
    ).toBe(true);
  });

  it('renderiza com needsUpdate ligado mesmo com autoUpdate desligado', () => {
    expect(
      renderizouASombra(false, true),
      premissa(2, 'o three NÃO renderizou a sombra com needsUpdate=true'),
    ).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Premissa 3 — o clone da LightShadow copia autoUpdate no ato
// --------------------------------------------------------------------------

describe('premissa 3 — clone da LightShadow congela autoUpdate', () => {
  it('copia autoUpdate no momento do clone e não acompanha o original depois', () => {
    // A `shadow` de uma DirectionalLight real: é exatamente a que o CSM clona
    // por cascata no `_init`.
    const original = new DirectionalLight().shadow;
    original.autoUpdate = false;

    const copia = original.clone();
    expect(
      copia.autoUpdate,
      premissa(3, 'o clone não recebeu o autoUpdate=false do original'),
    ).toBe(false);

    // O ponto da premissa: mexer no original DEPOIS não chega na cópia. É por
    // isso que o passe nativo escreve na `shadow` de cada cascata, e não na do
    // sol.
    original.autoUpdate = true;
    expect(
      copia.autoUpdate,
      premissa(3, 'mexer no original depois do clone chegou na cópia — virou referência compartilhada'),
    ).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Premissa 4 — o three inverte o lado da face no passe de sombra
// --------------------------------------------------------------------------

/**
 * Executa o `renderObject` recebido com um `overrideMaterial` de passe de
 * sombra e devolve o `side` com que ele chegou à submissão.
 *
 * Recebe a função por parâmetro (em vez de ir direto no `three`) porque é
 * assim que o teste de quebra abaixo consegue simular um `three` futuro que
 * parou de inverter — sem isso, esta verificação nunca falharia e não
 * protegeria nada.
 */
function ladoDaFaceNoPasseDeSombra(
  renderObject: (...args: unknown[]) => void,
  material: { side: number; shadowSide: number | null; allowOverride: boolean },
  tipoDeShadowMap: number,
): number | undefined {
  let ladoSubmetido: number | undefined;

  const overrideMaterial = {
    isShadowPassMaterial: true,
    isNodeMaterial: false,
    side: FrontSide,
    alphaTest: 0,
    alphaMap: null,
    transparent: false,
    forceSinglePass: false,
  };
  const scene = { overrideMaterial };
  const object = {
    onBeforeRender: () => {},
    onAfterRender: () => {},
  };
  const contexto = {
    shadowMap: { type: tipoDeShadowMap },
    _getShadowNodes: () => ({ colorNode: null, depthNode: null, positionNode: null }),
    _handleObjectFunction: (_obj: unknown, materialSubmetido: { side: number }) => {
      ladoSubmetido = materialSubmetido.side;
    },
  };

  renderObject.call(contexto, object, scene, null, null, material, null, null);
  return ladoSubmetido;
}

/**
 * A tabela `_shadowSide` do `three`, INTEIRA — a mesma que
 * `LADO_DA_SOMBRA` reproduz em `src/core/NativeSceneMirror.ts`.
 *
 * Cobrir só `FrontSide` deixava dois terços da tabela sem trava: um caster
 * `DoubleSide` (folhagem) ou `BackSide` estaria desenhado com o lado errado
 * sem nada acusar, que foi exatamente a pendência que esta rodada fechou.
 */
const TABELA_DO_LADO: ReadonlyArray<{ de: number; para: number; nome: string }> = [
  { de: FrontSide, para: BackSide, nome: 'FrontSide' },
  { de: BackSide, para: FrontSide, nome: 'BackSide' },
  { de: DoubleSide, para: DoubleSide, nome: 'DoubleSide' },
];

/**
 * Verifica a premissa 4 contra a `renderObject` dada, para a tabela inteira.
 * Lança com a mensagem da premissa quando ela não vale — é a função que o
 * teste de quebra exercita.
 */
function conferirInversaoDoLado(renderObject: (...args: unknown[]) => void): void {
  for (const linha of TABELA_DO_LADO) {
    const material = { side: linha.de, shadowSide: null, allowOverride: true };
    const lado = ladoDaFaceNoPasseDeSombra(renderObject, material, PCFSoftShadowMap);
    if (lado !== linha.para) {
      throw new Error(
        premissa(
          4,
          `material.side=${linha.nome} chegou ao passe de sombra como ${lado}, ` +
            `esperado ${linha.para}`,
        ),
      );
    }
  }
}

const renderObjectDoThree = (
  WebGPURenderer.prototype as unknown as { renderObject: (...args: unknown[]) => void }
).renderObject;

describe('premissa 4 — lado da face invertido no passe de sombra', () => {
  it('a tabela INTEIRA vale (Front->Back, Back->Front, Double->Double)', () => {
    expect(() => conferirInversaoDoLado(renderObjectDoThree)).not.toThrow();
  });

  it.each(TABELA_DO_LADO)('$nome vira o lado esperado no passe de sombra', (linha) => {
    const lado = ladoDaFaceNoPasseDeSombra(
      renderObjectDoThree,
      { side: linha.de, shadowSide: null, allowOverride: true },
      PCFSoftShadowMap,
    );
    expect(lado, premissa(4, `${linha.nome} virou ${lado}, esperado ${linha.para}`)).toBe(
      linha.para,
    );
  });

  it.each(TABELA_DO_LADO)('shadowSide=$nome autorado vence a inversão', (linha) => {
    // Com `shadowSide` autorado o three usa o valor DIRETO, sem passar pela
    // tabela — e é isso que `LADO_AUTORADO` reproduz no espelho.
    const lado = ladoDaFaceNoPasseDeSombra(
      renderObjectDoThree,
      { side: DoubleSide, shadowSide: linha.de, allowOverride: true },
      PCFSoftShadowMap,
    );
    expect(lado, premissa(4, `shadowSide=${linha.nome} virou ${lado}`)).toBe(linha.de);
  });

  it('material.shadowSide explícito vence a inversão', () => {
    const lado = ladoDaFaceNoPasseDeSombra(
      renderObjectDoThree,
      { side: FrontSide, shadowSide: FrontSide, allowOverride: true },
      PCFSoftShadowMap,
    );
    expect(lado, premissa(4, `shadowSide=FrontSide foi ignorado e virou ${lado}`)).toBe(FrontSide);
  });

  it('um material real do three nasce em FrontSide com shadowSide nulo', () => {
    // A inversão só protege o passe nativo se o caso COMUM for FrontSide: é o
    // default que o `cullMode = Front` assume.
    const real = new MeshStandardMaterial();
    expect(real.side, premissa(4, `MeshStandardMaterial nasce com side=${real.side}`)).toBe(FrontSide);
    expect(real.shadowSide, premissa(4, 'MeshStandardMaterial nasce com shadowSide definido')).toBe(null);
  });
});

describe('premissa 4 — PROVA de que o contrato pega a quebra (SPEC-0246)', () => {
  it('acusa com a mensagem completa quando o three para de inverter o lado', () => {
    // Um `three` hipotético que passou a usar `material.side` direto no passe
    // de sombra — exatamente a mudança que produziria acne/peter-panning no
    // passe nativo sem levantar nenhum erro.
    const renderObjectQueNaoInverte = function (
      this: { _handleObjectFunction: (o: unknown, m: unknown) => void },
      object: unknown,
      scene: { overrideMaterial: { side: number } },
      _camera: unknown,
      _geometry: unknown,
      material: { side: number },
    ): void {
      scene.overrideMaterial.side = material.side; // sem `_shadowSide[...]`
      this._handleObjectFunction(object, scene.overrideMaterial);
    } as unknown as (...args: unknown[]) => void;

    expect(() => conferirInversaoDoLado(renderObjectQueNaoInverte)).toThrowError(
      /PREMISSA 4 DO THREE CAIU/,
    );
    expect(() => conferirInversaoDoLado(renderObjectQueNaoInverte)).toThrowError(/ACNE e PETER-PANNING/);
    expect(() => conferirInversaoDoLado(renderObjectQueNaoInverte)).toThrowError(
      /shadow_math\.h/,
    );
  });

  it('acusa quando o three inverte SÓ o FrontSide (a tabela pela metade)', () => {
    // O modo de falha que a versão anterior deste contrato NÃO pegava: se só o
    // primeiro par valesse, um caster BackSide ou DoubleSide seria desenhado
    // com o lado errado e o contrato diria que estava tudo bem.
    const renderObjectPelaMetade = function (
      this: { _handleObjectFunction: (o: unknown, m: unknown) => void },
      object: unknown,
      scene: { overrideMaterial: { side: number } },
      _camera: unknown,
      _geometry: unknown,
      material: { side: number },
    ): void {
      scene.overrideMaterial.side = material.side === FrontSide ? BackSide : material.side;
      this._handleObjectFunction(object, scene.overrideMaterial);
    } as unknown as (...args: unknown[]) => void;

    expect(() => conferirInversaoDoLado(renderObjectPelaMetade)).toThrowError(
      /PREMISSA 4 DO THREE CAIU/,
    );
    expect(() => conferirInversaoDoLado(renderObjectPelaMetade)).toThrowError(/BackSide/);
  });
});

// --------------------------------------------------------------------------
// Premissas 5, 9 e 10 — RenderList, poda por `visible` e o ramo VSM
// --------------------------------------------------------------------------

/** Malha simples, fora do frustum culling para o arranjo ficar determinístico. */
function malha(castShadow: boolean, receiveShadow = false): Mesh {
  const m = new Mesh(new SphereGeometry(RAIO_DA_ESFERA), new MeshStandardMaterial());
  m.frustumCulled = false;
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

/** Roda o `_projectObject` do `three` e devolve o que foi parar na RenderList. */
function projetar(raiz: Object3D): unknown[] {
  const empurrados: unknown[] = [];
  const renderList = {
    push: (objeto: unknown) => {
      empurrados.push(objeto);
    },
    pushLight: () => {},
    pushBundle: () => {},
  };
  const contexto = {
    sortObjects: false,
    backend: {},
    _projectObject: (
      WebGPURenderer.prototype as unknown as { _projectObject: (...args: unknown[]) => void }
    )._projectObject,
  };
  const camera = new PerspectiveCamera();
  raiz.updateMatrixWorld(true);
  contexto._projectObject.call(contexto, raiz, camera, ORDEM_DE_GRUPO, renderList, null);
  return empurrados;
}

describe('premissa 5 — castShadow é filtrado depois da RenderList', () => {
  it('_projectObject enfileira malha com castShadow=false (não poda por castShadow)', () => {
    const raiz = new Object3D();
    const semSombra = malha(false);
    raiz.add(semSombra);

    const empurrados = projetar(raiz);
    expect(
      empurrados,
      premissa(
        5,
        '_projectObject podou a malha por castShadow — a travessia que o passe nativo substitui deixou de existir',
      ),
    ).toContain(semSombra);
  });

  it('a função de render de sombra descarta castShadow=false na hora do draw', () => {
    const { desenhados } = submeterAoPasseDeSombra(PCFSoftShadowMap, [malha(false), malha(true)]);
    expect(
      desenhados.length,
      premissa(5, `a função de sombra desenhou ${desenhados.length} objetos, esperado 1`),
    ).toBe(1);
  });
});

describe('premissa 9 — _projectObject poda a subárvore em visible === false', () => {
  it('nada de uma subárvore invisível chega na RenderList', () => {
    const raiz = new Object3D();
    const galho = new Object3D();
    galho.visible = false;
    const folha = malha(true);
    galho.add(folha);
    raiz.add(galho);

    const empurrados = projetar(raiz);
    expect(
      empurrados,
      premissa(9, 'a malha sob um nó invisible=false chegou na RenderList'),
    ).not.toContain(folha);
  });

  it('a mesma subárvore visível chega na RenderList (o arranjo não está mentindo)', () => {
    const raiz = new Object3D();
    const galho = new Object3D();
    const folha = malha(true);
    galho.add(folha);
    raiz.add(galho);

    expect(projetar(raiz)).toContain(folha);
  });
});

/**
 * Submete objetos à função de render de sombra do `three` e devolve quem foi
 * desenhado.
 */
function submeterAoPasseDeSombra(
  tipoDeShadowMap: number,
  objetos: Mesh[],
): { desenhados: Mesh[] } {
  const desenhados: Mesh[] = [];
  const renderer = {
    renderObject: (objeto: Mesh) => {
      desenhados.push(objeto);
    },
  };
  const shadow = { camera: new PerspectiveCamera() };
  const funcao = getShadowRenderObjectFunction(
    renderer as never,
    shadow as never,
    tipoDeShadowMap,
    false,
  ) as unknown as (...args: unknown[]) => void;
  const scene = { overrideMaterial: null };
  for (const objeto of objetos) {
    funcao(objeto, scene, null, objeto.geometry, objeto.material, null);
  }
  return { desenhados };
}

describe('premissa 10 — PCFSoftShadowMap não entra no ramo VSM', () => {
  it('as constantes são distintas', () => {
    expect(PCFSoftShadowMap, premissa(10, 'PCFSoftShadowMap virou o mesmo valor de VSMShadowMap')).not.toBe(
      VSMShadowMap,
    );
    expect(PCFShadowMap).not.toBe(VSMShadowMap);
  });

  it('com PCFSoft, um receiveShadow que não é caster NÃO é desenhado', () => {
    const soRecebe = malha(false, true);
    const { desenhados } = submeterAoPasseDeSombra(PCFSoftShadowMap, [soRecebe]);
    expect(
      desenhados,
      premissa(10, 'PCFSoftShadowMap passou a desenhar receiveShadow — é o comportamento do VSM'),
    ).toHaveLength(0);
  });

  it('com VSM, o mesmo receiveShadow É desenhado (o arranjo distingue os dois ramos)', () => {
    const soRecebe = malha(false, true);
    const { desenhados } = submeterAoPasseDeSombra(VSMShadowMap, [soRecebe]);
    expect(desenhados).toHaveLength(1);
  });

  it('com PCFSoft o lado da face é invertido (é o ramo não-VSM do renderObject)', () => {
    const lado = ladoDaFaceNoPasseDeSombra(
      renderObjectDoThree,
      { side: FrontSide, shadowSide: null, allowOverride: true },
      PCFSoftShadowMap,
    );
    expect(lado, premissa(10, `PCFSoft não inverteu o lado (chegou ${lado})`)).toBe(BackSide);
  });

  it('com VSM o lado da face NÃO é invertido — por isso o gate recusa VSM', () => {
    const lado = ladoDaFaceNoPasseDeSombra(
      renderObjectDoThree,
      { side: FrontSide, shadowSide: null, allowOverride: true },
      VSMShadowMap,
    );
    expect(
      lado,
      premissa(10, `VSM passou a inverter o lado (chegou ${lado}) — a recusa do gate ficou obsoleta`),
    ).toBe(FrontSide);
  });
});

// --------------------------------------------------------------------------
// Premissa 6 — CSMShadowNode popula `lights` só no _init
// --------------------------------------------------------------------------

describe('premissa 6 — cascatas do CSM só existem depois do primeiro setup', () => {
  it('o nó nasce sem cascatas e sem câmera', () => {
    const csm = new CSMShadowNode(new DirectionalLight()) as unknown as {
      lights: unknown[];
      camera: unknown;
    };
    expect(
      csm.lights,
      premissa(6, 'o CSMShadowNode nasceu com cascatas — o congelamento poderia ir para o construtor'),
    ).toHaveLength(0);
    expect(csm.camera, premissa(6, 'o CSMShadowNode nasceu com câmera')).toBe(null);
  });

  it('o setup é quem chama o _init, e só enquanto a câmera for nula', () => {
    const csm = new CSMShadowNode(new DirectionalLight()) as unknown as {
      camera: unknown;
      _init: (b: unknown) => void;
      _setupStandard: () => void;
      setup: (b: unknown) => void;
    };
    const init = vi.fn(() => {
      csm.camera = new PerspectiveCamera();
    });
    csm._init = init;
    csm._setupStandard = () => {};

    csm.setup({});
    expect(
      init.mock.calls.length,
      premissa(6, 'o setup não chamou o _init — `lights` seria populado em outro ponto'),
    ).toBe(1);

    csm.setup({});
    expect(
      init.mock.calls.length,
      premissa(6, 'o setup chamou o _init de novo com a câmera já definida'),
    ).toBe(1);
  });
});

// --------------------------------------------------------------------------
// Premissa 7 — quem chama updateMatrices
// --------------------------------------------------------------------------

/**
 * Dispara o `onRenderUpdate` do uniforme `lightShadowMatrix` e devolve quantas
 * vezes o `three` chamou `shadow.updateMatrices` sozinho.
 */
function atualizacoesEspontaneasDaMatriz(castShadow: boolean, shadowMapHabilitado: boolean): number {
  const luz = new DirectionalLight();
  luz.castShadow = castShadow;
  let chamadas = 0;
  luz.shadow.updateMatrices = () => {
    chamadas++;
  };
  const no = lightShadowMatrix(luz) as unknown as { update: (frame: unknown) => void };
  no.update({
    renderer: { shadowMap: { enabled: shadowMapHabilitado } },
    // Mesma câmera da sombra: iguala o `coordinateSystem` e isola a premissa
    // do ramo que recompõe a projeção.
    camera: luz.shadow.camera,
  });
  return chamadas;
}

describe('premissa 7 — o three não atualiza a matriz da sombra sozinho no caso normal', () => {
  it('com castShadow e shadowMap habilitados, NÃO chama updateMatrices (o nativo tem de chamar)', () => {
    expect(
      atualizacoesEspontaneasDaMatriz(true, true),
      premissa(
        7,
        'o three passou a chamar updateMatrices sozinho — a chamada do preparo nativo virou redundante, confira se não virou dupla',
      ),
    ).toBe(0);
  });

  it('com o shadowMap desabilitado, chama updateMatrices', () => {
    expect(
      atualizacoesEspontaneasDaMatriz(true, false),
      premissa(7, 'o three deixou de chamar updateMatrices com shadowMap.enabled=false'),
    ).toBe(1);
  });

  it('sem castShadow, chama updateMatrices', () => {
    expect(
      atualizacoesEspontaneasDaMatriz(false, true),
      premissa(7, 'o three deixou de chamar updateMatrices com castShadow=false'),
    ).toBe(1);
  });
});

// --------------------------------------------------------------------------
// Premissa 8 — eventos de mutação da cena
// --------------------------------------------------------------------------

/** Registra os eventos de mutação disparados no pai durante `acao`. */
function eventosDurante(pai: Object3D, acao: () => void): string[] {
  const vistos: string[] = [];
  const anotar = (e: { type: string }): void => {
    vistos.push(e.type);
  };
  pai.addEventListener('childadded', anotar);
  pai.addEventListener('childremoved', anotar);
  acao();
  pai.removeEventListener('childadded', anotar);
  pai.removeEventListener('childremoved', anotar);
  return vistos;
}

describe('premissa 8 — mutação da cena dispara childadded/childremoved', () => {
  it('add e remove disparam', () => {
    const pai = new Object3D();
    const filho = new Object3D();
    expect(
      eventosDurante(pai, () => pai.add(filho)),
      premissa(8, 'add não disparou childadded'),
    ).toEqual(['childadded']);
    expect(
      eventosDurante(pai, () => pai.remove(filho)),
      premissa(8, 'remove não disparou childremoved'),
    ).toEqual(['childremoved']);
  });

  it('attach desemboca nos dois eventos (sai de um pai, entra no outro)', () => {
    const antigo = new Object3D();
    const novo = new Object3D();
    const filho = new Object3D();
    antigo.add(filho);

    const noAntigo = eventosDurante(antigo, () => {
      const noNovo = eventosDurante(novo, () => novo.attach(filho));
      expect(noNovo, premissa(8, 'attach não disparou childadded no novo pai')).toContain('childadded');
    });
    expect(noAntigo, premissa(8, 'attach não disparou childremoved no pai antigo')).toContain(
      'childremoved',
    );
  });

  it('clear desemboca em childremoved', () => {
    const pai = new Object3D();
    pai.add(new Object3D(), new Object3D());
    expect(
      eventosDurante(pai, () => pai.clear()),
      premissa(8, 'clear não desembocou em childremoved'),
    ).toEqual(['childremoved', 'childremoved']);
  });

  it('removeFromParent desemboca em childremoved', () => {
    const pai = new Object3D();
    const filho = new Object3D();
    pai.add(filho);
    expect(
      eventosDurante(pai, () => filho.removeFromParent()),
      premissa(8, 'removeFromParent não desembocou em childremoved'),
    ).toEqual(['childremoved']);
  });

  it('copy recursivo desemboca em childadded', () => {
    const origem = new Object3D();
    origem.add(new Object3D());
    const destino = new Object3D();
    expect(
      eventosDurante(destino, () => destino.copy(origem)),
      premissa(8, 'copy recursivo não desembocou em childadded'),
    ).toEqual(['childadded']);
  });
});

// --------------------------------------------------------------------------
// Trava de versão
// --------------------------------------------------------------------------

/**
 * Confere a versão instalada contra a trava. Devolve `undefined` quando bate e
 * a mensagem de falha quando não — função pura para que o próprio mecanismo da
 * trava seja testável sem trocar o `three` do repositório.
 */
export function conferirVersaoDoThree(instalada: string): string | undefined {
  if (instalada === VERSAO_DO_THREE_VALIDADA) return undefined;
  const lista = Object.entries(PREMISSAS)
    .map(([numero, p]) => `    ${numero}. ${p.enunciado}\n       protege: ${p.dependente}`)
    .join('\n');
  return [
    '',
    'O THREE MUDOU DE VERSÃO — O CAMINHO DE RENDER NATIVO PRECISA SER REVALIDADO (SPEC-0246)',
    `  validado em: three@${VERSAO_DO_THREE_VALIDADA}`,
    `  instalado:   three@${instalada}`,
    '',
    '  O passe de sombra nativo (SPEC-0245) e o espelho de cena (SPEC-0234)',
    '  substituem partes do three POR DENTRO. Quando uma premissa cai, o sintoma',
    '  é ARTEFATO VISUAL, não erro. Premissas a revalidar:',
    lista,
    '',
    '  Os testes de comportamento deste arquivo respondem de 1 a 10 sozinhos assim',
    '  que a trava for movida. NÃO respondem (revisão manual, ver a spec):',
    '    - a imagem (rodar o harness da SPEC-0240 e a volta inteira da SPEC-0245)',
    '    - backend.get(depthTexture) devolvendo o GPUTexture certo (precisa de placa)',
    '    - caminhos NOVOS de mutação de cena que não passem por add/remove',
    '    - o bug do _cameraFrameId em ShadowNode.js (se o three consertar, a conta do M6 muda)',
    '',
    '  Depois de conferir: mova VERSAO_DO_THREE_VALIDADA no topo de',
    '  tests/native/three-contract.test.ts e registre a rodada em',
    '  docs/specs/SPEC-0246-contrato-do-three.md.',
    '',
  ].join('\n');
}

/**
 * Versão do `three` de fato instalada.
 *
 * Sobe do módulo resolvido até o `package.json` do pacote: o `exports` do
 * `three` não expõe `./package.json`, então pedi-lo direto não resolve.
 */
function versaoInstaladaDoThree(): string {
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve('three'));
  for (let i = 0; i < PROFUNDIDADE_MAXIMA_ATE_O_PACKAGE_JSON; i++) {
    const candidato = join(dir, 'package.json');
    if (existsSync(candidato)) {
      const pkg = JSON.parse(readFileSync(candidato, 'utf8')) as { name?: string; version?: string };
      if (pkg.name === 'three' && pkg.version) return pkg.version;
    }
    const acima = dirname(dir);
    if (acima === dir) break;
    dir = acima;
  }
  throw new Error('não achei o package.json do three a partir do módulo resolvido');
}

describe('trava de versão do three', () => {
  it('a versão instalada é a validada contra as premissas acima', () => {
    const instalada = versaoInstaladaDoThree();
    const falha = conferirVersaoDoThree(instalada);
    expect(falha ?? 'ok', falha).toBe('ok');
  });

  it('PROVA: uma versão diferente falha com a lista de premissas a revalidar', () => {
    const falha = conferirVersaoDoThree('0.999.0');
    expect(falha).toBeDefined();
    expect(falha).toMatch(/O THREE MUDOU DE VERSÃO/);
    expect(falha).toMatch(/0\.999\.0/);
    expect(falha).toMatch(new RegExp(VERSAO_DO_THREE_VALIDADA.replace(/\./g, '\\.')));
    // A lista tem de citar TODAS as premissas: é o valor da mensagem.
    for (const numero of Object.keys(PREMISSAS)) {
      expect(falha).toMatch(new RegExp(`\\n\\s+${numero}\\. `));
    }
    // E tem de dizer o que o teste NÃO cobre — senão a revisão manual some.
    expect(falha).toMatch(/revisão manual/);
  });

  it('a mesma versão passa', () => {
    expect(conferirVersaoDoThree(VERSAO_DO_THREE_VALIDADA)).toBeUndefined();
  });
});
