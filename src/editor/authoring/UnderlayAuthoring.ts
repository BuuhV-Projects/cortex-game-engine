import type { Object3D, Mesh, MeshBasicMaterial, Texture } from 'three';
import { TextureLoader, SRGBColorSpace } from 'three';
import type { UnderlayApi, UnderlayEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { debug } from '../../core/debug.js';

type Cfg = { image?: string; opacity?: number; height?: number };

/**
 * Autoria do **underlay** (ADR/imagem de referência) — seção "Underlay" do Inspector.
 * Edita o plano de referência ao vivo (opacidade/altura/imagem) e persiste em
 * `data.underlay[id]` (sobrevive ao reload). Posição/escala/rotação ficam no gizmo de
 * transform (nó normal). O mesh fica em `userData.cortexUnderlay`.
 */
export function createUnderlayApi(ctx: EditorAuthoringContext): UnderlayApi {
  const store = (): Record<string, Cfg> => ctx.record<Cfg>('underlay');
  const meshOf = (obj: Object3D): Mesh | null => {
    const m = (obj.userData as Record<string, unknown>)['cortexUnderlay'];
    return m ? (m as Mesh) : null;
  };
  const matOf = (obj: Object3D): MeshBasicMaterial | null => {
    const mesh = meshOf(obj);
    return mesh ? (mesh.material as MeshBasicMaterial) : null;
  };
  const cfg = (obj: Object3D): Cfg => {
    const rec = store();
    return (rec[obj.name] ??= {});
  };

  return {
    get(obj: Object3D): UnderlayEditState | null {
      const mat = matOf(obj);
      const mesh = meshOf(obj);
      if (!mat || !mesh) return null; // não é underlay
      const img = (obj.userData as Record<string, unknown>)['cortexUnderlayImage'];
      return {
        image: typeof img === 'string' ? img : '',
        opacity: mat.opacity,
        height: mesh.position.y,
      };
    },

    setOpacity(obj: Object3D, value: number): void {
      const mat = matOf(obj);
      if (!mat || !obj.name) return;
      mat.opacity = value; // ao vivo
      cfg(obj).opacity = value;
      ctx.persist();
    },

    setHeight(obj: Object3D, value: number): void {
      const mesh = meshOf(obj);
      if (!mesh || !obj.name) return;
      mesh.position.y = value; // ao vivo
      cfg(obj).height = value;
      ctx.persist();
    },

    importImage(obj: Object3D, name: string, dataUrl: string): void {
      const mat = matOf(obj);
      if (typeof fetch === 'undefined' || !mat || !obj.name) return;
      void (async () => {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const res = await fetch(`/__upload-asset?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
          if (!res.ok) throw new Error(await res.text());
          const path = (await res.text()).trim();
          const tex: Texture = await new TextureLoader().loadAsync(path);
          tex.colorSpace = SRGBColorSpace;
          mat.map = tex; // aplica ao vivo
          mat.needsUpdate = true;
          (obj.userData as Record<string, unknown>)['cortexUnderlayImage'] = path;
          cfg(obj).image = path;
          ctx.persist(true);
        } catch (e) {
          debug('editor', 'falha ao importar imagem do underlay:', e);
        }
      })();
    },
  };
}
