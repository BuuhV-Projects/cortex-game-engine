/**
 * O Inspector só deixa autorar física em NÓS da cena (marcados com
 * userData.cortexSceneNode pelo buildScene/instantiate). Objetos criados em código
 * mostram um aviso e NÃO o seletor de tipo — pra não enganar o usuário com edição
 * que se perde (o buildScene só reconcilia nós).
 */
import { describe, it, expect } from 'vitest';
import { Mesh } from 'three';
import { createObjectRegistry, describeInspector, type InspectorField, type InspectorContext } from '../../src/editor/EditorModel.js';
import type { PhysicsApi } from '../../src/editor/EditorInspector.js';

const physicsApi: PhysicsApi = {
  get: () => ({
    type: 'none',
    character: { radius: 0.4, height: 1.8, gravity: 30, stepHeight: 0.4, jumpForce: 9, fallSpeedMax: 25, maxJumps: 1, groundY: 0 },
    rapier: { bodyType: 'dynamic' },
  }),
  setType: () => {},
  setCharacter: () => {},
  setRapier: () => {},
};

function fieldsOf(obj: Mesh): InspectorField[] {
  const ctx: InspectorContext = { physicsApi };
  const { model } = describeInspector(obj, ctx, createObjectRegistry());
  return model.sections.flatMap((s) => s.fields);
}
function has(fields: InspectorField[], idSuffix: string): boolean {
  return fields.some((f) => f.id.endsWith(`:${idSuffix}`));
}

describe('Inspector — física só em nós da cena', () => {
  it('NÓ da cena (cortexSceneNode) mostra o seletor de tipo', () => {
    const m = new Mesh();
    m.name = 'caixa';
    (m.userData as Record<string, unknown>)['cortexSceneNode'] = true;
    const f = fieldsOf(m);
    expect(has(f, 'physType')).toBe(true);
    expect(has(f, 'physNotNode')).toBe(false);
  });

  it('objeto criado em CÓDIGO (sem a marca) mostra aviso e NÃO o seletor', () => {
    const m = new Mesh();
    m.name = 'caixa_03'; // criado em código, sem cortexSceneNode
    const f = fieldsOf(m);
    expect(has(f, 'physType')).toBe(false);
    expect(has(f, 'physNotNode')).toBe(true);
  });
});
