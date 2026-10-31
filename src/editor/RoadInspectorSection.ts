import { Color, type Object3D } from 'three';
import type { HandlerMap, InspectorField, InspectorSection } from './EditorModel.js';
import type { RoadApi } from './authoring/RoadAuthoring.js';

/** O Inspector mostra `maxSlope` em %; guardamos razão. */
const PERCENT = 100;
/** Inclinação mínima editável (%): 0 desliga o limite, então o piso é meio por cento. */
const MIN_SLOPE_PERCENT = 0.5;
const WIDTH_STEP = 0.5;
const TALUDE_STEP = 0.5;
const SLOPE_STEP = 1;
const TILE_STEP = 1;
/** Mínimos que mantêm a fita/o corte válidos. */
const MIN_WIDTH = 1;
const MIN_TILE = 0.5;
/** Cor exibida quando a estrada usa a cor default. */
const DEFAULT_COLOR_HEX = '#4a4a4a';

/**
 * Seção **"Estrada"** do Inspector (SPEC-0631 §6): largura, talude, inclinação máx. (%),
 * greide, textura, repetição, cor, chão do carro e "Editar traçado". `null` se `obj`
 * não é estrada.
 */
export function describeRoadSection(
  obj: Object3D,
  api: RoadApi | undefined,
  fid: (suffix: string) => string,
  handlers: HandlerMap,
): InspectorSection | null {
  const r = api?.get(obj) ?? null;
  if (!api || !r) return null;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const fields: InspectorField[] = [
    { kind: 'number', id: fid('roadWidth'), label: 'Largura (m)', value: r.width, step: WIDTH_STEP },
    { kind: 'number', id: fid('roadTalude'), label: 'Talude (m)', value: r.talude, step: TALUDE_STEP },
    { kind: 'number', id: fid('roadSlope'), label: 'Inclinação máx. (%)', value: Math.round(r.maxSlope * PERCENT), step: SLOPE_STEP },
    {
      kind: 'select', id: fid('roadGrade'), label: 'Greide', value: r.grade,
      options: [
        { value: 'terrain', label: 'Segue o terreno' },
        { value: 'points', label: 'Altura dos pontos' },
      ],
    },
    { kind: 'note', id: fid('roadTex'), text: `Textura: ${r.texture ? (r.texture.split('/').pop() ?? r.texture) : 'nenhuma (cor)'}`, tone: 'muted' },
  ];
  if (api.pickTexture) fields.push({ kind: 'button', id: fid('roadPick'), label: '🖼 Escolher textura…' });
  if (r.texture) fields.push({ kind: 'button', id: fid('roadNoTex'), label: 'Sem textura' });
  fields.push(
    { kind: 'number', id: fid('roadTile'), label: 'Repetição (m)', value: r.tile, step: TILE_STEP },
    { kind: 'color', id: fid('roadColor'), label: 'Cor', value: r.color === null ? DEFAULT_COLOR_HEX : `#${new Color(r.color).getHexString()}` },
    { kind: 'checkbox', id: fid('roadDrivable'), label: 'Chão do carro', value: r.drivable },
    { kind: 'number', id: fid('roadClear'), label: 'Faixa sem árvores (m)', value: r.clearance, step: TALUDE_STEP },
    { kind: 'note', id: fid('roadInfo'), text: `${r.points} pontos na curva`, tone: 'muted' },
  );
  if (api.editPoints) fields.push({ kind: 'button', id: fid('roadEdit'), label: '✏ Editar traçado', variant: 'primary' });

  handlers.set(fid('roadWidth'), (v) => {
    const n = num(v);
    if (n !== null) api.set(obj, { width: Math.max(MIN_WIDTH, n) });
  });
  handlers.set(fid('roadTalude'), (v) => {
    const n = num(v);
    if (n !== null) api.set(obj, { talude: Math.max(0, n) });
  });
  handlers.set(fid('roadSlope'), (v) => {
    const n = num(v);
    if (n !== null) api.set(obj, { maxSlope: Math.max(MIN_SLOPE_PERCENT, n) / PERCENT });
  });
  handlers.set(fid('roadGrade'), (v) => {
    api.set(obj, { grade: v === 'points' ? 'points' : 'terrain' });
  });
  handlers.set(fid('roadTile'), (v) => {
    const n = num(v);
    if (n !== null) api.set(obj, { tile: Math.max(MIN_TILE, n) });
  });
  handlers.set(fid('roadColor'), (v) => {
    api.set(obj, { color: String(v) });
  });
  handlers.set(fid('roadDrivable'), (v) => {
    api.set(obj, { drivable: v === true || v === 'true' });
  });
  handlers.set(fid('roadClear'), (v) => {
    const n = num(v);
    if (n !== null) api.set(obj, { clearance: Math.max(0, n) });
  });
  handlers.set(fid('roadPick'), () => api.pickTexture?.(obj));
  handlers.set(fid('roadNoTex'), () => {
    api.set(obj, { texture: '' }); // '' = sem textura explícito (undefined some no JSON)
    return { rebuild: true };
  });
  handlers.set(fid('roadEdit'), () => api.editPoints?.(obj));
  return { title: 'Estrada', fields };
}
