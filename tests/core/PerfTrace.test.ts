/**
 * Testes do perf trace (src/core/PerfTrace.ts, SPEC-0198): a amostra sai com os
 * campos certos, os visíveis são agrupados POR NÓ DE CENA e ordenados por custo,
 * e o que está fora do frustum não entra.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Scene,
  Mesh,
  Object3D,
  BoxGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import { PerfTrace, buildSample, collectVisible } from '../../src/core/PerfTrace.js';
import { FrameProfiler } from '../../src/core/FrameProfiler.js';

/** Nó de cena como o `buildScene` monta: nome = id + flag no userData. */
function sceneNode(id: string, meshCount: number, x: number): Object3D {
  const node = new Object3D();
  node.name = id;
  node.userData['cortexSceneNode'] = true;
  node.position.set(x, 0, 0);
  for (let i = 0; i < meshCount; i++) {
    node.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  }
  return node;
}

/** Câmera olhando para -Z a partir da origem. */
function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -10);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('collectVisible', () => {
  it('agrupa as sub-malhas POR nó de cena e soma os triângulos', () => {
    const scene = new Scene();
    const node = sceneNode('arvore-1', 3, 0);
    node.position.set(0, 0, -10); // à frente da câmera
    scene.add(node);
    scene.updateMatrixWorld(true);

    const visible = collectVisible(scene, camera());

    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe('arvore-1');
    expect(visible[0]!.meshes).toBe(3);
    expect(visible[0]!.tris).toBe(36); // 3 caixas × 12 triângulos
  });

  it('não inclui o que está fora do frustum', () => {
    const scene = new Scene();
    const front = sceneNode('na-tela', 1, 0);
    front.position.set(0, 0, -10);
    const behind = sceneNode('atras-da-camera', 1, 0);
    behind.position.set(0, 0, 50);
    scene.add(front, behind);
    scene.updateMatrixWorld(true);

    const ids = collectVisible(scene, camera()).map((v) => v.id);

    expect(ids).toContain('na-tela');
    expect(ids).not.toContain('atras-da-camera');
  });

  it('ignora malha invisível', () => {
    const scene = new Scene();
    const node = sceneNode('oculto', 2, 0);
    node.position.set(0, 0, -10);
    (node.children[0] as Mesh).visible = false;
    scene.add(node);
    scene.updateMatrixWorld(true);

    expect(collectVisible(scene, camera())[0]!.meshes).toBe(1);
  });

  it('ignora subárvore de pai invisível (o `visible` do three é herdado)', () => {
    // Caso real: as variantes de roda da garagem ficam TODAS na cena, com só um
    // modelo visível. As malhas dentro dos escondidos seguem `visible: true` e
    // não desenham — contá-las inflava o diagnóstico (SPEC-0213).
    const scene = new Scene();
    const node = sceneNode('roda', 1, 0);
    node.position.set(0, 0, -10);
    const escondida = new Object3D();
    escondida.visible = false;
    escondida.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    node.add(escondida);
    scene.add(node);
    scene.updateMatrixWorld(true);

    expect(collectVisible(scene, camera())[0]!.meshes).toBe(1);
  });

  it('ordena do mais caro (triângulos) pro menos', () => {
    const scene = new Scene();
    const small = sceneNode('pequeno', 1, -2);
    small.position.set(-2, 0, -10);
    const big = sceneNode('grande', 5, 2);
    big.position.set(2, 0, -10);
    scene.add(small, big);
    scene.updateMatrixWorld(true);

    const visible = collectVisible(scene, camera());

    expect(visible[0]!.id).toBe('grande');
    expect(visible[1]!.id).toBe('pequeno');
  });
});

describe('buildSample', () => {
  it('monta a amostra com fps derivado do frame e tempos arredondados', () => {
    const sample = buildSample({
      timeMs: 1234.7,
      frameMs: 20,
      cpu: { render: 18.456, world: 1.234 },
      draws: 2189,
      tris: 4770000,
      camera: camera(),
      visible: [{ id: 'rodoviaria', meshes: 7, tris: 13712 }],
    });

    expect(sample.t).toBe(1235);
    expect(sample.fps).toBe(50);
    expect(sample.cpu['render']).toBe(18.5);
    expect(sample.draws).toBe(2189);
    expect(sample.visible[0]!.id).toBe('rodoviaria');
    expect(sample.cam.dz).toBeCloseTo(-1, 1); // olhando pra -Z
  });

  it('não divide por zero quando o frame tem duração zero', () => {
    const sample = buildSample({
      timeMs: 0, frameMs: 0, cpu: {}, draws: 0, tris: 0, camera: camera(), visible: [],
    });
    expect(sample.fps).toBe(0);
  });
});

describe('PerfTrace', () => {
  const g = globalThis as { __cortexPerfTrace?: unknown };

  afterEach(() => {
    delete g.__cortexPerfTrace;
  });

  it('sem a ponte do host, não coleta nada (custo zero fora do modo métricas)', () => {
    const trace = new PerfTrace();
    expect(trace.enabled).toBe(false);
    // Uma cena grande passaria aqui sem nenhum traverse: o teste garante que
    // chamar tick é seguro e silencioso.
    expect(() => trace.tick(16, new Scene(), camera(), new FrameProfiler(), null)).not.toThrow();
  });

  describe('com a ponte registrada', () => {
    let lines: string[];

    beforeEach(() => {
      lines = [];
      g.__cortexPerfTrace = (line: string) => lines.push(line);
    });

    it('grava uma linha JSONL por intervalo, não por frame', () => {
      const trace = new PerfTrace();
      const scene = new Scene();
      const node = sceneNode('pista', 1, 0);
      node.position.set(0, 0, -10);
      scene.add(node);
      scene.updateMatrixWorld(true);
      const cam = camera();
      const profiler = new FrameProfiler();

      // 10 frames de 16 ms = 160 ms: ainda não completou o intervalo (500 ms).
      for (let i = 0; i < 10; i++) trace.tick(16, scene, cam, profiler, null);
      expect(lines).toHaveLength(0);

      // Mais 22 frames passam de 500 ms → uma amostra.
      for (let i = 0; i < 22; i++) trace.tick(16, scene, cam, profiler, null);
      expect(lines).toHaveLength(1);

      const sample = JSON.parse(lines[0]!);
      expect(sample.visible[0].id).toBe('pista');
      expect(sample.frameMs).toBe(16);
    });

    it('a linha é JSON válido de uma linha só (JSONL)', () => {
      const trace = new PerfTrace();
      const scene = new Scene();
      trace.tick(600, scene, camera(), new FrameProfiler(), { drawCalls: 5, triangles: 10 });

      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('\n');
      expect(() => JSON.parse(lines[0]!)).not.toThrow();
      expect(JSON.parse(lines[0]!).draws).toBe(5);
    });
  });
});
