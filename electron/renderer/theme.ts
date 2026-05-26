import * as monaco from 'monaco-editor'
import oneDark from './themes/one-dark.json'

/**
 * Tema do IDE carregado de JSON (electron/renderer/themes/*.json).
 *
 * O JSON tem duas seções:
 * - `cssVars` — variáveis aplicadas em `:root` (chrome do IDE: sidebar,
 *   editor tabs, preview, console, terminal, chat, tool cards).
 * - `monaco`  — `IStandaloneThemeData` que registra um tema do Monaco e
 *   é referenciado por nome no `editor.create({ theme })`.
 *
 * Para trocar de tema basta apontar para outro arquivo JSON com o
 * mesmo schema.
 */

interface ThemeFile {
  name: string
  displayName: string
  cssVars: Record<string, string>
  monaco: monaco.editor.IStandaloneThemeData
}

// Double cast via `unknown` porque o tipo inferido de `oneDark` a partir do
// JSON usa strings genéricas, e `monaco.editor.IStandaloneThemeData.base`
// exige a união literal `'vs' | 'vs-dark' | 'hc-black' | 'hc-light'`.
const theme = oneDark as unknown as ThemeFile

/**
 * Aplica as CSS vars em `:root` e registra o tema do Monaco. Deve ser
 * chamado uma vez no bootstrap do renderer, antes do Editor inicializar.
 */
export function applyTheme(): void {
  for (const [name, value] of Object.entries(theme.cssVars)) {
    document.documentElement.style.setProperty(name, value)
  }
  monaco.editor.defineTheme(theme.name, theme.monaco)
}

export function getThemeName(): string {
  return theme.name
}
