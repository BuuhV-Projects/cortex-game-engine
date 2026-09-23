/**
 * Registro de geometria dos casters de sombra (SPEC-0245, E2 do passo 2).
 *
 * O passe de sombra nativo precisa da geometria de **todos** os casters: uma
 * que falte não é um objeto a menos na tabela, é uma **sombra faltando** na
 * imagem — e é por isso que o gate (E3) recusa o frame enquanto houver
 * geometria ausente.
 *
 * Três cuidados, cada um pago por um modo de falha conhecido:
 *
 * 1. **Os `GPUBuffer` são do `three` e só existem depois do upload.** Uma
 *    malha que ainda não foi desenhada não tem buffer nenhum, então o registro
 *    é PREGUIÇOSO: quem não deu certo continua na lista de pendentes e é
 *    tentado de novo nos frames seguintes, até entrar.
 * 2. **Invalidação quando a geometria é descartada.** O `dispose` da
 *    `BufferGeometry` é o sinal, e desregistrar ali é seguro com folga: o
 *    `destroy` de buffer do host é ADIADO em 10 frames (ADR-0153, ver
 *    `buffers.cpp`), então o handle que a tabela larga ainda sobreviveria a
 *    vários frames de desenho. Largar cedo demais custa uma recusa do gate;
 *    largar tarde demais seria desenhar com um buffer destruído.
 * 3. **Nada aqui é dono de buffer.** Quem criou e quem destrói é o `three`,
 *    pelo caminho normal dele — este módulo só guarda o vínculo id → buffers.
 */
import type * as THREE from 'three';
import { debug } from '../core/debug.js';
import { geometryBuffers, geometryId } from './GeometryDesc.js';

/** A parte do `__cortexGeometryRegistry` que este módulo usa. */
interface PonteDoRegistro {
  register(
    id: number,
    vertexBuffer: unknown,
    indexBuffer: unknown,
    indexCount: number,
    vertexCount: number,
    indexIs32Bit: boolean,
    vertexStride: number,
    vertexOffset: number,
  ): boolean;
  unregister(id: number): void;
  size(): number;
}

/** O backend do `three`, de onde saem os handles de GPU. */
interface BackendComAtributos {
  get(alvo: unknown): { buffer?: unknown } | undefined;
}

/** Uma `BufferGeometry` que avisa quando é descartada. */
type GeometriaComEventos = THREE.BufferGeometry & {
  addEventListener?(tipo: string, ouvinte: () => void): void;
  removeEventListener?(tipo: string, ouvinte: () => void): void;
};

function ponte(): PonteDoRegistro | null {
  return (
    (globalThis as { __cortexGeometryRegistry?: PonteDoRegistro }).__cortexGeometryRegistry ?? null
  );
}

/** O que a última passada de {@link CasterGeometryRegistry.atualizar} fez. */
export interface RegistroDeCasters {
  /** Geometrias distintas registradas até agora. */
  registradas: number;
  /** Geometrias que ainda não tinham buffer e serão tentadas de novo. */
  pendentes: number;
}

/**
 * Mantém o registro de geometria em dia para os casters da cena.
 *
 * Guarda o estado entre frames de propósito: a varredura da cena roda UMA vez
 * e, a partir daí, o trabalho por frame é proporcional ao que ainda falta —
 * zero quando tudo entrou, que é o regime normal depois dos primeiros frames.
 */
export class CasterGeometryRegistry {
  /** Geometrias ainda sem buffer. `null` = a cena nem foi varrida. */
  private _pendentes: THREE.BufferGeometry[] | null = null;
  /** id → remover o ouvinte de `dispose`, para não vazar o ouvinte. */
  private readonly _registradas = new Map<number, () => void>();
  /** Último relato emitido, para não repetir a mesma linha todo frame. */
  private _ultimoRelato = '';

  /** Geometrias distintas registradas. */
  get total(): number {
    return this._registradas.size;
  }

  /** Geometrias que ainda esperam o upload do `three`. */
  get pendentes(): number {
    return this._pendentes?.length ?? 0;
  }

