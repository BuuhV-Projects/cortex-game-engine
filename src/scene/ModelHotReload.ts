import type { Object3D } from 'three';
import type { GLTF } from '../core/AssetLoader.js';
import { debug } from '../core/debug.js';
import { ecsBoundObjects } from '../components/Object3DComponent.js';
import { forEachLiveScriptSlot } from '../systems/ScriptHostSystem.js';
import { applyMaterial, type MaterialConfig } from './Materials.js';
import {
  evictGLB,
  instance,
  loadGLB,
  setFog,
  setMatte,
  setShadows,
  type MatteOptions,
  type ShadowOptions,
} from './SceneAssets.js';
import {
  forgetModelRoot,
  isModelChild,
  modelRootsOf,
  normalizeModelUrl,
  type ModelLookEntry,
  type ModelLookKind,
} from './modelHotRegistry.js';

/** Uma raiz trocada pelo {@link hotReloadModel} — o que o jogo recebe para religar referências. */
export interface ModelHotReloadEvent {
  /** URL normalizada do GLB. */
  url: string;
  /** A raiz preservada (mesmo `Object3D` de antes, agora com os filhos novos). */
  root: Object3D;
  /** Os filhos do GLB velho que saíram da raiz (destacados; recursos liberados no `clearSceneAssetCaches`). */
  oldChildren: Object3D[];
}

/** Resultado de {@link hotReloadModel}. */
export interface ModelHotReloadResult {
  /** URL normalizada do GLB. */
  url: string;
  /** Quantas raízes trocaram de filhos. */
  swapped: number;
  /** Raízes puladas (animadas ou presas a ECS), com o motivo legível. */
  skipped: { reason: string }[];
}

type ModelHotReloadListener = (event: ModelHotReloadEvent) => void;

const listeners = new Set<ModelHotReloadListener>();
/** Troca em curso por URL: um save duplo enfileira em vez de trocar duas vezes em paralelo. */
const inflight = new Map<string, Promise<ModelHotReloadResult>>();

/** Reaplica uma entrada do `cortexLook` com o mesmo helper que a gravou. */
const REPLAY: Record<ModelLookKind, (root: Object3D, arg: unknown) => void> = {
  matte: (root, arg) => setMatte(root, arg as MatteOptions),
  material: (root, arg) => applyMaterial(root, arg as MaterialConfig),
  shadows: (root, arg) => setShadows(root, arg as ShadowOptions),
  fog: (root, arg) => setFog(root, arg as boolean),
};

/** Visão interna do `ScriptBehavior` (o estado de raycast é privado/protegido na base). */
interface RaycastScript {
  disabledRaycasts: unknown[];
  restoreRaycasts(): void;
  disableRaycast(target: Object3D): void;
}

/**
 * Avisa quando o {@link hotReloadModel} troca os filhos de uma raiz — para o jogo religar
 * referências a filhos (rig de carro, rodas, sockets).
 *
 * @returns Função que cancela a inscrição.
 *
 * @example
 * onModelHotReload(({ root }) => { if (root === car) rig = buildCarRig(car) })
 */
