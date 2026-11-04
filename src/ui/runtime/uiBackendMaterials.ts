/**
 * Peças puras do backend RENDERER da UI (ADR-0102): materiais TSL da caixa e da imagem, estilo da
 * caixa, "cover", blend da composição em gama e a destruição de um visual. Saíram do
 * `RendererUiBackend.ts` (SPEC-0688) para ele caber em 500 linhas; o comportamento é o mesmo.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, length, max, min, mix, smoothstep, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { parseUiBackground, parseUiColor } from './uiColor.js';
import { UiButton, type UiPanel } from './widgets.js';
import { UI_BOX_KEY, UI_IMAGE_KEY } from './uiNativeData.js';

/**
 * Blend pra escrever numa RenderTarget com ALPHA correto (ADR-0105): rgb
 * premultiplicado + alpha "over" reto. O `NormalBlending` do three elevaria o
 * alpha ao quadrado sobre o alvo transparente (scrim 0.6 → 0.36 → composição
 * fraca). Só no caminho de composição nativa; o caminho antigo usa NormalBlending.
 */
export function setUiCompositeBlend(material: THREE.Material): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/**
 * Uniforms do material de caixa (rounded-rect SDF via TSL). Tipados como
 * `any` porque o d.ts do `uniform()` do three ainda devolve
 * `UniformNode<unknown>` (sem os operadores encadeáveis) — runtime correto.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PanelUniforms {
  size: any;
  radius: any;
  borderWidth: any;
  colorTop: any;
  colorBottom: any;
  borderColor: any;
  /** Alpha embutido nas cores (`#rrggbbaa`): topo, base e borda. */
  alphaTop: any;
  alphaBottom: any;
  alphaBorder: any;
  /** Eixo do gradiente: 0 = vertical (topo→base), 1 = horizontal (esq→dir). */
  gradientAxis: any;
  fillOpacity: any;
}

/** Uniforms do quad de imagem (cover + clip arredondado). */
export interface ImageUniforms {
  size: any;
  radius: any;
  repeat: any;
  offset: any;
  opacity: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface WidgetVisual {
  /** Último `sync` em que o widget dono ainda estava na lista (SPEC-0357). */
  syncStamp?: number;
  background?: THREE.Mesh;
  panelUniforms?: PanelUniforms;
  /** Sombra dura (cópia da caixa deslocada pra baixo, `shadowHeight`). */
  shadow?: THREE.Mesh;
  shadowUniforms?: PanelUniforms;
  text?: THREE.Mesh;
  texture?: THREE.DataTexture;
  lastText?: string;
  lastFontSize?: number;
  /** Imagem de fundo do Panel (quad texturizado, "cover", clipada no raio). */
  image?: THREE.Mesh;
  imageUniforms?: ImageUniforms;
  imageTexture?: THREE.Texture;
  lastImage?: string | null;
  /** `<canvas>` (ADR-0315): quad com a CanvasTexture do elemento. */
  canvas?: THREE.Mesh;
  canvasTexture?: THREE.CanvasTexture;
  /** `__cortexVersion` do canvas que está na GPU (-1 = nunca subiu). */
  canvasVersion?: number;
}

/** O bitmap mudou de tamanho desde que a textura foi criada? */
export function bitmapResized(tex: THREE.Texture, canvas: HTMLCanvasElement): boolean {
  return tex.userData['w'] !== canvas.width || tex.userData['h'] !== canvas.height;
}

/** Canvas do host conta versões de pixel (SPEC-0317); fora dele, `undefined`. */
export function canvasVersion(canvas: HTMLCanvasElement): number | undefined {
  return (canvas as HTMLCanvasElement & { __cortexVersion?: number }).__cortexVersion;
}

/**
 * Copia o bitmap invertendo as linhas: o raster vem top-down e a UV do plane
 * espera bottom-up.
 *
 * Escreve num alvo JÁ EXISTENTE de propósito. No caminho de reúso o alvo é o
 * `image.data` da própria textura — copiar para um buffer novo e atribuir
 * depois não faria o upload enxergar a mudança.
 */
export function flipRowsInto(target: Uint8Array, source: Uint8Array, width: number, height: number): void {
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    target.set(source.subarray(rowBytes * row, rowBytes * (row + 1)), rowBytes * (height - 1 - row));
  }
}