  /**
   * Tenta registrar o que falta. Barato quando não falta nada.
   *
   * @param cena - A cena a varrer (só na primeira chamada).
   * @param backend - O backend do `three` (`renderer.backend`).
   */
  atualizar(cena: THREE.Object3D, backend: BackendComAtributos): RegistroDeCasters {
    const api = ponte();
    if (!api) return { registradas: 0, pendentes: 0 };

    if (this._pendentes === null) this._pendentes = this._varrer(cena);

    // Percorre de trás para frente: remover o que entrou não desloca o resto,
    // e assim a lista encolhe sem uma cópia por frame.
    for (let i = this._pendentes.length - 1; i >= 0; i--) {
      const geometria = this._pendentes[i]!;
      const buffers = geometryBuffers(backend, geometria);
      // Sem buffer ainda: o `three` não subiu esta malha. Fica pendente — e é
      // o gate que impede o passe de assumir enquanto isso.
      if (!buffers) continue;

      const id = geometryId(geometria);
      const ok = api.register(
        id,
        buffers.vertexBuffer,
        buffers.indexBuffer,
        buffers.indexCount,
        buffers.vertexCount,
        buffers.indexIs32Bit,
        buffers.vertexStride,
        buffers.vertexOffset,
      );
      // Recusado pelo host (entrada sem nada a desenhar): sai da fila do mesmo
      // jeito. Insistir todo frame numa geometria que o registro rejeita seria
      // trabalho puro, e o gate já recusa o frame por geometria ausente.
      this._pendentes.splice(i, 1);
      if (ok) this._registrar(api, id, geometria);
    }

    this._relatar();
    return { registradas: this._registradas.size, pendentes: this._pendentes.length };
  }

  /** Esquece tudo (troca de cena). Não libera buffer nenhum — não são nossos. */
  limpar(): void {
    for (const remover of this._registradas.values()) remover();
    this._registradas.clear();
    this._pendentes = null;
    this._ultimoRelato = '';
  }

  /**
   * Geometrias distintas dos nós que podem virar caster.
   *
   * Vai por geometria, e não por malha: as quatro rodas de um carro
   * compartilham a mesma `BufferGeometry` e recebem o mesmo id — registrar por
   * malha repetiria o mesmo registro quatro vezes.
   *
   * O filtro é DELIBERADAMENTE largo (qualquer malha com geometria, sem olhar
   * `castShadow`): o filtro angular da SPEC-0197 liga e desliga `castShadow` a
   * cada 10 frames, então restringir aqui deixaria de fora justamente a malha
   * que volta a projetar no frame seguinte — e ela voltaria SEM registro.
   */
  private _varrer(cena: THREE.Object3D): THREE.BufferGeometry[] {
    const vistas = new Set<THREE.BufferGeometry>();
    cena.traverse((objeto) => {
      const malha = objeto as THREE.Mesh;
      if (malha.isMesh && malha.geometry) vistas.add(malha.geometry);
    });
    return [...vistas];
  }

  /** Guarda o vínculo e passa a ouvir o descarte da geometria. */
  private _registrar(api: PonteDoRegistro, id: number, geometria: THREE.BufferGeometry): void {
    if (this._registradas.has(id)) return;
    const comEventos = geometria as GeometriaComEventos;
    const aoDescartar = (): void => {
      api.unregister(id);
      this._registradas.delete(id);
      comEventos.removeEventListener?.('dispose', aoDescartar);
    };
    comEventos.addEventListener?.('dispose', aoDescartar);
    this._registradas.set(id, () => {
      comEventos.removeEventListener?.('dispose', aoDescartar);
    });
  }

  /** Relata só quando o número muda — senão seriam 60 linhas iguais por segundo. */
  private _relatar(): void {
    const linha = `registradas=${this._registradas.size} pendentes=${this._pendentes?.length ?? 0}`;
    if (linha === this._ultimoRelato) return;
    this._ultimoRelato = linha;
    debug('perf', `[casterGeometry] ${linha}`);
  }
}
