/**
 * Modal de boas-vindas mostrado na primeira execução da IDE (ADR-0025).
 *
 * Pede pro usuário escolher entre EN e PT. Default selecionado é EN
 * (decisão de produto). Persistência via `prefs:set(welcomed: true, locale)`.
 *
 * Usa `<dialog>` nativo — mesma abordagem do `ProjectManager`. Estilos
 * inline pra evitar dependência do styles.css (welcome roda ANTES do
 * resto da UI ser construída, o CSS pode não ter sido carregado ainda
 * em alguns cenários de cold start).
 */

import { setLocale, markWelcomed, type Locale, t } from './i18n'
import { APP_DISPLAY_NAME } from '../appIdentity'

export function showWelcomeModal(): Promise<Locale> {
  return new Promise<Locale>((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.style.cssText = [
      'border: 1px solid #3f3f46',
      'border-radius: 12px',
      'background: #18181b',
      'color: #f4f4f5',
      'padding: 32px',
      'max-width: 480px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ].join(';')

    // Backdrop blur via ::backdrop
    const style = document.createElement('style')
    style.textContent = `dialog.cortex-welcome::backdrop { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }`
    document.head.appendChild(style)
    dialog.className = 'cortex-welcome'

    const title = document.createElement('h2')
    title.style.cssText = 'margin: 0 0 8px; font-size: 1.5rem; font-weight: 600;'
    title.textContent = t('welcome.title')

    const subtitle = document.createElement('p')
    subtitle.style.cssText = 'margin: 0 0 24px; color: #a1a1aa; font-size: 0.95rem;'
    subtitle.textContent = t('welcome.subtitle')

    let selected: Locale = 'en'

    const options = document.createElement('div')
    options.style.cssText = 'display: flex; gap: 12px; margin-bottom: 24px;'

    const enBtn = makeLangButton('en', 'English', true)
    const ptBtn = makeLangButton('pt', 'Português', false)

    enBtn.addEventListener('click', () => {
      selected = 'en'
      enBtn.dataset['selected'] = 'true'
      ptBtn.dataset['selected'] = 'false'
      applyButtonStyle(enBtn, true)
      applyButtonStyle(ptBtn, false)
      title.textContent = `Welcome to ${APP_DISPLAY_NAME}`
      subtitle.textContent = 'Choose your language to get started.'
      continueBtn.textContent = 'Continue'
    })
    ptBtn.addEventListener('click', () => {
      selected = 'pt'
      enBtn.dataset['selected'] = 'false'
      ptBtn.dataset['selected'] = 'true'
      applyButtonStyle(enBtn, false)
      applyButtonStyle(ptBtn, true)
      title.textContent = `Bem-vindo ao ${APP_DISPLAY_NAME}`
      subtitle.textContent = 'Escolha o seu idioma para começar.'
      continueBtn.textContent = 'Continuar'
    })

    options.appendChild(enBtn)
    options.appendChild(ptBtn)

    const continueBtn = document.createElement('button')
    continueBtn.type = 'button'
    continueBtn.textContent = t('welcome.continue')
    continueBtn.style.cssText = [
      'width: 100%',
      'padding: 12px 24px',
      'background: #0ea5e9',
      'color: white',
      'border: none',
      'border-radius: 8px',
      'font-size: 0.95rem',
      'font-weight: 500',
      'cursor: pointer',
      'transition: background 0.15s',
    ].join(';')
    continueBtn.addEventListener('mouseenter', () => {
      continueBtn.style.background = '#0284c7'
    })
    continueBtn.addEventListener('mouseleave', () => {
      continueBtn.style.background = '#0ea5e9'
    })
    continueBtn.addEventListener('click', () => {
      void (async () => {
        await setLocale(selected)
        await markWelcomed()
        dialog.close()
        dialog.remove()
        style.remove()
        resolve(selected)
      })()
    })

    dialog.appendChild(title)
    dialog.appendChild(subtitle)
    dialog.appendChild(options)
    dialog.appendChild(continueBtn)

    document.body.appendChild(dialog)
    dialog.showModal()
  })
}

function makeLangButton(locale: Locale, label: string, selected: boolean): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = label
  btn.dataset['locale'] = locale
  btn.dataset['selected'] = selected ? 'true' : 'false'
  applyButtonStyle(btn, selected)
  return btn
}

function applyButtonStyle(btn: HTMLButtonElement, selected: boolean): void {
  btn.style.cssText = [
    'flex: 1',
    'padding: 14px',
    `background: ${selected ? '#0c4a6e' : '#27272a'}`,
    `border: 1px solid ${selected ? '#0ea5e9' : '#3f3f46'}`,
    'color: #f4f4f5',
    'border-radius: 8px',
    'font-size: 0.95rem',
    'font-weight: 500',
    'cursor: pointer',
    'transition: all 0.15s',
  ].join(';')
}
