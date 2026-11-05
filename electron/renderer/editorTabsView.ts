/** Botão do mouse do meio (scroll) — fecha a aba, como em browsers e no VS Code. */
const MIDDLE_MOUSE_BUTTON = 1

/** Dados que a barra de abas precisa de cada aba aberta. */
export interface TabView {
  path: string
  name: string
  dirty: boolean
}

/**
 * Redesenha a barra de abas do editor. Função pura de view: recebe as abas e os
 * callbacks, não conhece models nem o Monaco. Extraída do `Editor.ts`.
 */
export function renderEditorTabs(
  bar: HTMLElement,
  tabs: Iterable<TabView>,
  activePath: string | null,
  handlers: { onActivate: (path: string) => void; onClose: (path: string) => void },
): void {
  bar.innerHTML = ''
  for (const tab of tabs) {
    const el = document.createElement('div')
    el.className = 'editor-tab'
    if (tab.path === activePath) el.classList.add('active')
    if (tab.dirty) el.classList.add('dirty')
    el.addEventListener('click', () => handlers.onActivate(tab.path))
    // Middle-click (botão do scroll) fecha a aba — convenção de browsers
    // e VS Code. `mousedown` é mais previsível que `auxclick` em Electron.
    // preventDefault evita o cursor de auto-scroll do middle-click.
    el.addEventListener('mousedown', (e) => {
      if (e.button === MIDDLE_MOUSE_BUTTON) {
        e.preventDefault()
        handlers.onClose(tab.path)
      }
    })

    const label = document.createElement('span')
    label.className = 'editor-tab-label'
    label.textContent = tab.name

    // Indicador de "modificado, não salvo". Visível só quando dirty;
    // some no hover para dar lugar ao botão de fechar.
    const dot = document.createElement('span')
    dot.className = 'editor-tab-dot'
    dot.textContent = '●'

    const close = document.createElement('button')
    close.className = 'editor-tab-close'
    close.textContent = '×'
    close.title = 'Fechar'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      handlers.onClose(tab.path)
    })

    el.appendChild(label)
    el.appendChild(dot)
    el.appendChild(close)
    bar.appendChild(el)
  }
}
