import { parsePackageManifest, packageMaterialPicks } from '../io/packages/manifest.js';
import type { TextureItem } from './EditorTexturePicker.js';

/**
 * Materiais de pacote de textura no seletor do editor (SPEC-0641 §5). Os pacotes
 * ficam em `assets/packages/<id>/`; em vez de despejar `color.jpg`/`normal.png`/
 * `roughness.png` de cada material (todos com o mesmo nome de arquivo), o
 * seletor mostra UM item por material, com o nome do manifesto.
 */

const PACKAGE_RE = /(^|\/)assets\/packages\//;
const MANIFEST_RE = /(^|\/)assets\/packages\/[^/]+\/cortex-package\.json$/;

/** O asset é um arquivo de pacote instalado? (fica fora das listas genéricas) */
export function isPackageAsset(path: string): boolean {
  return PACKAGE_RE.test(path);
}

/**
 * Lê os manifestos listados pelo `/__list-assets` e devolve um item por material
 * (valor = URL da cor). Manifesto inválido/inacessível é ignorado — um pacote
 * quebrado não pode esconder os outros.
 */
export async function loadPackageTextureItems(
  assets: string[],
  fetchJson: (url: string) => Promise<unknown>,
): Promise<TextureItem<string>[]> {
  const manifests = assets.filter((p) => MANIFEST_RE.test(p)).sort();
  const groups = await Promise.all(
    manifests.map(async (url) => {
      try {
        const m = parsePackageManifest(await fetchJson(url));
        const base = url.slice(0, url.lastIndexOf('/') + 1);
        return packageMaterialPicks(m, base).map((pick) => ({
          name: `${pick.group} · ${pick.name}`,
          thumb: pick.thumb,
          value: pick.value.diffuse,
        }));
      } catch {
        return [];
      }
    }),
  );
  return groups.flat();
}
