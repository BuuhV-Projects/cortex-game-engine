import { describe, it, expect } from 'vitest';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Scene } from 'three';
import { SPIKE_WRITES, WriteBufferCensus, normalizeLabel, pendingInstanceRanges } from '../../src/render/WriteBufferCensus.js';

describe('WriteBufferCensus (SPEC-0597)', () => {
  it('drops the three binding id from the label', () => {
    expect(normalizeLabel('bindingBuffer12_object_1')).toBe('bindingBuffer_object_1');
    expect(normalizeLabel('native.view')).toBe('native.view');
    expect(normalizeLabel(undefined)).toBe('?');
    expect(normalizeLabel(undefined, 40)).toBe('?u40');
  });

  it('logs only spike frames, with top labels and the extra counter delta of that frame', () => {
    let frame = 1;
    let full = 0;
    const lines: string[] = [];
    const census = new WriteBufferCensus(() => frame, () => full, (l) => lines.push(l));
    for (let i = 0; i < 10; i++) census.count('native.view');
    frame = 2;
    full = 5;
    for (let i = 0; i < SPIKE_WRITES; i++) census.count(i % 4 === 0 ? 'bindingBuffer_render_1' : 'bindingBuffer_object_1');
    full = 7;
    census.flush(3);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`[wbCensus] spike frame=2 writes=${SPIKE_WRITES} full=2 | bindingBuffer_object_1=750 bindingBuffer_render_1=250`);
    // The top label's writer, sampled once in the frame.
    expect(lines[1]!.startsWith('[wbCensus] stack bindingBuffer_object_1: ')).toBe(true);
  });

  it('lists instanced attributes by pending update ranges, hidden ones included', () => {
    const scene = new Scene();
    const props = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
    props.name = 'props';
    props.visible = false;
    for (let i = 0; i < 5; i++) props.instanceMatrix.addUpdateRange(i * 16, 16);
    const wires = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
    wires.name = 'wires';
    wires.instanceMatrix.addUpdateRange(0, 8 * 16);
    scene.add(props, wires, new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2));
    expect(pendingInstanceRanges(scene)).toEqual([
      { mesh: 'props', attribute: 'instanceMatrix', ranges: 5, count: 8, visible: false },
      { mesh: 'wires', attribute: 'instanceMatrix', ranges: 1, count: 8, visible: true },
    ]);
  });
});
