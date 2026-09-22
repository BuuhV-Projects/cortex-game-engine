import { describe, it, expect, afterEach } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { CasterGeometryRegistry } from '../../src/render/CasterGeometryRegistry.js';
import { geometryId, resetGeometryIds } from '../../src/render/GeometryDesc.js';

/** Registro falso com a forma do `__cortexGeometryRegistry` do host. */
function instalarRegistroFalso() {
  const registradas = new Map<number, unknown>();
  const chamadas = { register: 0, unregister: 0 };
  (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'] = {
    register: (id: number, vertexBuffer: unknown) => {
      chamadas.register++;
      // Espelha o contrato do host: sem buffer de vértice, a entrada é inútil.
      if (!vertexBuffer) return false;
      registradas.set(id, vertexBuffer);
      return true;
    },
    unregister: (id: number) => {
      chamadas.unregister++;
      registradas.delete(id);
    },
    size: () => registradas.size,
  };
  return { registradas, chamadas };
}

/**
 * Backend falso do `three`.
 *
 * O ponto do teste é o TEMPO: os `GPUBuffer` só existem depois de o `three`
 * subir a geometria, então o backend começa vazio e vai ganhando entradas.
 */
function backendFalso() {
  const subidos = new Map<object, { buffer: unknown }>();
  return {
    subidos,
    /** Faz de conta que o `three` subiu esta geometria para a GPU. */
    subir(geometria: BoxGeometry): void {
      const posicao = geometria.getAttribute('position') as unknown as object;
      subidos.set(posicao, { buffer: { nome: 'vertices' } });
      if (geometria.index) subidos.set(geometria.index as unknown as object, { buffer: { nome: 'indices' } });
    },
    get(alvo: unknown) {
      return subidos.get(alvo as object);
    },
  };
}

/** Malha com geometria própria, indexada como as do jogo. */
function malha(): Mesh {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
}