/**
 * Material de caixa: rounded-rect por SDF em TSL (WGSL nos dois mundos) —
 * gradiente vertical, canto arredondado e borda, tudo por UNIFORM (estilo
 * muda sem recompilar shader).
 */
export function makeBoxMaterial(composite: boolean): { material: MeshBasicNodeMaterial; uniforms: PanelUniforms } {
  const uniforms: PanelUniforms = {
    size: uniform(new THREE.Vector2(100, 40)),
    radius: uniform(0),
    borderWidth: uniform(0),
    colorTop: uniform(new THREE.Color('#000000')),
    colorBottom: uniform(new THREE.Color('#000000')),
    borderColor: uniform(new THREE.Color('#ffffff')),
    alphaTop: uniform(1),
    alphaBottom: uniform(1),
    alphaBorder: uniform(1),
    gradientAxis: uniform(0),
    fillOpacity: uniform(1),
  };

  // SDF de retângulo arredondado no espaço em px do widget.
  const p = uv().sub(vec2(0.5, 0.5)).mul(uniforms.size);
  const half = uniforms.size.mul(0.5);
  const b = half.sub(vec2(uniforms.radius, uniforms.radius));
  const q = abs(p).sub(b);
  const dist = length(max(q, vec2(0, 0)))
    .add(min(max(q.x, q.y), float(0)))
    .sub(uniforms.radius);

  // Fator do gradiente: vertical (uv.y invertido) ou horizontal (uv.x).
  const factor = mix(uv().y.oneMinus(), uv().x, uniforms.gradientAxis);
  const fill = mix(uniforms.colorTop, uniforms.colorBottom, factor);
  const fillAlpha = mix(uniforms.alphaTop, uniforms.alphaBottom, factor);
  const borderMask = smoothstep(
    uniforms.borderWidth.negate().sub(0.75),
    uniforms.borderWidth.negate().add(0.75),
    dist,
  ).mul(min(uniforms.borderWidth, float(1))); // borderWidth 0 → sem borda
  const color = mix(fill, uniforms.borderColor, borderMask);
  const alpha = smoothstep(float(0.75), float(-0.75), dist)
    .mul(mix(fillAlpha, uniforms.alphaBorder, borderMask))
    .mul(uniforms.fillOpacity);

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  // A UI é COR DE INTERFACE (sRGB autorada), não cena — NÃO pode passar pelo
  // tone mapping do renderer (ACESFilmic do jogo esfria/dessatura os tons, o
  // que deixava o menu "frio" no native vs "quente" no Studio/DOM).
  material.toneMapped = false;
  material.colorNode = vec4(color, alpha);
  material.userData[UI_BOX_KEY] = uniforms; // read as data by the native UI renderer (SPEC-0616)
  if (composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
  return { material, uniforms };
}

export function updateBoxStyle(
  widget: UiPanel | UiButton,
  uniforms: PanelUniforms,
  width: number,
  height: number,
): void {
  const isButton = widget instanceof UiButton;
  // `background` é CSS: cor ou `linear-gradient(...)` — decompõe aqui.
  const bg = parseUiBackground(
    isButton
      ? widget.focused
        ? widget.focusBackground
        : widget.background
      : widget.background,
    isButton ? null : (widget as UiPanel).backgroundTo,
  );
  const radius = widget.cornerRadius;
  // Borda de foco vence a constante (Button); Panel usa a sua direto.
  const borderWidth = isButton
    ? widget.focused && widget.focusBorderWidth > 0
      ? widget.focusBorderWidth
      : widget.borderWidth
    : (widget as UiPanel).borderWidth;
  const borderColor = isButton
    ? widget.focused && widget.focusBorderWidth > 0
      ? widget.focusBorderColor
      : widget.borderColor
    : (widget as UiPanel).borderColor;

  const top = parseUiColor(bg.from);
  const bottom = parseUiColor(bg.to ?? bg.from);
  const border = parseUiColor(borderColor);

  (uniforms.size.value as THREE.Vector2).set(width, height);
  uniforms.radius.value = Math.min(radius, Math.min(width, height) / 2);
  uniforms.borderWidth.value = borderWidth;
  (uniforms.colorTop.value as THREE.Color).set(top.rgb);
  (uniforms.colorBottom.value as THREE.Color).set(bottom.rgb);
  (uniforms.borderColor.value as THREE.Color).set(border.rgb);
  uniforms.alphaTop.value = top.alpha;
  uniforms.alphaBottom.value = bottom.alpha;
  uniforms.alphaBorder.value = border.alpha;
  uniforms.gradientAxis.value = bg.axis;
  // Opacidade = a do widget (igual ao DOM). Sem o antigo `*0.96` nos botões:
  // deixava 4% do fundo (claro) vazar e LAVAVA a cor sobre backdrops claros.
  uniforms.fillOpacity.value = widget.opacity;
}

/**
 * Material do quad de imagem: sample com "cover" (repeat/offset por uniform)
 * e **clip arredondado** pelo mesmo SDF da caixa — a imagem respeita o
 * `cornerRadius` do Panel (no DOM o `border-radius` já clipa; aqui é o
 * shader que corta).
 */
export function makeImageMaterial(tex: THREE.Texture, composite: boolean): {
  material: MeshBasicNodeMaterial;
  uniforms: ImageUniforms;
} {
  const uniforms: ImageUniforms = {
    size: uniform(new THREE.Vector2(100, 100)),
    radius: uniform(0),
    repeat: uniform(new THREE.Vector2(1, 1)),
    offset: uniform(new THREE.Vector2(0, 0)),
    opacity: uniform(1),
  };
  const p = uv().sub(vec2(0.5, 0.5)).mul(uniforms.size);
  const half = uniforms.size.mul(0.5);
  const b = half.sub(vec2(uniforms.radius, uniforms.radius));
  const q = abs(p).sub(b);
  const dist = length(max(q, vec2(0, 0)))
    .add(min(max(q.x, q.y), float(0)))
    .sub(uniforms.radius);
  const mask = smoothstep(float(0.75), float(-0.75), dist);
  // `any` como nos uniforms: o d.ts do TSL ainda não tipa swizzle de texture().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sample = texture(tex, uv().mul(uniforms.repeat).add(uniforms.offset)) as any;
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.toneMapped = false; // cor de UI (sRGB), fora do tone mapping do jogo
  material.colorNode = vec4(sample.r, sample.g, sample.b, sample.a.mul(mask).mul(uniforms.opacity));
  material.userData[UI_IMAGE_KEY] = { uniforms, texture: tex }; // native UI renderer (SPEC-0616)
  if (composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
  return { material, uniforms };
}

/** "cover": ajusta repeat/offset (uniforms) pra preencher o rect sem distorcer. */
export function coverTexture(visual: WidgetVisual, rectW: number, rectH: number): void {
  const tex = visual.imageTexture;
  const u = visual.imageUniforms;
  if (!tex || !tex.image || !u || rectW <= 0 || rectH <= 0) return;
  const img = tex.image as { width?: number; height?: number };
  const imgW = img.width ?? 0;
  const imgH = img.height ?? 0;
  if (!imgW || !imgH) return;
  const rectAspect = rectW / rectH;
  const imgAspect = imgW / imgH;
  if (imgAspect > rectAspect) {
    // Imagem mais larga: encaixa na altura, corta as laterais.
    const r = rectAspect / imgAspect;
    (u.repeat.value as THREE.Vector2).set(r, 1);
    (u.offset.value as THREE.Vector2).set((1 - r) / 2, 0);
  } else {
    const r = imgAspect / rectAspect;
    (u.repeat.value as THREE.Vector2).set(1, r);
    (u.offset.value as THREE.Vector2).set(0, (1 - r) / 2);
  }
}

/** Tira as malhas do visual da cena e libera materiais e texturas. */
export function destroyVisual(scene: THREE.Scene, visual: WidgetVisual): void {
  if (visual.background) {
    scene.remove(visual.background);
    (visual.background.material as THREE.Material).dispose();
  }
  if (visual.shadow) {
    scene.remove(visual.shadow);
    (visual.shadow.material as THREE.Material).dispose();
  }
  if (visual.text) {
    scene.remove(visual.text);
    (visual.text.material as THREE.Material).dispose();
  }
  if (visual.image) {
    scene.remove(visual.image);
    (visual.image.material as THREE.Material).dispose();
  }
  if (visual.canvas) {
    scene.remove(visual.canvas);
    (visual.canvas.material as THREE.Material).dispose();
  }
  visual.texture?.dispose();
  visual.imageTexture?.dispose();
  visual.canvasTexture?.dispose();
}
