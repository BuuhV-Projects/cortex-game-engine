import {
  type ActionId,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  type KeyBindings,
  displayKey,
  loadBindings,
  normalizeKey,
  saveBindings,
} from '../utils/keyBindings'
import { clearSave, loadSave, type SaveSnapshot } from '../utils/save'
import { MenuNav } from '../utils/menuNav'

export type MenuChoice =
  | { type: 'new'; bindings: KeyBindings }
  | { type: 'continue'; bindings: KeyBindings; save: SaveSnapshot }

const ACTION_ORDER: ActionId[] = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'sprint',
  'reload',
  'pause',
]

/**
 * Renderiza um menu DOM fullscreen e resolve com a escolha do jogador.
 *
 * Suporta navegação por:
 *   - mouse (clique direto)
 *   - teclado (↑↓ ou Tab pra mover foco, Enter pra ativar, Esc pra voltar)
 *   - gamepad Xbox (D-Pad ou LS pra mover, A ativa, B volta)
 */
export function showMenu(): Promise<MenuChoice> {
  return new Promise<MenuChoice>((resolve) => {
    const bindings = loadBindings()
    const css = injectCss()
    const root = document.createElement('div')
    root.className = 'menu-root'
    document.body.appendChild(root)

    const nav = new MenuNav()
    nav.start()

    function done(choice: MenuChoice): void {
      nav.stop()
      root.remove()
      css.remove()
      resolve(choice)
    }

    function renderMain(): void {
      root.innerHTML = ''
      const save = loadSave()
      const panel = document.createElement('div')
      panel.className = 'menu-panel'
      panel.innerHTML = `
        <h1>CIDADE ABANDONADA</h1>
        <p class="sub">sobreviva às ondas. atire nos zumbis. não morra.</p>
        <div class="menu-actions"></div>
        <div class="menu-foot">
          <span>↑↓ / D-Pad / LS para navegar • Enter / A para confirmar • Esc / B para voltar</span><br/>
          <span>gamepad Xbox detectado automaticamente</span>
        </div>
      `
      root.appendChild(panel)
      const actions = panel.querySelector('.menu-actions')!

      const btnContinue = document.createElement('button')
      btnContinue.className = 'menu-btn primary'
      btnContinue.disabled = !save
      btnContinue.textContent = save
        ? `Continuar — wave ${save.completedWave + 1}, ${save.killsTotal} kills`
        : 'Continuar (nenhum save)'
      btnContinue.onclick = () => {
        if (save) done({ type: 'continue', bindings, save })
      }
      actions.appendChild(btnContinue)

      const btnNew = document.createElement('button')
      btnNew.className = 'menu-btn'
      btnNew.textContent = save ? 'Novo jogo (apaga save atual)' : 'Novo jogo'
      btnNew.onclick = () => {
        if (save && !confirm('Apagar progresso atual?')) return
        clearSave()
        done({ type: 'new', bindings })
      }
      actions.appendChild(btnNew)

      const btnKeys = document.createElement('button')
      btnKeys.className = 'menu-btn'
      btnKeys.textContent = 'Configurar controles'
      btnKeys.onclick = renderBindings
      actions.appendChild(btnKeys)

      nav.setItems([btnContinue, btnNew, btnKeys])
    }

    function renderBindings(): void {
      root.innerHTML = ''
      const panel = document.createElement('div')
      panel.className = 'menu-panel'
      panel.innerHTML = `
        <h2>Controles (teclado)</h2>
        <p class="sub">A / Enter para trocar a tecla destacada • B / Esc volta • o gamepad usa layout Xbox fixo</p>
        <div class="bind-grid"></div>
        <div class="menu-actions row"></div>
      `
      root.appendChild(panel)

      const grid = panel.querySelector('.bind-grid')!
      const actions = panel.querySelector('.menu-actions')!

      function renderGrid(): void {
        grid.innerHTML = ''
        const focusables: HTMLElement[] = []
        for (const action of ACTION_ORDER) {
          const row = document.createElement('div')
          row.className = 'bind-row'
          const label = document.createElement('div')
          label.className = 'bind-label'
          label.textContent = ACTION_LABELS[action]
          row.appendChild(label)
          const keys = document.createElement('div')
          keys.className = 'bind-keys'
          for (const k of bindings[action]) {
            const kBtn = document.createElement('button')
            kBtn.className = 'bind-key'
            kBtn.textContent = displayKey(k)
            kBtn.onclick = () => captureKey(action, k, kBtn)
            keys.appendChild(kBtn)
            focusables.push(kBtn)
          }
          const add = document.createElement('button')
          add.className = 'bind-key add'
          add.textContent = '+'
          add.title = 'adicionar tecla alternativa'
          add.onclick = () => captureKey(action, null, add)
          keys.appendChild(add)
          focusables.push(add)
          row.appendChild(keys)
          grid.appendChild(row)
        }
        const btnReset = document.createElement('button')
        btnReset.className = 'menu-btn'
        btnReset.textContent = 'Restaurar padrão'
        btnReset.onclick = () => {
          for (const a of ACTION_ORDER) {
            bindings[a] = [...DEFAULT_BINDINGS[a]]
          }
          saveBindings(bindings)
          renderGrid()
        }
        const btnBack = document.createElement('button')
        btnBack.className = 'menu-btn primary'
        btnBack.textContent = 'Voltar'
        btnBack.onclick = renderMain
        actions.innerHTML = ''
        actions.appendChild(btnReset)
        actions.appendChild(btnBack)
        focusables.push(btnReset, btnBack)
        nav.setItems(focusables, renderMain)
      }
      renderGrid()

      function captureKey(action: ActionId, replacing: string | null, btn: HTMLButtonElement): void {
        const prevText = btn.textContent
        btn.classList.add('capturing')
        btn.textContent = '…'
        nav.setPaused(true)
        const handler = (e: KeyboardEvent): void => {
          e.preventDefault()
          window.removeEventListener('keydown', handler, true)
          btn.classList.remove('capturing')
          if (e.key === 'Escape' && replacing !== 'escape') {
            btn.textContent = prevText
            nav.setPaused(false)
            return
          }
          const nk = normalizeKey(e.key)
          if (replacing === null) {
            if (!bindings[action].includes(nk)) bindings[action].push(nk)
          } else {
            const idx = bindings[action].indexOf(replacing)
            if (idx >= 0) {
              if (bindings[action].length === 1) bindings[action][idx] = nk
              else if (e.shiftKey) bindings[action].splice(idx, 1)
              else bindings[action][idx] = nk
            }
          }
          saveBindings(bindings)
          nav.setPaused(false)
          renderGrid()
        }
        window.addEventListener('keydown', handler, true)
      }
    }

    renderMain()
  })
}

