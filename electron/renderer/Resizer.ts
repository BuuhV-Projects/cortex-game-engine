/**
 * Gerencia handles de resize entre as colunas do #app grid. Cada handle
 * controla a largura da coluna à sua DIREITA, ajustando a string
 * grid-template-columns do contêiner pai.
 *
 * Estrutura atual do grid (ver styles.css):
 *   `<sidebar> | <editor> | <handle> | <right-panel> | <handle> | <chat>`
 *   índices:    0          1          2               3          4          5
 *
 * Cada handle (índice 2 e 4) ajusta a coluna seguinte:
 *   - handle[0] (col 2) controla a largura de #right-panel (col 3)
 *   - handle[1] (col 4) controla a largura de #chat-container (col 5)
 *
 * As outras colunas (sidebar, editor) ficam com tamanho fixo / fr para
 * absorver o restante.
 */

const MIN_WIDTH = 180
const MAX_WIDTH = 720

interface ResizeTarget {
  /** Índice (1-based) da coluna no grid-template-columns. */
  columnIndex: number
  /** Largura atual em px. */
  width: number
}

export class Resizer {
  private grid: HTMLElement
  private targets: ResizeTarget[]

  constructor(grid: HTMLElement, targets: ResizeTarget[]) {
    this.grid = grid
    this.targets = targets
  }

  /**
   * Anexa um handle DOM como controlador da coluna `target`. O handle deve
   * estar dentro do mesmo grid.
   */
  attach(handle: HTMLElement, target: ResizeTarget): void {
    let startX = 0
    let startWidth = 0

    const onMouseMove = (e: MouseEvent): void => {
      // O handle controla a coluna à direita — arrastar para a esquerda
      // aumenta a largura dessa coluna.
      const delta = startX - e.clientX
      const newWidth = Math.min(Math.max(startWidth + delta, MIN_WIDTH), MAX_WIDTH)
      target.width = newWidth
      this.applyColumns()
    }

    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX
      startWidth = target.width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    })
  }

  applyColumns(): void {
    // Reconstrói grid-template-columns. Estrutura fixa:
    // 240px (sidebar) | 1fr (editor) | 4px | <right-panel> | 4px | <chat>
    const [right, chat] = this.targets
    this.grid.style.gridTemplateColumns = `240px 1fr 4px ${right.width}px 4px ${chat.width}px`
  }
}
