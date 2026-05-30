import type { AssetLoader, AudioManager } from 'cortex-game-engine'

/**
 * Pool de áudio one-shot pra efeitos repetidos (tiros, ataques).
 *
 * Pra cada som, mantém N instâncias de `THREE.Audio` ligadas ao mesmo
 * buffer. `play(name)` pega a próxima instância em round-robin, para se
 * estiver tocando e dispara — assim suporta sobreposição (até N tiros
 * simultâneos).
 *
 * Música em loop usa instância dedicada via `playLoop` (não polifônica).
 */

type Audio = ReturnType<AudioManager['createSound']>

export class Sfx {
  private pools = new Map<string, Audio[]>()
  private cursors = new Map<string, number>()
  private loops = new Map<string, Audio>()

  constructor(private audioMgr: AudioManager) {}

  async loadOneShot(
    loader: AssetLoader,
    name: string,
    url: string,
    poolSize = 4,
  ): Promise<void> {
    try {
      const buf = await loader.loadAudio(url)
      const pool: Audio[] = []
      for (let i = 0; i < poolSize; i++) {
        pool.push(this.audioMgr.createSound(buf, { loop: false, volume: 1 }))
      }
      this.pools.set(name, pool)
      this.cursors.set(name, 0)
    } catch (e) {
      console.warn(`[sfx] falha carregando ${url}`, e)
    }
  }

  play(name: string, volume = 1): void {
    const pool = this.pools.get(name)
    if (!pool || pool.length === 0) return
    const idx = this.cursors.get(name) ?? 0
    const a = pool[idx]!
    try {
      if (a.isPlaying) a.stop()
      a.setVolume(volume)
      a.play()
    } catch (e) {
      console.warn(`[sfx] falha tocando ${name}`, e)
    }
    this.cursors.set(name, (idx + 1) % pool.length)
  }

  async playLoop(
    loader: AssetLoader,
    name: string,
    url: string,
    volume = 0.3,
  ): Promise<void> {
    try {
      const buf = await loader.loadAudio(url)
      const existing = this.loops.get(name)
      if (existing) {
        try {
          existing.stop()
        } catch {
          /* ignore */
        }
      }
      const a = this.audioMgr.createSound(buf, { loop: true, volume })
      a.play()
      this.loops.set(name, a)
    } catch (e) {
      console.warn(`[sfx] falha tocando loop ${url}`, e)
    }
  }

  setLoopVolume(name: string, volume: number): void {
    const a = this.loops.get(name)
    if (a) a.setVolume(volume)
  }

  stopAll(): void {
    for (const pool of this.pools.values()) {
      for (const a of pool) {
        try {
          a.stop()
        } catch {
          /* ignore */
        }
      }
    }
    for (const a of this.loops.values()) {
      try {
        a.stop()
      } catch {
        /* ignore */
      }
    }
  }
}
