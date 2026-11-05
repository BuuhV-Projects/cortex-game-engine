import type { Object3D } from 'three';

/**
 * Registro do hot reload de GLB (SPEC-0697 §3). **Desligado por padrão**: com ele
 * desligado, `loadGLB`/`instance`/`setMatte`/`setShadows`/`setFog`/`applyMaterial`
 * só leem uma flag — nada é alocado nem gravado em `userData` (produção e host
 * nativo). Só importa tipos do three, então não puxa nada para o bundle.
 */

/** Operação de aparência gravada na raiz, reaplicada na ordem depois da troca. */
export type ModelLookKind = 'matte' | 'material' | 'shadows' | 'fog';

/** Entrada de `userData.cortexLook`: o helper aplicado e os argumentos dele (sem o objeto). */
export interface ModelLookEntry {
  kind: ModelLookKind;
  args: unknown[];
}

let enabled = false;
const gltfUrls = new WeakMap<object, string>();
const rootsByUrl = new Map<string, Set<Object3D>>();
/** Filhos diretos que vieram do clone do GLB — o hot reload troca só estes (não luz/arma do jogo). */
const modelChildren = new WeakSet<Object3D>();

/**
 * Liga o registro de raízes de GLB para o {@link hotReloadModel}. O cliente de dev do
 * plugin vite chama isto antes do `main.ts`; em produção ninguém chama.
 */
export function enableModelHotReload(): void {
  enabled = true;
}

/** `true` depois de {@link enableModelHotReload}. */
export function isModelHotReloadEnabled(): boolean {
  return enabled;
}

/**
 * Forma canônica da URL de um modelo: sem query/hash, sem `./` nem `/` no começo e
 * com `/` como separador. `'./assets/a.glb?t=1'` e `'/assets/a.glb'` viram `'assets/a.glb'`.
 */
export function normalizeModelUrl(url: string): string {
  return url.split(/[?#]/)[0]!.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

/** @internal `loadGLB` lembra de que URL veio o GLTF (no-op desligado). */
export function rememberGltfUrl(gltf: object, url: string): void {
  if (enabled) gltfUrls.set(gltf, normalizeModelUrl(url));
}

/** @internal `instance` registra a raiz clonada do GLTF (no-op desligado ou GLTF sem URL). */
export function registerModelRoot(gltf: object, root: Object3D): void {
  if (!enabled) return;
  const url = gltfUrls.get(gltf);
  if (url === undefined) return;
  root.userData['cortexModelUrl'] = url;
  for (const child of root.children) modelChildren.add(child);
  let set = rootsByUrl.get(url);
  if (!set) rootsByUrl.set(url, (set = new Set()));
  set.add(root);
}

/** @internal `true` se `child` veio do clone do GLB (registrado por {@link registerModelRoot}). */
export function isModelChild(child: Object3D): boolean {
  return modelChildren.has(child);
}

/** @internal Tira uma raiz do registro (a raiz temporária do hot reload, por exemplo). */
export function forgetModelRoot(root: Object3D): void {
  const url = root.userData['cortexModelUrl'] as string | undefined;
  if (url !== undefined) rootsByUrl.get(url)?.delete(root);
  delete root.userData['cortexModelUrl'];
}

/** @internal Raízes registradas de uma URL já normalizada (o Set vivo do registro). */
export function modelRootsOf(url: string): Set<Object3D> | undefined {
  return rootsByUrl.get(url);
}

/**
 * @internal Grava em `userData.cortexLook` da raiz registrada a operação aplicada. O
 * mesmo `kind` substitui o valor e mantém a posição. No-op desligado ou fora de raiz.
 */
export function recordModelLook(object: Object3D, kind: ModelLookKind, args: unknown[]): void {
  if (!enabled || object.userData['cortexModelUrl'] === undefined) return;
  const look = (object.userData['cortexLook'] ??= []) as ModelLookEntry[];
  const entry = look.find((e) => e.kind === kind);
  if (entry) entry.args = args;
  else look.push({ kind, args });
}

/** @internal Remove a entrada `kind` do look (o "desfazer" do helper: `clearMatte`, `clearMaterial`). */
export function forgetModelLook(object: Object3D, kind: ModelLookKind): void {
  if (!enabled) return;
  const look = object.userData['cortexLook'] as ModelLookEntry[] | undefined;
  const i = look ? look.findIndex((e) => e.kind === kind) : -1;
  if (i >= 0) look!.splice(i, 1);
}
