/**
 * Tela inicial (launcher) estilo Unity Hub / Android Studio: logo + "Criar novo
 * jogo" / "Abrir jogo existente" + projetos recentes. Aparece quando NENHUM
 * projeto está aberto (boot sem último projeto) e some quando um projeto abre
 * (`project-open`). Volta a ela via menu nativo "Projeto > Fechar projeto"
 * (`project-close`).
 *
 * Recentes ficam em localStorage (`recentProjects`); atualizados a cada
 * `project-open`. "Criar" reusa o dialog do ProjectManager (evento
 * `request-new-project`); "Abrir" usa o seletor nativo de pasta.
 */
interface Recent {
  path: string
  name: string
  openedAt: number
}

const RECENTS_KEY = 'recentProjects'

function getRecents(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as Recent[]
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function addRecent(path: string): void {
  const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
  const list = getRecents().filter((r) => r.path !== path)
  list.unshift({ path, name, openedAt: Date.now() })
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 10)))
}

function openProject(path: string): void {
  document.dispatchEvent(new CustomEvent<{ path: string }>('project-open', { detail: { path } }))
}

export class Launcher {
  private readonly overlay: HTMLElement
  private readonly recentsEl: HTMLElement

  constructor() {
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:40',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:8px',
      'background:radial-gradient(120% 90% at 50% 0%, #23252e 0%, #16171c 70%)',
      'color:#e6e6e6',
      'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    ].join(';')

    const logo = document.createElement('img')
    logo.src = 'logo.png'
    logo.style.cssText = 'width:120px;height:auto;margin-bottom:4px;filter:drop-shadow(0 8px 22px rgba(0,0,0,.5))'
    logo.onerror = (): void => {
      logo.style.display = 'none'
    }

    const title = document.createElement('div')
    title.textContent = 'Cortex Game Engine Studio'
    title.style.cssText = 'font-size:22px;font-weight:700;letter-spacing:.01em'
    const sub = document.createElement('div')
    sub.textContent = 'Comece um novo jogo ou continue de onde parou.'
    sub.style.cssText = 'font-size:13px;color:#9aa0ad;margin-bottom:18px'

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:12px;margin-bottom:26px'
    const createBtn = bigButton('＋  Criar novo jogo', '#3b5bdb', '#fff')
    createBtn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('request-new-project')))
    const openBtn = bigButton('📂  Abrir jogo existente', '#2a2f3a', '#e6e6e6')
    openBtn.addEventListener('click', () => void this.handleOpen())
    actions.append(createBtn, openBtn)

    const recentsHead = document.createElement('div')
    recentsHead.textContent = 'Recentes'
    recentsHead.style.cssText =
      'width:560px;max-width:80vw;color:#9aa0ad;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px'
    const recentsEl = document.createElement('div')
    recentsEl.style.cssText =
      'width:560px;max-width:80vw;max-height:34vh;overflow:auto;display:flex;flex-direction:column;gap:6px'

    overlay.append(logo, title, sub, actions, recentsHead, recentsEl)
    document.body.appendChild(overlay)
    this.overlay = overlay
    this.recentsEl = recentsEl

    // Abrir um projeto (recente, criado, ou via sidebar) some com a tela.
    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path) addRecent(path)
      this.hide()
    })
    // Fechar projeto → volta pra tela inicial.
    document.addEventListener('project-close', () => this.show())

    this.renderRecents()
    this.show() // boot: mostra a tela; FileTree restaura o último projeto → some.
  }

  show(): void {
    this.renderRecents()
    this.overlay.style.display = 'flex'
  }

  hide(): void {
    this.overlay.style.display = 'none'
  }

  private async handleOpen(): Promise<void> {
    const path = await window.electronAPI.selectDirectory()
    if (path) openProject(path)
  }

  private renderRecents(): void {
    const recents = getRecents()
    this.recentsEl.textContent = ''
    if (recents.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = 'Nenhum projeto recente ainda.'
      empty.style.cssText = 'color:#6b7280;font-size:13px;padding:8px 2px'
      this.recentsEl.appendChild(empty)
      return
    }
    for (const r of recents) {
      const card = document.createElement('button')
      card.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'align-items:flex-start',
        'gap:2px',
        'text-align:left',
        'padding:9px 12px',
        'border:1px solid #2c2e36',
        'border-radius:8px',
        'background:#1b1c22',
        'color:#e6e6e6',
        'cursor:pointer',
      ].join(';')
      card.addEventListener('mouseenter', () => (card.style.background = '#22232a'))
      card.addEventListener('mouseleave', () => (card.style.background = '#1b1c22'))
      const name = document.createElement('div')
      name.textContent = r.name
      name.style.cssText = 'font-weight:600;font-size:14px'
      const path = document.createElement('div')
      path.textContent = r.path
      path.style.cssText = 'font-size:11px;color:#9aa0ad;word-break:break-all'
      card.append(name, path)
      card.addEventListener('click', () => openProject(r.path))
      this.recentsEl.appendChild(card)
    }
  }
}

function bigButton(label: string, bg: string, fg: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.style.cssText = [
    'padding:13px 22px',
    'border:1px solid rgba(255,255,255,0.08)',
    'border-radius:10px',
    `background:${bg}`,
    `color:${fg}`,
    'cursor:pointer',
    'font-size:14px',
    'font-weight:600',
  ].join(';')
  return b
}
