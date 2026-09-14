/**
 * Testes unitários para a neutralização do OUTPUT_PATH
 * (src/ai/BlenderModelGenerator.ts).
 *
 * Regressão real: o GPT-6-Astra redefiniu `OUTPUT_PATH` dentro do script na
 * primeira chamada de teste. Como o Studio injeta o caminho real no topo, uma
 * redefinição posterior venceria e o `.glb` sairia em outro lugar.
 *
 * @see SPEC-0190
 */
import { describe, it, expect } from 'vitest';

import { _neutralizeOutputPathAssignments } from '../src/ai/BlenderModelGenerator.js';

describe('_neutralizeOutputPathAssignments', () => {
  it('comenta uma redefinição em nível superior', () => {
    const script = ['import bpy', 'OUTPUT_PATH = "/tmp/cube.glb"', 'bpy.ops.mesh.primitive_cube_add()'].join('\n');

    const out = _neutralizeOutputPathAssignments(script);

    expect(out).not.toMatch(/^OUTPUT_PATH\s*=/m);
    expect(out).toContain('# OUTPUT_PATH = "/tmp/cube.glb"');
    expect(out).toContain('[cortex]');
  });

  it('preserva o resto do script intacto', () => {
    const script = ['import bpy', 'OUTPUT_PATH = "/tmp/x.glb"', 'bpy.ops.export_scene.gltf(filepath=OUTPUT_PATH)'].join(
      '\n',
    );

    const out = _neutralizeOutputPathAssignments(script);

    expect(out).toContain('import bpy');
    expect(out).toContain('bpy.ops.export_scene.gltf(filepath=OUTPUT_PATH)');
  });

  it('neutraliza múltiplas redefinições', () => {
    const script = ['OUTPUT_PATH = "/a.glb"', 'import bpy', 'OUTPUT_PATH = "/b.glb"'].join('\n');

    const out = _neutralizeOutputPathAssignments(script);

    expect(out.match(/^# OUTPUT_PATH/gm)).toHaveLength(2);
  });

  it('não mexe em atribuições indentadas (dentro de função ou if)', () => {
    const script = ['def setup():', '    OUTPUT_PATH = "/interno.glb"', '    return OUTPUT_PATH'].join('\n');

    const out = _neutralizeOutputPathAssignments(script);

    expect(out).toBe(script);
  });

  it('não mexe em leituras da variável', () => {
    const script = 'bpy.ops.export_scene.gltf(filepath=OUTPUT_PATH, export_format="GLB")';

    expect(_neutralizeOutputPathAssignments(script)).toBe(script);
  });

  it('deixa passar script sem nenhuma menção a OUTPUT_PATH', () => {
    const script = 'import bpy\nbpy.ops.mesh.primitive_cube_add()';

    expect(_neutralizeOutputPathAssignments(script)).toBe(script);
  });

  it('aceita espaçamento variado antes do igual', () => {
    const out = _neutralizeOutputPathAssignments('OUTPUT_PATH   =   "/tmp/y.glb"');

    expect(out).toContain('# OUTPUT_PATH   =   "/tmp/y.glb"');
  });
});
