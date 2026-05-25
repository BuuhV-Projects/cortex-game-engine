/**
 * Substitui window.prompt() — não suportado no Electron renderer.
 *
 * Mostra um <dialog> modal com input + botões Cancelar/OK. Retorna o valor
 * digitado (sem trim/validação) ou null se o usuário cancelar/fechar.
 */
export function customPrompt(
  title: string,
  options: { placeholder?: string; initial?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'custom-prompt-dialog'

    const titleEl = document.createElement('h2')
    titleEl.className = 'custom-prompt-title'
    titleEl.textContent = title

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'custom-prompt-input'
    if (options.placeholder) input.placeholder = options.placeholder
    if (options.initial) input.value = options.initial

    const actions = document.createElement('div')
    actions.className = 'custom-prompt-actions'

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancelar'
    cancel.className = 'custom-prompt-btn custom-prompt-btn--secondary'

    const ok = document.createElement('button')
    ok.type = 'button'
    ok.textContent = 'OK'
    ok.className = 'custom-prompt-btn custom-prompt-btn--primary'

    actions.appendChild(cancel)
    actions.appendChild(ok)

    dialog.appendChild(titleEl)
    dialog.appendChild(input)
    dialog.appendChild(actions)
    document.body.appendChild(dialog)

    let settled = false
    const close = (value: string | null): void => {
      if (settled) return
      settled = true
      dialog.close()
      dialog.remove()
      resolve(value)
    }

    cancel.addEventListener('click', () => close(null))
    ok.addEventListener('click', () => close(input.value))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value)
      if (e.key === 'Escape') close(null)
    })
    dialog.addEventListener('close', () => close(null))

    dialog.showModal()
    input.focus()
  })
}
