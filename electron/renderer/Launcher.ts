/**
 * Tela inicial (launcher) estilo Unity Hub / Android Studio: logo + "Criar novo
 * jogo" / "Abrir jogo existente" + projetos recentes. Aparece quando NENHUM
 * projeto está aberto (boot sem último projeto) e some quando um projeto abre
 * (`project-open`). Volta a ela via menu nativo "Projeto > Fechar projeto"
 * (`project-close`).
 *
 * A janela do Studio é frameless: como este overlay cobre a menubar do `Shell`
 * (que desenha os botões de janela e a faixa arrastável), ele desenha a PRÓPRIA
 * titlebar — arrastar + minimizar/maximizar/fechar (SPEC-0178).
 *
 * Recentes ficam em localStorage (`recentProjects`, módulo `recentProjects.ts`);
 * atualizados a cada `project-open` e removíveis pelo ✕ de cada linha. "Criar"
 * reusa o dialog do ProjectManager (evento `request-new-project`); "Abrir" usa o
 * seletor nativo de pasta.
 */
import { icon } from './ui'
import { addRecent, getRecents, removeRecent } from './recentProjects'
import { APP_DISPLAY_NAME, APP_WORDMARK } from '../appIdentity'

/** Altura da titlebar — mesma da menubar do Shell (`.ide .menubar`). */
const TITLEBAR_HEIGHT_PX = 30

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
      'background:radial-gradient(120% 90% at 50% 0%, #23252e 0%, #16171c 70%)',
      'color:#e6e6e6',
      'font-family:"Segoe UI",Roboto,Arial,sans-serif',
    ].join(';')

    // Conteúdo centralizado na área abaixo da titlebar.
    const body = document.createElement('div')
    body.style.cssText = [
      'flex:1',
      'min-height:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:8px',
    ].join(';')

    const logo = document.createElement('img')
    logo.src = 'logo.png'
    logo.style.cssText = 'width:120px;height:auto;margin-bottom:4px;filter:drop-shadow(0 8px 22px rgba(0,0,0,.5))'
    logo.onerror = (): void => {
      logo.style.display = 'none'
    }

    const title = document.createElement('div')
    title.textContent = APP_DISPLAY_NAME
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

    body.append(logo, title, sub, actions, recentsHead, recentsEl)
    overlay.append(titleBar(), body)
    document.body.appendChild(overlay)
    this.overlay = overlay
    this.recentsEl = recentsEl

    // Abrir um projeto (recente, criado, ou via sidebar) some com a tela.
    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path) addRecent(path, Date.now())
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
      // A linha é um <div>: o ✕ é irmão do card, e <button> dentro de <button>
      // é HTML inválido.
      const row = document.createElement('div')
      row.style.cssText = [
        'display:flex',
        'align-items:stretch',
        'border:1px solid #2c2e36',
        'border-radius:8px',
        'background:#1b1c22',
        'overflow:hidden',
      ].join(';')

      const card = document.createElement('button')
      card.style.cssText = [
        'flex:1',
        'min-width:0',
        'display:flex',
        'flex-direction:column',
        'align-items:flex-start',
        'gap:2px',
        'text-align:left',
        'padding:9px 12px',
        'border:none',
        'background:transparent',
        'color:#e6e6e6',
        'cursor:pointer',
      ].join(';')
      const name = document.createElement('div')
      name.textContent = r.name
      name.style.cssText = 'font-weight:600;font-size:14px'
      const path = document.createElement('div')
      path.textContent = r.path
      path.style.cssText = 'font-size:11px;color:#9aa0ad;word-break:break-all'
      card.append(name, path)
      card.addEventListener('click', () => openProject(r.path))

      // ✕ — tira só da lista; o projeto continua no disco. Apagado até o hover.
      const remove = document.createElement('button')
      remove.title = 'Remover da lista (não apaga o projeto do disco)'
      remove.setAttribute('aria-label', `Remover ${r.name} da lista`)
      remove.style.cssText = [
        'flex:0 0 auto',
        'width:34px',
        'display:grid',
        'place-items:center',
        'border:none',
        'background:transparent',
        'color:#9aa0ad',
        'cursor:pointer',
        'opacity:0',
        'transition:opacity .12s,color .12s',
      ].join(';')
      remove.append(iconEl('close', 13))
      remove.addEventListener('mouseenter', () => (remove.style.color = '#f0f2f6'))
      remove.addEventListener('mouseleave', () => (remove.style.color = '#9aa0ad'))
      remove.addEventListener('click', (e) => {
        e.stopPropagation()
        removeRecent(r.path)
        this.renderRecents()
      })
      // Sem mouse (teclado), o ✕ precisa aparecer ao receber foco.
      remove.addEventListener('focus', () => (remove.style.opacity = '1'))
      remove.addEventListener('blur', () => (remove.style.opacity = '0'))

      row.addEventListener('mouseenter', () => {
        row.style.background = '#22232a'
        remove.style.opacity = '1'
      })
      row.addEventListener('mouseleave', () => {
        row.style.background = '#1b1c22'
        remove.style.opacity = '0'
      })

      row.append(card, remove)
      this.recentsEl.appendChild(row)
    }
  }
}

