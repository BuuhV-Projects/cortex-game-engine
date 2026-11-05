import { renderMarkdown } from './markdown'
import { SpritePreview } from './SpritePreview'
import { icon } from './ui'
import { mimeForImage } from './fileKinds'

/**
 * Overlay de preview de imagem/markdown que cobre o Monaco quando um doc
 * não-código é aberto. Dono do próprio DOM e do player de spritesheet.
 * Extraído do `Editor.ts` (regra de 500 linhas).
 */
export class PreviewOverlay {
  private el: HTMLElement
  private img: HTMLImageElement
  private md: HTMLElement
  private caption: HTMLElement
  private spriteBtn: HTMLElement
  private sprite: SpritePreview
  /** Path do doc em preview (imagem OU markdown) — pro doc-close só fechar o próprio. */
  private docPath: string | null = null
  /** Path/nome da imagem atualmente em preview (pro botão "Spritesheet"). */
  private imagePath: string | null = null
  private imageName = ''

  /** @param onVisibilityChange chamado quando o overlay aparece/desaparece. */
  constructor(
    area: HTMLElement,
    private onVisibilityChange: () => void,
  ) {
    // Overlay de preview de imagem (cobre o Monaco quando uma imagem é aberta).
    const preview = document.createElement('div')
    preview.className = 'editor-image-preview'
    preview.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:10px',
      'padding:16px',
      'background:#1e1e1e',
      'overflow:auto',
      'z-index:5',
    ].join(';')
    const img = document.createElement('img')
    img.style.cssText = 'max-width:100%;max-height:calc(100% - 28px);object-fit:contain;image-rendering:auto'
    const md = document.createElement('div')
    md.className = 'editor-preview-md'
    md.style.cssText =
      'display:none;width:100%;max-width:860px;margin:0 auto;padding:8px 16px 40px;overflow:auto;color:#d4d4d4;line-height:1.6;font:14px "Segoe UI",Roboto,Arial,sans-serif'
    const caption = document.createElement('div')
    caption.className = 'editor-preview-caption'
    caption.style.cssText = 'color:#9aa0ad;font:12px "Segoe UI",Roboto,Arial,sans-serif'
    // Botão de fechar (volta pro editor de código), no canto superior direito.
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.title = 'Fechar preview'
    closeBtn.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:12px',
      'width:28px',
      'height:28px',
      'border:1px solid #3a3f4a',
      'border-radius:5px',
      'background:rgba(42,47,58,0.9)',
      'color:#e6e6e6',
      'cursor:pointer',
      'font:14px "Segoe UI",Roboto,Arial,sans-serif',
      'z-index:6',
    ].join(';')
    closeBtn.addEventListener('click', () => this.hide())

    // Botão "Spritesheet": abre a imagem atual como player de animação 2D
    // (rota A — grade de frames editável). Só faz sentido pra imagens raster.
    const spriteBtn = document.createElement('button')
    spriteBtn.className = 'sprite-toggle-btn'
    spriteBtn.title = 'Ver como spritesheet (animação 2D)'
    spriteBtn.append(icon('grid', { size: 13 }), document.createTextNode('Spritesheet'))
    spriteBtn.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:48px',
      'height:28px',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:0 10px',
      'border:1px solid #3a3f4a',
      'border-radius:5px',
      'background:rgba(42,47,58,0.9)',
      'color:#e6e6e6',
      'cursor:pointer',
      'font:12px "Segoe UI",Roboto,Arial,sans-serif',
      'z-index:6',
    ].join(';')
    spriteBtn.addEventListener('click', () => {
      if (this.imagePath) void this.sprite.open(this.imagePath, this.imageName)
    })

    preview.append(img, md, caption, spriteBtn, closeBtn)
    area.appendChild(preview)

    this.el = preview
    this.img = img
    this.md = md
    this.caption = caption
    this.spriteBtn = spriteBtn
    // Player de spritesheet 2D (overlay acima do preview de imagem).
    this.sprite = new SpritePreview(area)
  }

  /** Path do doc em preview, ou `null` se nenhum. */
  get currentPath(): string | null {
    return this.docPath
  }

  isVisible(): boolean {
    return this.el.style.display !== 'none'
  }

  /** Mostra a imagem como preview (cobre o editor de código). */
  async openImage(path: string, name: string): Promise<void> {
    this.sprite.close()
    this.docPath = path
    this.imagePath = path
    this.imageName = name
    this.spriteBtn.style.display = SpritePreview.handles(name) ? 'flex' : 'none'
    this.md.style.display = 'none'
    this.img.style.display = ''
    this.el.style.justifyContent = 'center'
    this.caption.textContent = name
    this.el.style.display = 'flex'
    this.onVisibilityChange()
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      this.img.src = `data:${mimeForImage(name)};base64,${b64}`
    } catch {
      this.caption.textContent = `Falha ao abrir ${name}`
      this.img.removeAttribute('src')
    }
  }

  /** Renderiza o markdown como preview (cobre o editor de código). */
  async openMarkdown(path: string, name: string): Promise<void> {
    this.sprite.close()
    this.docPath = path
    this.spriteBtn.style.display = 'none'
    this.img.style.display = 'none'
    this.md.style.display = 'block'
    this.el.style.justifyContent = 'flex-start'
    this.caption.textContent = name
    this.el.style.display = 'flex'
    this.onVisibilityChange()
    try {
      const text = await window.electronAPI.readFile(path)
      this.md.innerHTML = renderMarkdown(text)
    } catch {
      this.md.textContent = `Falha ao abrir ${name}`
    }
  }

  /** Esconde o preview (volta a mostrar o editor de código). */
  hide(): void {
    this.docPath = null
    this.sprite.close()
    this.el.style.display = 'none'
    this.onVisibilityChange()
  }
}
