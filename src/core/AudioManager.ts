/**
 * AudioManager — gerencia o sistema de áudio usando THREE.AudioListener.
 *
 * Encapsula a criação de sons globais (`THREE.Audio`) e sons posicionais
 * (`THREE.PositionalAudio`), além do controle de volume mestre.
 *
 * O `AudioListener` deve ser adicionado à câmera principal após instanciar
 * esta classe:
 *
 * ```ts
 * const audio = new AudioManager();
 * camera.add(audio.listener);
 * ```
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001); o
 * restante do motor usa os tipos retornados sem importar Three.js diretamente.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
 */

import * as THREE from 'three';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Opções para criação de um som não-posicional. */
export interface SoundOptions {
  /**
   * Indica se o som deve ser reproduzido em loop.
   * @default false
   */
  loop?: boolean;
  /**
   * Volume inicial do som, de `0` (silêncio) a `1` (máximo).
   * @default 1
   */
  volume?: number;
}

// ─── Classe AudioManager ───────────────────────────────────────────────────────

export class AudioManager {
  private readonly _listener: THREE.AudioListener;

  /** Volume salvo antes de `muteAll()` para restauração em `unmuteAll()`. */
  private _savedVolume: number = 1;

  /** Flag que indica se o áudio está atualmente silenciado. */
  private _muted: boolean = false;

  constructor() {
    this._listener = new THREE.AudioListener();
  }

  // ─── Criação de sons ─────────────────────────────────────────────────────────

  /**
   * Cria um som **não-posicional** (global) — ideal para trilha sonora e
   * efeitos de UI que não devem sofrer atenuação espacial.
   *
   * O som é associado ao `AudioListener` interno mas **não** é adicionado à
   * cena automaticamente; adicione-o a um `Object3D` se precisar vinculá-lo
   * ao grafo de cena.
   *
   * @param audioBuffer - Buffer de áudio previamente carregado (ex.: via
   *   `AssetLoader.loadAudio()`).
   * @param options - Opções de loop e volume iniciais.
   * @returns Instância de `THREE.Audio` pronta para uso.
   *
   * @example
   * const music = audioManager.createSound(buffer, { loop: true, volume: 0.4 });
   * music.play();
   */
  createSound(audioBuffer: AudioBuffer, { loop = false, volume = 1 }: SoundOptions = {}): THREE.Audio {
    const sound = new THREE.Audio(this._listener);
    sound.setBuffer(audioBuffer);
    sound.setLoop(loop);
    sound.setVolume(volume);
    return sound;
  }

  /**
   * Cria um som **posicional** e o adiciona como filho do `entity` fornecido.
   *
   * O som herdará a posição do `entity` no espaço 3D, permitindo atenuação e
   * panoramização automáticas pelo `THREE.AudioListener`.
   *
   * @param audioBuffer - Buffer de áudio previamente carregado.
   * @param entity - Objeto Three.js (`Object3D`, `Mesh`, `Group`, etc.) ao
   *   qual o som será ancorado na cena.
   * @returns Instância de `THREE.PositionalAudio` já adicionada ao `entity`.
   *
   * @example
   * const explosion = audioManager.createPositionalSound(buffer, mesh);
   * explosion.play();
   */
  createPositionalSound(audioBuffer: AudioBuffer, entity: THREE.Object3D): THREE.PositionalAudio {
    const sound = new THREE.PositionalAudio(this._listener);
    sound.setBuffer(audioBuffer);
    entity.add(sound);
    return sound;
  }

  // ─── Controle de volume mestre ───────────────────────────────────────────────

  /**
   * Define o volume mestre aplicado a **todos** os sons gerenciados por este
   * `AudioListener`.
   *
   * @param v - Valor entre `0` (silêncio) e `1` (volume máximo). Valores fora
   *   desse intervalo são aceitos pelo Web Audio API mas podem distorcer o som.
   */
  setMasterVolume(v: number): void {
    this._listener.setMasterVolume(v);
  }

  /**
   * Silencia todos os sons definindo o volume mestre para `0`.
   *
   * O volume anterior é salvo internamente e pode ser restaurado via
   * `unmuteAll()`. Chamadas repetidas sem `unmuteAll()` intermediário são
   * ignoradas para não sobrescrever o volume salvo.
   */
  muteAll(): void {
    if (this._muted) return;
    this._savedVolume = this._listener.getMasterVolume();
    this._listener.setMasterVolume(0);
    this._muted = true;
  }

  /**
   * Restaura o volume mestre ao valor anterior à última chamada de `muteAll()`.
   *
   * Sem efeito se `muteAll()` não foi chamado anteriormente.
   */
  unmuteAll(): void {
    if (!this._muted) return;
    this._listener.setMasterVolume(this._savedVolume);
    this._muted = false;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  /**
   * Instância interna do `THREE.AudioListener`.
   *
   * Deve ser adicionado à câmera principal para que os cálculos espaciais de
   * áudio funcionem corretamente:
   * ```ts
   * camera.add(audioManager.listener);
   * ```
   */
  get listener(): THREE.AudioListener {
    return this._listener;
  }

  /**
   * Indica se o áudio está atualmente silenciado via `muteAll()`.
   */
  get muted(): boolean {
    return this._muted;
  }
}