describe('CasterGeometryRegistry', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'];
    resetGeometryIds();
  });

  it('é inerte quando o host não expõe o registro (browser, Studio)', () => {
    const registro = new CasterGeometryRegistry();
    const resultado = registro.atualizar(new Object3D(), backendFalso());
    expect(resultado).toEqual({ registradas: 0, pendentes: 0 });
  });

  it('registra preguiçosamente: tenta de novo nos frames seguintes', () => {
    // Os `GPUBuffer` são do `three` e só existem depois do upload. Uma malha
    // que ainda não foi desenhada não tem buffer nenhum — desistir dela no
    // primeiro frame deixaria o caster para sempre fora do registro.
    const { registradas } = instalarRegistroFalso();
    const backend = backendFalso();
    const cena = new Object3D();
    const cedo = malha();
    const tarde = malha();
    cena.add(cedo, tarde);
    backend.subir(cedo.geometry as BoxGeometry);

    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cena, backend)).toEqual({ registradas: 1, pendentes: 1 });

    // Frame seguinte: o `three` subiu a segunda malha.
    backend.subir(tarde.geometry as BoxGeometry);
    expect(registro.atualizar(cena, backend)).toEqual({ registradas: 2, pendentes: 0 });
    expect(registradas.size).toBe(2);
  });

  it('registra por GEOMETRIA, não por malha', () => {
    // As quatro rodas de um carro compartilham a mesma `BufferGeometry` e
    // recebem o mesmo id; registrar por malha repetiria o mesmo registro.
    const { chamadas } = instalarRegistroFalso();
    const backend = backendFalso();
    const geometria = new BoxGeometry(1, 1, 1);
    const cena = new Object3D();
    for (let i = 0; i < 4; i++) cena.add(new Mesh(geometria, new MeshBasicMaterial()));
    backend.subir(geometria);

    const resultado = new CasterGeometryRegistry().atualizar(cena, backend);

    expect(resultado.registradas).toBe(1);
    expect(chamadas.register).toBe(1);
  });

  it('inclui a malha que o filtro angular desligou no frame', () => {
    // O culling da SPEC-0197 liga e desliga `castShadow` a cada 10 frames.
    // Registrar só quem projeta AGORA deixaria de fora justamente a malha que
    // volta a projetar no frame seguinte — e ela voltaria sem registro.
    instalarRegistroFalso();
    const backend = backendFalso();
    const cena = new Object3D();
    const desligada = malha();
    desligada.castShadow = false;
    cena.add(desligada);
    backend.subir(desligada.geometry as BoxGeometry);

    expect(new CasterGeometryRegistry().atualizar(cena, backend).registradas).toBe(1);
  });

  it('invalida o registro quando a geometria é descartada', () => {
    // Largar o handle no `dispose` é seguro com folga: o `destroy` de buffer do
    // host é adiado em 10 frames (ADR-0153). Não largar seria guardar um
    // ponteiro para um buffer destruído.
    const { registradas, chamadas } = instalarRegistroFalso();
    const backend = backendFalso();
    const cena = new Object3D();
    const alvo = malha();
    cena.add(alvo);
    backend.subir(alvo.geometry as BoxGeometry);

    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backend);
    const id = geometryId(alvo.geometry);
    expect(registradas.has(id)).toBe(true);

    alvo.geometry.dispose();

    expect(chamadas.unregister).toBe(1);
    expect(registradas.has(id)).toBe(false);
    expect(registro.total).toBe(0);
  });

  it('não insiste numa geometria que o HOST recusa', () => {
    // Recusa do host (entrada sem nada a desenhar) é definitiva: a geometria
    // sai da fila. Insistir todo frame seria trabalho puro, e o gate já recusa
    // o passe por geometria ausente — o objeto fica com o `three`.
    //
    // É diferente de `geometryBuffers` devolver `null`: ali o motivo pode ser
    // só "o `three` ainda não subiu", que é temporário e TEM de ser tentado de
    // novo. Os dois casos não se distinguem de fora, então o registro só
    // desiste do que o host disse "não" em cima de buffers que já existem.
    const chamadas = { register: 0 };
    (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'] = {
      register: () => {
        chamadas.register++;
        return false;
      },
      unregister: () => {},
      size: () => 0,
    };
    const backend = backendFalso();
    const cena = new Object3D();
    const alvo = malha();
    cena.add(alvo);
    backend.subir(alvo.geometry as BoxGeometry);

    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cena, backend)).toEqual({ registradas: 0, pendentes: 0 });
    registro.atualizar(cena, backend);

    expect(chamadas.register).toBe(1); // não tentou de novo
    expect(registro.total).toBe(0);
  });

  it('segue tentando enquanto o `three` não subiu a geometria', () => {
    // O contraponto do teste acima: `geometryBuffers` devolvendo `null` não
    // pode virar desistência, senão a malha que só é desenhada mais tarde fica
    // fora do registro para sempre — e vira sombra faltando quando o passe
    // nativo assumir.
    instalarRegistroFalso();
    const backend = backendFalso();
    const cena = new Object3D();
    const alvo = malha();
    cena.add(alvo);

    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cena, backend).pendentes).toBe(1);
    expect(registro.atualizar(cena, backend).pendentes).toBe(1);

    backend.subir(alvo.geometry as BoxGeometry);
    expect(registro.atualizar(cena, backend)).toEqual({ registradas: 1, pendentes: 0 });
  });

  it('esquece tudo na troca de cena, sem liberar buffer nenhum', () => {
    const { registradas } = instalarRegistroFalso();
    const backend = backendFalso();
    const cena = new Object3D();
    const alvo = malha();
    cena.add(alvo);
    backend.subir(alvo.geometry as BoxGeometry);

    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backend);
    registro.limpar();

    expect(registro.total).toBe(0);
    // O `limpar` é do lado JS: os buffers continuam sendo do `three`, e o host
    // guarda o que guardou — quem esquece a tabela dele é o `clear` da ponte.
    expect(registradas.size).toBe(1);

    // E o ouvinte de `dispose` foi removido: descartar agora não desregistra
    // nada por baixo de uma cena nova que talvez já tenha o mesmo id.
    alvo.geometry.dispose();
    expect(registradas.size).toBe(1);
  });
});
