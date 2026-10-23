import { describe, it, expect } from 'vitest';
import { DrawBatch, type BatchRoLike, type DrawBatchBridge } from '../../src/render/DrawBatch.js';

/** Ponte falsa: registra receitas e o que cada `flush` emitiria. */
function ponteFalsa() {
  const receitas = new Map<number, { pipeline: unknown; groups: unknown[]; vbs: unknown[]; index: unknown; index32: boolean }>();
  const flushes: { pass: unknown; cmds: number[][] }[] = [];
  const soltas: number[] = [];
  let proximo = 0;
  const bridge: DrawBatchBridge = {
    record: (pipeline, groups, vbs, index, index32) => {
      const id = proximo++;
      receitas.set(id, { pipeline, groups: [...groups], vbs: [...vbs], index, index32 });
      return id;
    },
    release: (id) => {
      soltas.push(id);
      receitas.delete(id);
    },
    flush: (pass, commands, count) => {
      const cmds: number[][] = [];
      for (let i = 0; i < count; i++) cmds.push(Array.from(commands.subarray(i * 4, i * 4 + 4)));
      flushes.push({ pass, cmds });
      return count;
    },
  };
  return { bridge, receitas, flushes, soltas };
}

/** Backend falso: `get` devolve o "dado de backend" de cada objeto do three. */
function backendFalso() {
  const dados = new Map<unknown, Record<string, unknown>>();
  const get = (o: unknown): Record<string, unknown> => {
    let d = dados.get(o);
    if (!d) {
      d = {};
      dados.set(o, d);
    }
    return d;
  };
  const ativos = new Map<unknown, unknown>();
  return { backend: { get, pipelineUtils: { _activePipelines: ativos } }, get, ativos };
}

function roFalso(get: (o: unknown) => Record<string, unknown>, nome: string, index: Uint16Array | Uint32Array | null = new Uint16Array(3)) {
  const context = { nome: 'ctx' };
  const pipeline = { nome: `pipe-${nome}` };
  const grupoCamera = { bindings: [{ groupNode: { shared: true } }] };
  const grupoObjeto = { bindings: [{ groupNode: { shared: false } }] };
  const vb = { nome: `vb-${nome}` };
  const indice = index ? { array: index } : null;
  get(pipeline)['pipeline'] = `GPU-pipe-${nome}`;
  get(grupoCamera)['group'] = 'GPU-camera';
  get(grupoObjeto)['group'] = `GPU-obj-${nome}`;
  get(vb)['buffer'] = `GPU-vb-${nome}`;
  if (indice) get(indice)['buffer'] = `GPU-ib-${nome}`;
  get(context)['currentPass'] = 'PASS';
  const params = { vertexCount: 36, firstVertex: 0, instanceCount: 1 };
  const ro: BatchRoLike & { params: typeof params } = {
    object: {},
    material: {},
    pipeline,
    context,
    camera: {},
    params,
    getBindings: () => [grupoCamera, grupoObjeto],
    getVertexBuffers: () => [vb],
    getIndex: () => indice,
    getIndirect: () => null,
    getDrawParameters: () => params,
  };
  return { ro, context, grupoCamera, grupoObjeto };
}

const info = () => {
  const chamadas: number[][] = [];
  return { chamadas, update: (_o: unknown, c: number, n: number) => void chamadas.push([c, n]) };
};

