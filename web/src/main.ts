import { applyTranslations, setupLanguageToggle } from './i18n'

// Aplica idioma na primeira renderização e liga o toggle EN/PT.
applyTranslations()
setupLanguageToggle()

// Estilo do toggle quando ativo — inline pra evitar mais um CSS no shell.
const style = document.createElement('style')
style.textContent = `[data-lang].active { background: rgb(39 39 42); color: white; }`
document.head.appendChild(style)