function injectCss(): HTMLStyleElement {
  const el = document.createElement('style')
  el.textContent = `
    .menu-root {
      position: fixed; inset: 0; z-index: 100;
      display: flex; align-items: center; justify-content: center;
      background:
        radial-gradient(ellipse at top, rgba(80,50,30,.15), transparent 60%),
        radial-gradient(ellipse at bottom, rgba(20,30,50,.2), transparent 60%),
        #07080c;
      color: #eee;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .menu-panel {
      width: min(560px, 92vw);
      padding: 36px 40px;
      background: rgba(15,15,18,.78);
      border: 1px solid rgba(255,255,255,.06);
      box-shadow: 0 30px 80px rgba(0,0,0,.6);
      backdrop-filter: blur(6px);
    }
    .menu-panel h1 {
      margin: 0 0 6px;
      font-size: 38px;
      letter-spacing: 4px;
      color: #f0d8a8;
      text-shadow: 0 0 12px rgba(240,180,80,.25);
    }
    .menu-panel h2 {
      margin: 0 0 6px;
      font-size: 26px;
      letter-spacing: 2px;
      color: #f0d8a8;
    }
    .menu-panel .sub {
      margin: 0 0 24px;
      opacity: .65;
      font-size: 13px;
    }
    .menu-actions { display: flex; flex-direction: column; gap: 10px; }
    .menu-actions.row { flex-direction: row; justify-content: flex-end; gap: 12px; }
    .menu-btn {
      width: 100%;
      padding: 14px 18px;
      background: #1c1d22;
      color: #e8e8e8;
      border: 1px solid #2a2b30;
      font: inherit;
      font-size: 15px;
      letter-spacing: .5px;
      cursor: pointer;
      text-align: left;
      outline: none;
      transition: background .15s, border-color .15s, transform .05s, box-shadow .15s;
    }
    .menu-actions.row .menu-btn { width: auto; text-align: center; }
    .menu-btn:hover:not(:disabled),
    .menu-btn.nav-focus:not(:disabled) {
      background: #25272d;
      border-color: #d9a058;
      box-shadow: 0 0 0 1px rgba(217,160,88,.35);
    }
    .menu-btn:active:not(:disabled) { transform: translateY(1px); }
    .menu-btn:disabled { opacity: .35; cursor: not-allowed; }
    .menu-btn.primary {
      background: #c98a3a;
      color: #1a140a;
      border-color: #d9a058;
      font-weight: 600;
    }
    .menu-btn.primary:hover:not(:disabled),
    .menu-btn.primary.nav-focus:not(:disabled) {
      background: #d99a4a;
      border-color: #e5b070;
      box-shadow: 0 0 0 2px rgba(229,176,112,.55);
    }
    .menu-foot {
      margin-top: 22px;
      font-size: 12px;
      opacity: .5;
      line-height: 1.55;
    }
    .bind-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-bottom: 22px;
      max-height: 50vh;
      overflow-y: auto;
    }
    .bind-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px;
      background: rgba(0,0,0,.25);
      border: 1px solid rgba(255,255,255,.04);
    }
    .bind-label { font-size: 14px; }
    .bind-keys { display: flex; gap: 6px; }
    .bind-key {
      min-width: 36px;
      padding: 6px 10px;
      background: #2a2c33;
      border: 1px solid #3a3d44;
      color: #eee;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: background .15s, border-color .15s, box-shadow .15s;
    }
    .bind-key:hover,
    .bind-key.nav-focus {
      background: #34373f;
      border-color: #d9a058;
      box-shadow: 0 0 0 1px rgba(217,160,88,.5);
    }
    .bind-key.capturing { background: #c98a3a; color: #1a140a; }
    .bind-key.add { background: transparent; opacity: .6; }
  `
  document.head.appendChild(el)
  return el
}
