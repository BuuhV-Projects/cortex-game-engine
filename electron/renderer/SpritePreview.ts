import { h, icon } from './ui'

/**
 * Preview/Player de **spritesheet 2D** (rota A, sem metadado): abre um `.png`/
 * `.jpg`/`.gif` como uma **grade de frames** de tamanho fixo e toca a animação
 * (play/pause, fps, loop, scrub por frame). A grade (colunas×linhas) é editável
 * — espelha o {@link Spritesheet} do runtime (frame 0 = topo-esquerda, da
 * esquerda pra direita). Mirror 2D do `GlbPreview`: mesmo overlay, mesma playbar.
 *
 * É acionado por um botão "Spritesheet" no preview de imagem (não automático:
 * um PNG comum continua abrindo como imagem estática). Sem dependência de WebGL
 * — desenha o frame atual num `<canvas>` 2D.
 */
export class SpritePreview {
  private readonly overlay: HTMLElement
  private readonly studioEl: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly fileIdEl: HTMLElement
  private readonly metaEl: HTMLElement
  private readonly colsInput: HTMLInputElement
  private readonly rowsInput: HTMLInputElement
  private readonly framesEl: HTMLElement
  private readonly frameSizeEl: HTMLElement
  private readonly pixelToggle: HTMLInputElement
  // Playbar
  private readonly playBtn: HTMLButtonElement
  private readonly loopBtn: HTMLButtonElement
  private readonly scrubFill: HTMLElement
  private readonly scrubKnob: HTMLElement
  private readonly tcodeCur: HTMLElement
  private readonly tcodeTotal: HTMLElement
  private readonly fpsPill: HTMLElement

  private img: HTMLImageElement | null = null
  private cols = 1
  private rows = 1
  private frame = 0
  private playing = false
  private loop = true
  private pixelated = true
  private fps = 12
  private acc = 0
  private last = 0
  private raf = 0
  private loadToken = 0
  private readonly onClose?: () => void

