/**
 * i18n da IDE (ADR-0025).
 *
 * - Dois idiomas: en (default) e pt.
 * - Persistência via IPC `prefs:get`/`prefs:set` em
 *   `<userData>/preferences.json` — sobrevive a reinstalações da IDE
 *   (preferences ficam no perfil do usuário, não no diretório do app).
 * - `t(key)` faz lookup por path (`fileTree.no_project`).
 * - `init()` é assíncrono porque precisa ler preferências via IPC; deve
 *   ser awaited antes de construir os componentes da UI.
 * - Componentes que precisam re-renderizar ao trocar de idioma escutam
 *   `locale-change` no `document`.
 */

import en from './i18n/en.json'
import pt from './i18n/pt.json'

export type Locale = 'en' | 'pt'

const DICTS = { en, pt } as const

let currentLocale: Locale = 'en'

/**
 * Carrega o locale persistido do usuário. Deve ser chamado uma vez
 * no boot do renderer, ANTES de construir os componentes — caso
 * contrário a UI sai em inglês e re-renderiza pra pt no segundo frame.
 */
export async function initI18n(): Promise<{ welcomed: boolean }> {
  const prefs = await window.electronAPI.prefsGet()
  if (prefs.locale === 'en' || prefs.locale === 'pt') {
    currentLocale = prefs.locale
  }
  return { welcomed: prefs.welcomed === true }
}

export function getLocale(): Locale {
  return currentLocale
}

export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale
  await window.electronAPI.prefsSet({ locale })
  // Reconstrói o menu nativo (Project/Generate installer...) no idioma novo.
  await window.electronAPI.menuRebuild(locale)
  document.dispatchEvent(new CustomEvent('locale-change', { detail: { locale } }))
}

/** Marca o usuário como "já viu o welcome" — não mostra mais o modal. */
export async function markWelcomed(): Promise<void> {
  await window.electronAPI.prefsSet({ welcomed: true })
}

/**
 * Lookup de string traduzida por path. Suporta interpolação `{name}` →
 * passar `params` (`t('bottomPanel.process_exited', { code: 0 })`).
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[currentLocale] as Record<string, unknown>
  const raw = key.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, dict)
  const value = typeof raw === 'string' ? raw : key
  if (!params) return value
  return value.replace(/\{(\w+)\}/g, (_m, k: string) =>
    k in params ? String(params[k]) : `{${k}}`,
  )
}