/**
 * Titlebar do launcher: faixa arrastável + minimizar/maximizar/fechar. Existe
 * porque o overlay cobre a menubar do Shell, que é quem desenha isso quando há
 * projeto aberto (janela frameless — SPEC-0178).
 */
function titleBar(): HTMLElement {
  const bar = document.createElement('div')
  bar.style.cssText = [
    `height:${TITLEBAR_HEIGHT_PX}px`,
    'flex:0 0 auto',
    'display:flex',
    'align-items:center',
    'padding:0 6px 0 12px',
    'gap:8px',
    'user-select:none',
    '-webkit-app-region:drag',
  ].join(';')

  const label = document.createElement('span')
  label.textContent = APP_WORDMARK
  label.style.cssText = 'font-size:11.5px;font-weight:700;color:#9aa0ad;letter-spacing:.02em'

  const spacer = document.createElement('span')
  spacer.style.cssText = 'flex:1'

  const btns = document.createElement('div')
  btns.style.cssText = 'display:flex;gap:2px;-webkit-app-region:no-drag'
  btns.append(
    windowButton('min', 13, 'Minimizar', () => void window.electronAPI.windowMinimize?.()),
    windowButton('max', 11, 'Maximizar', () => void window.electronAPI.windowMaximize?.()),
    windowButton('close', 12, 'Fechar', () => void window.electronAPI.windowClose?.(), '#e5484d'),
  )

  bar.append(label, spacer, btns)
  return bar
}

/** Botão de janela (mesma métrica do `.winbtn` do Shell); `hoverBg` tinge o fechar. */
function windowButton(
  name: string,
  size: number,
  title: string,
  onClick: () => void,
  hoverBg = '#2c2e36',
): HTMLButtonElement {
  const b = document.createElement('button')
  b.title = title
  b.setAttribute('aria-label', title)
  b.style.cssText = [
    'width:32px',
    'height:22px',
    'display:grid',
    'place-items:center',
    'border:none',
    'border-radius:5px',
    'background:transparent',
    'color:#9aa0ad',
    'cursor:pointer',
  ].join(';')
  b.append(iconEl(name, size))
  b.addEventListener('mouseenter', () => {
    b.style.background = hoverBg
    b.style.color = '#fff'
  })
  b.addEventListener('mouseleave', () => {
    b.style.background = 'transparent'
    b.style.color = '#9aa0ad'
  })
  b.addEventListener('click', onClick)
  return b
}

/**
 * Ícone do set do redesign. O `.ico` só é estilizado dentro de `.ide` e o
 * launcher vive fora dele (anexado ao body) — daí o display aplicado na mão.
 */
function iconEl(name: string, size: number): HTMLElement {
  const el = icon(name, { size })
  el.style.display = 'inline-flex'
  return el
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