  constructor(host: HTMLElement, onClose?: () => void) {
    this.onClose = onClose

    // ── Studio (canvas 2D + pills) ───────────────────────────────────────────
    const studio = h('div', { class: 'studio sprite-studio grow', style: { position: 'relative', minHeight: '0' } })
    this.studioEl = studio
    const canvas = h('canvas', { style: { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' } }) as HTMLCanvasElement
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    const fileId = h('span', {}, '')
    this.fileIdEl = fileId
    const meta = h('span', { class: 'vp-pill mono', style: { fontSize: '10.5px' } }, '—')
    this.metaEl = meta
    studio.append(
      canvas,
      h('div', { style: { position: 'absolute', top: '10px', left: '12px' } },
        h('span', { class: 'vp-pill' }, h('span', { style: { fontSize: '9px', fontWeight: '800', color: 'var(--accent)', fontFamily: 'var(--mono)' } }, '2D'), fileId)),
      h('div', { style: { position: 'absolute', bottom: '10px', left: '12px' } }, meta),
    )

    // ── Playbar ──────────────────────────────────────────────────────────────
    const playBtn = h('button', { class: 'iconbtn on', style: { width: '32px', height: '32px' }, onClick: () => this.togglePlay() }, icon('play', { size: 15, fill: true })) as HTMLButtonElement
    const prevBtn = h('button', { class: 'iconbtn', title: 'Frame anterior', onClick: () => this.step(-1) }, icon('chevR', { size: 15, color: 'var(--tx)' })) as HTMLButtonElement
    prevBtn.style.transform = 'scaleX(-1)'
    const nextBtn = h('button', { class: 'iconbtn', title: 'Próximo frame', onClick: () => this.step(1) }, icon('chevR', { size: 15 })) as HTMLButtonElement
    const loopBtn = h('button', { class: 'iconbtn on', title: 'Loop', onClick: () => this.toggleLoop() }, icon('refresh', { size: 15 })) as HTMLButtonElement
    const tcodeCur = h('span', { class: 'tcode' }, '0')
    const tcodeTotal = h('span', { class: 'tcode' }, '0')
    const scrubFill = h('div', { class: 'fill', style: { width: '0%' } })
    const scrubKnob = h('div', { class: 'knob', style: { left: '0%' } })
    const scrub = h('div', { class: 'scrub', onClick: (ev) => this.scrubTo(ev as MouseEvent) }, scrubFill, scrubKnob)
    const fpsPill = h('span', { class: 'selpill', style: { height: '26px', cursor: 'pointer' }, onClick: () => this.cycleFps() }, '12 fps')
    this.playBtn = playBtn
    this.loopBtn = loopBtn
    this.scrubFill = scrubFill
    this.scrubKnob = scrubKnob
    this.tcodeCur = tcodeCur
    this.tcodeTotal = tcodeTotal
    this.fpsPill = fpsPill
    const playbar = h('div', { class: 'playbar' },
      playBtn, prevBtn, nextBtn, tcodeCur, scrub, tcodeTotal,
      h('div', { class: 'divx', style: { margin: '8px 2px' } }), loopBtn, fpsPill,
    )

    // ── Painel Grade ───────────────────────────────────────────────────────────
    const colsInput = h('input', { type: 'number', value: '1', onInput: () => this.applyGrid() }) as HTMLInputElement
    const rowsInput = h('input', { type: 'number', value: '1', onInput: () => this.applyGrid() }) as HTMLInputElement
    colsInput.min = '1'
    rowsInput.min = '1'
    this.colsInput = colsInput
    this.rowsInput = rowsInput
    const frames = h('span', { class: 'mono', style: { color: 'var(--tx-hi)' } }, '0')
    const frameSize = h('span', { class: 'mono', style: { color: 'var(--tx-dim)' } }, '—')
    this.framesEl = frames
    this.frameSizeEl = frameSize
    const pixelToggle = h('input', { type: 'checkbox', onInput: () => { this.pixelated = pixelToggle.checked; this.draw() } }) as HTMLInputElement
    pixelToggle.checked = true
    this.pixelToggle = pixelToggle

    const grade = h('div', { class: 'animpanel sprite-grade' },
      h('div', { class: 'panel-h' }, h('span', { class: 'ttl lit' }, 'Grade'), h('span', { class: 'spacer' })),
      h('div', { class: 'sg-body' },
        h('div', { class: 'sg-row' },
          h('label', {}, 'Colunas', colsInput),
          h('label', {}, 'Linhas', rowsInput),
        ),
        h('div', { class: 'sg-stat' }, h('span', {}, 'Frame'), frameSize),
        h('div', { class: 'sg-stat' }, h('span', {}, 'Total de frames'), frames),
        h('label', { class: 'sg-tog' }, pixelToggle, h('span', {}, 'Pixelado (nearest)')),
        h('p', { class: 'sg-hint' }, 'Ajuste colunas×linhas pra casar a grade do spritesheet. Frame 0 = topo-esquerda.'),
      ),
    )

    const overlay = h('div', { class: 'editor-sprite-preview ide', style: { position: 'absolute', inset: '0', display: 'none', zIndex: '7', background: 'var(--bg-1)' } },
      h('div', { class: 'row grow', style: { minHeight: '0', alignItems: 'stretch' } },
        h('div', { class: 'col grow', style: { minWidth: '0' } }, studio, playbar),
        grade,
      ),
    )
    this.overlay = overlay
    host.appendChild(overlay)

    new ResizeObserver(() => this.resize()).observe(studio)
  }

  /** `true` se a extensão pode abrir como spritesheet (imagens raster). */
  static handles(name: string): boolean {
    const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    return e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'gif' || e === 'webp' || e === 'bmp'
  }

  /** `true` enquanto o overlay está visível. */
  isOpen(): boolean {
    return this.overlay.style.display !== 'none'
  }

  /** Abre o player de spritesheet: carrega a imagem, adivinha a grade e toca. */
  async open(path: string, name: string): Promise<void> {
    this.overlay.style.display = 'flex'
    this.fileIdEl.textContent = name
    const token = ++this.loadToken
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return
      const mime = name.toLowerCase().endsWith('.jpg') || name.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('falha ao decodificar a imagem'))
        img.src = `data:${mime};base64,${b64}`
      })
      if (token !== this.loadToken) return
      this.img = img
      const g = guessGrid(img.naturalWidth, img.naturalHeight)
      this.cols = g.cols
      this.rows = g.rows
      this.colsInput.value = String(g.cols)
      this.rowsInput.value = String(g.rows)
      this.frame = 0
      this.refreshMeta()
      this.resize()
      this.draw()
      this.setPlaying(this.frameCount > 1)
      this.startLoop()
    } catch (err) {
      this.img = null
      this.metaEl.textContent = `falha: ${err instanceof Error ? err.message : String(err)}`
      this.draw()
    }
  }

  /** Esconde o overlay e pausa o loop (volta a mostrar o preview de imagem). */
  close(): void {
    if (this.overlay.style.display === 'none') return
    this.overlay.style.display = 'none'
    this.setPlaying(false)
    this.stopLoop()
    this.loadToken++
    this.onClose?.()
  }

  private get frameCount(): number {
    return Math.max(1, this.cols * this.rows)
  }

  private applyGrid(): void {
    const c = Math.max(1, Math.floor(Number(this.colsInput.value) || 1))
    const r = Math.max(1, Math.floor(Number(this.rowsInput.value) || 1))
    this.cols = c
    this.rows = r
    if (this.frame >= this.frameCount) this.frame = 0
    this.refreshMeta()
    this.draw()
  }

  private refreshMeta(): void {
    const img = this.img
    if (!img) {
      this.metaEl.textContent = '—'
      this.framesEl.textContent = '0'
      this.frameSizeEl.textContent = '—'
      this.tcodeTotal.textContent = '0'
      return
    }
    const fw = Math.round(img.naturalWidth / this.cols)
    const fh = Math.round(img.naturalHeight / this.rows)
    this.metaEl.textContent = `${img.naturalWidth}×${img.naturalHeight} · ${this.cols}×${this.rows} · ${this.frameCount} frames`
    this.framesEl.textContent = String(this.frameCount)
    this.frameSizeEl.textContent = `${fw}×${fh} px`
    this.tcodeTotal.textContent = String(this.frameCount)
  }

  private togglePlay(): void {
    this.setPlaying(!this.playing)
  }

  private setPlaying(on: boolean): void {
    this.playing = on && this.frameCount > 1
    this.playBtn.textContent = ''
    this.playBtn.append(icon(this.playing ? 'pause' : 'play', { size: 15, fill: !this.playing }))
    this.playBtn.classList.toggle('on', this.playing)
    this.acc = 0
  }

  private toggleLoop(): void {
    this.loop = !this.loop
    this.loopBtn.classList.toggle('on', this.loop)
  }

  private step(d: number): void {
    this.setPlaying(false)
    const n = this.frameCount
    this.frame = ((this.frame + d) % n + n) % n
    this.draw()
  }

  private scrubTo(ev: MouseEvent): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
    this.setPlaying(false)
    this.frame = Math.min(this.frameCount - 1, Math.floor(t * this.frameCount))
    this.draw()
  }

  private cycleFps(): void {
    const steps = [6, 8, 12, 15, 24, 30]
    this.fps = steps[(steps.indexOf(this.fps) + 1) % steps.length]!
    this.fpsPill.textContent = `${this.fps} fps`
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = this.studioEl.clientWidth || 1
    const ht = this.studioEl.clientHeight || 1
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(ht * dpr)
    this.draw()
  }

  /** Desenha o frame atual centralizado (contain), com nearest opcional. */
  private draw(): void {
    const ctx = this.ctx
    if (!ctx) return
    const cw = this.canvas.width
    const ch = this.canvas.height
    ctx.clearRect(0, 0, cw, ch)
    const img = this.img
    if (!img) return
    const fw = img.naturalWidth / this.cols
    const fh = img.naturalHeight / this.rows
    const col = this.frame % this.cols
    const row = Math.floor(this.frame / this.cols)
    const sx = col * fw
    const sy = row * fh
    // contain dentro do canvas, com uma margem
    const pad = 0.86
    const scale = Math.min((cw * pad) / fw, (ch * pad) / fh)
    const dw = fw * scale
    const dh = fh * scale
    const dx = (cw - dw) / 2
    const dy = (ch - dh) / 2
    ctx.imageSmoothingEnabled = !this.pixelated
    ctx.drawImage(img, sx, sy, fw, fh, dx, dy, dw, dh)
    this.updatePlayhead()
  }

  private updatePlayhead(): void {
    const n = this.frameCount
    const pct = n > 1 ? `${((this.frame / (n - 1)) * 100).toFixed(1)}%` : '0%'
    this.scrubFill.style.width = pct
    this.scrubKnob.style.left = pct
    this.tcodeCur.textContent = String(this.frame + 1)
  }

  private startLoop(): void {
    if (this.raf) return
    this.last = performance.now()
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick)
      const dt = (now - this.last) / 1000
      this.last = now
      if (this.playing && this.frameCount > 1) {
        this.acc += dt
        const spf = 1 / this.fps
        let advanced = false
        while (this.acc >= spf) {
          this.acc -= spf
          const next = this.frame + 1
          if (next >= this.frameCount) {
            if (this.loop) this.frame = 0
            else { this.frame = this.frameCount - 1; this.setPlaying(false) }
          } else {
            this.frame = next
          }
          advanced = true
        }
        if (advanced) this.draw()
      }
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}

/**
 * Adivinha a grade de um spritesheet pela razão de aspecto: tenta tamanhos de
 * frame quadrado comuns (potências/múltiplos) que dividam exatamente W e H e
 * resultem em ≥2 frames; senão trata como 1×1 (imagem única). É só um chute
 * inicial — o usuário ajusta colunas/linhas na UI.
 */
function guessGrid(w: number, h: number): { cols: number; rows: number } {
  for (const p of [128, 96, 64, 48, 32, 24, 16]) {
    if (w % p === 0 && h % p === 0) {
      const cols = w / p
      const rows = h / p
      if (cols * rows >= 2) return { cols, rows }
    }
  }
  return { cols: 1, rows: 1 }
}