describe('DrawBatch', () => {
  it('grava, acumula, despacha numa chamada e zera o currentSets do three', () => {
    const { bridge, receitas, flushes } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    const b = roFalso(get, 'b', new Uint32Array(3));
    b.ro.context = a.context;
    lote.capture(a.ro);
    lote.capture(b.ro);
    expect(receitas.size).toBe(2);
    expect(receitas.get(0)).toMatchObject({ pipeline: 'GPU-pipe-a', groups: ['GPU-camera', 'GPU-obj-a'], vbs: ['GPU-vb-a'], index: 'GPU-ib-a', index32: false });
    expect(receitas.get(1)!.index32).toBe(true);

    const i = info();
    get(a.context)['currentSets'] = { pipeline: 'algo' };
    expect(lote.add(a.ro, i)).toBe(true);
    b.ro.getDrawParameters = () => ({ vertexCount: 12, firstVertex: 6, instanceCount: 3 });
    expect(lote.add(b.ro, i)).toBe(true);
    expect(flushes.length).toBe(0);
    lote.flush();
    expect(flushes).toEqual([{ pass: 'PASS', cmds: [[0, 36, 1, 0], [1, 12, 3, 6]] }]);
    expect(get(a.context)['currentSets']).toEqual({ attributes: {}, bindingGroups: [], pipeline: null, index: null });
    expect(i.chamadas).toEqual([[36, 1], [12, 3]]); // info.update igual ao do three
    lote.flush();
    expect(flushes.length).toBe(1); // vazio não atravessa a ponte
  });

  it('despachar esquece o pipeline ativo do pass (senão o three desenha com o da última receita)', () => {
    const { bridge } = ponteFalsa();
    const { backend, get, ativos } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    lote.capture(a.ro);
    ativos.set('PASS', 'pipeline-do-three');
    lote.add(a.ro, info());
    lote.flush();
    expect(ativos.has('PASS')).toBe(false);
  });

  it('sem o cache de pipeline do three, o lote não é suportado', async () => {
    const { batchBackendSupported } = await import('../../src/render/DrawBatch.js');
    expect(batchBackendSupported({ get: () => ({}) })).toBe(false);
    expect(batchBackendSupported(backendFalso().backend)).toBe(true);
  });

  it('só regrava quando um handle muda, e solta a receita velha', () => {
    const { bridge, receitas, soltas } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    lote.capture(a.ro);
    lote.capture(a.ro);
    expect(lote.stats.recorded).toBe(1);
    get(a.grupoObjeto)['group'] = 'GPU-obj-a2'; // o three recriou o bind group
    lote.capture(a.ro);
    expect(lote.stats.recorded).toBe(2);
    expect(soltas).toEqual([0]);
    expect(receitas.get(1)!.groups[1]).toBe('GPU-obj-a2');
  });

  it('grupo compartilhado recriado no quadro devolve o desenho ao three', () => {
    const { bridge } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    lote.capture(a.ro);
    get(a.grupoCamera)['group'] = 'GPU-camera-nova';
    expect(lote.add(a.ro, info())).toBe(false);
  });

  it('sem receita, sem pass, com oclusão, indireto ou stencil: fica no three', () => {
    const { bridge } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    expect(lote.add(a.ro, info())).toBe(false); // nunca gravado
    lote.capture(a.ro);
    get(a.context)['occlusionQuerySet'] = {};
    expect(lote.add(a.ro, info())).toBe(false);
    const ind = roFalso(get, 'ind');
    ind.ro.getIndirect = () => ({});
    lote.capture(ind.ro);
    expect(lote.stats.recorded).toBe(1);
    const st = roFalso(get, 'st');
    st.ro.material = { stencilWrite: true };
    lote.capture(st.ro);
    expect(lote.stats.recorded).toBe(1);
  });

  it('pass novo despacha o lote do pass anterior', () => {
    const { bridge, flushes } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    lote.capture(a.ro);
    lote.add(a.ro, info());
    get(a.context)['currentPass'] = 'PASS-2';
    lote.add(a.ro, info());
    expect(flushes.map((f) => f.pass)).toEqual(['PASS']);
    lote.flush();
    expect(flushes.map((f) => f.pass)).toEqual(['PASS', 'PASS-2']);
  });

  it('forget despacha o pendente antes de soltar a receita', () => {
    const { bridge, flushes, soltas } = ponteFalsa();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const a = roFalso(get, 'a');
    lote.capture(a.ro);
    lote.add(a.ro, info());
    lote.forget(a.ro);
    expect(flushes.length).toBe(1);
    expect(soltas).toEqual([0]);
    expect(lote.add(a.ro, info())).toBe(false);
  });
});

describe('DrawBatch — fila opaca nativa (ADR-0363)', () => {
  function comFila() {
    const p = ponteFalsa();
    const fila: { cmds: number[][]; keys: number[][] }[] = [];
    const emissoes: string[] = [];
    p.bridge.queue = (commands, keys, count) => {
      const cmds: number[][] = [];
      const ks: number[][] = [];
      for (let i = 0; i < count; i++) {
        cmds.push(Array.from(commands.subarray(i * 4, i * 4 + 4)));
        ks.push(Array.from(keys.subarray(i * 3, i * 3 + 3)));
      }
      fila.push({ cmds, keys: ks });
      return count; // uma chave só: já está ordenada
    };
    p.bridge.emitNext = (pass, n) => (emissoes.push(`proximos ${pass} ${n}`), n);
    return { ...p, fila, emissoes };
  }

  it('acumula comando + chave de sort, manda no fim da projeção e emite intercalado invalidando os caches do three', () => {
    const { bridge, fila, emissoes } = comFila();
    const { backend, get, ativos } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    expect(lote.queueSupported).toBe(true);
    const { ro, context } = roFalso(get, 'a');
    lote.capture(ro);
    const i = info();
    expect(lote.queueOpaque(ro, i, 0, 0.5, 42)).toBe(true);
    expect(i.chamadas).toEqual([[36, 1]]);
    lote.sendQueue();
    expect(fila).toEqual([{ cmds: [[0, 36, 1, 0]], keys: [[0, 0.5, 42]] }]);
    expect(lote.queuePending).toBe(true);
    ativos.set('PASS', 'pipeline-do-three');
    lote.emitQueued(context, false, 0, 0.4, 7); // item do three ANTES do da fila: nada cruza a ponte
    expect(emissoes).toEqual([]);
    expect(ativos.has('PASS')).toBe(true);
    lote.emitQueued(context, false, 0, 0.9, 7);
    expect(emissoes).toEqual(['proximos PASS 1']);
    expect(get(context)['currentSets']).toEqual({ attributes: {}, bindingGroups: [], pipeline: null, index: null });
    expect(ativos.has('PASS')).toBe(false);
    expect(lote.queuePending).toBe(false);
    lote.emitQueued(context, true); // nada pendente: não atravessa a ponte
    expect(emissoes).toHaveLength(1);
  });

  it('sem receita, ou com grupo compartilhado recriado, fica na RenderList', () => {
    const { bridge } = comFila();
    const { backend, get } = backendFalso();
    const lote = new DrawBatch(bridge, backend);
    const { ro, grupoCamera } = roFalso(get, 'b');
    expect(lote.queueOpaque(ro, info(), 0, 0, 1)).toBe(false);
    lote.capture(ro);
    get(grupoCamera)['group'] = 'GPU-camera-nova';
    expect(lote.queueOpaque(ro, info(), 0, 0, 1)).toBe(false);
  });
});