export function onModelHotReload(cb: ModelHotReloadListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * **Hot reload de GLB** (SPEC-0697 §3): recarrega `url` e troca os filhos de toda raiz
 * viva criada por `instance(await loadGLB(url))` com o registro ligado
 * ({@link enableModelHotReload}), **mantendo a raiz** (componentes, scripts e `byId`
 * continuam valendo). Reaplica o look gravado (matte → material → sombra → fog, na ordem
 * em que foi aplicado) e o raycast desligado dos scripts da raiz. Raiz animada ou presa a
 * ECS é pulada com `console.warn` — um Reiniciar resolve.
 *
 * Chamadas para a mesma URL são serializadas.
 *
 * @param url - URL do GLB; `./`, `/` inicial e query são ignorados.
 */
export function hotReloadModel(url: string): Promise<ModelHotReloadResult> {
  const key = normalizeModelUrl(url);
  const prev = inflight.get(key);
  const run = prev ? prev.then(() => swapModel(key), () => swapModel(key)) : swapModel(key);
  inflight.set(key, run);
  const done = (): void => {
    if (inflight.get(key) === run) inflight.delete(key);
  };
  run.then(done, done);
  return run;
}

async function swapModel(url: string): Promise<ModelHotReloadResult> {
  const result: ModelHotReloadResult = { url, swapped: 0, skipped: [] };
  const roots = modelRootsOf(url);
  const live: Object3D[] = [];
  for (const root of roots ?? []) {
    if (inScene(root)) live.push(root);
    else roots!.delete(root); // destacada da cena: sai do registro
  }

  // O GLTF velho vira órfão do clearSceneAssetCaches, não é liberado aqui: pode ter usuário
  // que o registro não vê (vegetação, personagem modular, `gltf.scene` direto).
  const keys = evictGLB(url);
  const events: ModelHotReloadEvent[] = [];
  if (live.length > 0) {
    let gltf: GLTF;
    try {
      gltf = await loadGLB(keys[0] ?? url);
    } catch (err) {
      // Arquivo lido no meio da escrita (exportador ainda gravando): as raízes ficam com os
      // filhos velhos, e o próximo save, já com o arquivo inteiro, recarrega do zero.
      console.warn(`[cortex] hot reload de ${url}: não consegui carregar o GLB novo; salve de novo.`, err);
      result.skipped.push(...live.map((root) => ({ reason: `${root.name || url}: GLB novo não carregou` })));
      return result;
    }
    for (const root of live) {
      const why = skipReason(root, gltf);
      if (why) {
        console.warn(`[cortex] hot reload de ${url}: nó "${root.name}" ${why}; Reiniciar mostra o modelo novo.`);
        result.skipped.push({ reason: `${root.name || url}: ${why}` });
        continue;
      }
      events.push({ url, root, oldChildren: swapChildren(root, gltf) });
      result.swapped++;
    }
  }

  for (const event of events) {
    for (const cb of listeners) {
      try {
        cb(event);
      } catch (err) {
        debug('model', 'onModelHotReload falhou em', url, err);
      }
    }
  }
  debug('model', 'hot reload', url, result);
  return result;
}

function inScene(obj: Object3D): boolean {
  let o: Object3D | null = obj;
  while (o.parent) o = o.parent;
  return (o as { isScene?: boolean }).isScene === true;
}

function skipReason(root: Object3D, gltf: GLTF): string | null {
  if (root.userData['cortexAnim'] !== undefined || (gltf.animations?.length ?? 0) > 0) return 'tem animação';
  if (ecsBoundObjects.has(root)) return 'está presa a ECS (física/collider)';
  return null;
}

/** Troca os filhos da raiz pelos de um clone novo e refaz o que deriva deles. Devolve os velhos. */
function swapChildren(root: Object3D, gltf: GLTF): Object3D[] {
  // Só os filhos do GLB: o que o jogo ou um script prendeu na raiz (luz, arma) fica.
  const oldChildren = root.children.filter(isModelChild);
  if (oldChildren.length) root.remove(...oldChildren);
  const fresh = instance(gltf);
  forgetModelRoot(fresh); // raiz temporária: só doa os filhos
  if (fresh.children.length) root.add(...fresh.children);

  const look = (root.userData['cortexLook'] as ModelLookEntry[] | undefined) ?? [];
  // Cópia: reaplicar regrava o mesmo kind (substitui no lugar, mas não itere o array vivo).
  for (const { kind, args } of [...look]) REPLAY[kind](root, args[0]);

  forEachLiveScriptSlot((slot, comp) => {
    const script = slot.instance as unknown as RaycastScript | null;
    if (comp.object !== root || !script || script.disabledRaycasts.length === 0) return;
    script.restoreRaycasts(); // as entradas apontam para as malhas velhas
    script.disableRaycast(root);
  });
  return oldChildren;
}
