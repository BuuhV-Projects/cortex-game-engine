/**
 * Sistema de i18n simples para landing + docs.
 *
 * - Sem deps externas. Strings em JSON, função `t(key)` faz lookup
 *   por path (`hero.title_part1`).
 * - Persistência em `localStorage`. Default `'en'` (decisão de
 *   produto: jogadores e devs internacionais primeiro).
 * - Aplica via atributos `data-i18n` (textContent) e
 *   `data-i18n-html` (innerHTML) ao chamar `applyTranslations()`.
 * - Dispara `CustomEvent('locale-change')` no `document` quando
 *   o idioma muda — `docs.ts` reage pra rebuildar a sidebar.
 */

import en from '../i18n/en.json'
import pt from '../i18n/pt.json'

export type Locale = 'en' | 'pt'

const STORAGE_KEY = 'cortex-locale'
const DICTS = { en, pt } as const

export function getCurrentLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'pt') return stored
  return 'en'
}

export function setLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en'
  document.dispatchEvent(new CustomEvent('locale-change', { detail: { locale } }))
}

export function t(key: string): string {
  const dict = DICTS[getCurrentLocale()] as Record<string, unknown>
  const value = key.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, dict)
  return typeof value === 'string' ? value : key
}

/**
 * Aplica as traduções em todos os elementos do documento com
 * `data-i18n="path.to.key"` (textContent) ou
 * `data-i18n-html="path.to.key"` (innerHTML).
 *
 * Também atualiza `<title>` via `data-i18n-title` e
 * `<meta name="description">` via `data-i18n-description`.
 */
export function applyTranslations(): void {
  const locale = getCurrentLocale()
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en'

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset['i18n']
    if (key) el.textContent = t(key)
  })

  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.dataset['i18nHtml']
    if (key) el.innerHTML = t(key)
  })

  const titleKey = document.querySelector<HTMLElement>('[data-i18n-title]')?.dataset['i18nTitle']
  if (titleKey) document.title = t(titleKey)

  const descEl = document.querySelector<HTMLMetaElement>('meta[data-i18n-description]')
  const descKey = descEl?.dataset['i18nDescription']
  if (descEl && descKey) descEl.content = t(descKey)
}

/**
 * Atualiza estado visual (classe `active`) dos botões `[data-lang]`
 * e registra listener de clique pra trocar idioma.
 *
 * Chamar uma vez no boot. Idempotente — só registra listener uma vez
 * por elemento via flag `dataset.langBound`.
 */
export function setupLanguageToggle(): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-lang]')
  const current = getCurrentLocale()

  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset['lang'] === current)
    if (btn.dataset['langBound'] === 'true') return
    btn.dataset['langBound'] = 'true'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const locale = btn.dataset['lang']
      if (locale !== 'en' && locale !== 'pt') return
      setLocale(locale)
      applyTranslations()
      buttons.forEach((b) => b.classList.toggle('active', b.dataset['lang'] === locale))
    })
  })
}
