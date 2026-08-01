/**
 * Identidade do aplicativo (SPEC-0179).
 *
 * Trava duas coisas que um rebrand futuro tende a quebrar em silêncio:
 *
 * 1. **O nome de dados não acompanha o de exibição.** `APP_DATA_NAME` alimenta
 *    `app.setName()` e, por tabela, o `userData` — mudá-lo faz o Studio instalado
 *    perder preferências, projetos recentes e o histórico do Chat IA. É
 *    regressão silenciosa: o app abre normalmente, só que zerado.
 * 2. **As superfícies fora do TS não podem ficar para trás.** `productName`,
 *    os dois `welcome.title` e o `<title>` da janela são literais (arquivos de
 *    dado não importam o módulo), então o casamento é verificado aqui.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { APP_DISPLAY_NAME, APP_DATA_NAME, APP_WORDMARK } from '../../electron/appIdentity.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Nome anterior ao rebrand — não pode sobrar em nenhuma superfície do Studio. */
const LEGACY_NAME = 'Cortex Game Engine Studio'

/** Arquivos de dado que carregam o nome de exibição como literal. */
const electronBuilderPath = path.join(repoRoot, 'electron-builder.json')
const ptJsonPath = path.join(repoRoot, 'electron', 'renderer', 'i18n', 'pt.json')
const enJsonPath = path.join(repoRoot, 'electron', 'renderer', 'i18n', 'en.json')
const indexHtmlPath = path.join(repoRoot, 'electron', 'renderer', 'index.html')

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
}

describe('identidade do aplicativo', () => {
  it('expõe o nome de exibição do rebrand', () => {
    expect(APP_DISPLAY_NAME).toBe('TS Cortex Studio')
  })

  it('mantém o nome de DADOS congelado no valor legado', () => {
    // Se este teste falhar por causa de um rebrand, a correção NÃO é atualizar o
    // valor esperado: é reverter a mudança em APP_DATA_NAME. Ver appIdentity.ts.
    expect(APP_DATA_NAME).toBe(LEGACY_NAME)
  })

  it('não confunde a identidade de dados com a de exibição', () => {
    expect(APP_DATA_NAME).not.toBe(APP_DISPLAY_NAME)
  })

  it('tem um wordmark curto que acompanha o rebrand', () => {
    expect(APP_WORDMARK).toBe('ts cortex')
    // Cabe na faixa de 30px: mais curto que o nome completo.
    expect(APP_WORDMARK.length).toBeLessThan(APP_DISPLAY_NAME.length)
  })
})

describe('superfícies com o nome literal', () => {
  it('productName do instalador é o nome de exibição', async () => {
    const builder = await readJson(electronBuilderPath)
    expect(builder['productName']).toBe(APP_DISPLAY_NAME)
  })

  it('appId NÃO muda com o rebrand (senão o instalador não atualiza)', async () => {
    const builder = await readJson(electronBuilderPath)
    expect(builder['appId']).toBe('com.cortex.studio')
  })

  it('boas-vindas em pt e en trazem o nome novo', async () => {
    const pt = (await readJson(ptJsonPath))['welcome'] as { title: string }
    const en = (await readJson(enJsonPath))['welcome'] as { title: string }
    expect(pt.title).toContain(APP_DISPLAY_NAME)
    expect(en.title).toContain(APP_DISPLAY_NAME)
    expect(pt.title).not.toContain(LEGACY_NAME)
    expect(en.title).not.toContain(LEGACY_NAME)
  })

  it('título da janela é o nome do produto, não o do repositório', async () => {
    const html = await readFile(indexHtmlPath, 'utf-8')
    expect(html).toContain(`<title>${APP_DISPLAY_NAME}</title>`)
    expect(html).not.toContain('<title>cortex-game-engine</title>')
  })
})

describe('varredura do nome antigo', () => {
  /**
   * Arquivos de UI do Studio que exibiam o nome antes do rebrand. A varredura é
   * uma lista explícita (não um walk do diretório): é o conjunto que a SPEC-0179
   * enumera, e uma lista fixa não vira flake quando um arquivo novo aparece.
   */
  const uiSurfaces = [
    path.join(repoRoot, 'electron', 'main.ts'),
    path.join(repoRoot, 'electron', 'renderer', 'Launcher.ts'),
    path.join(repoRoot, 'electron', 'renderer', 'Welcome.ts'),
    indexHtmlPath,
    ptJsonPath,
    enJsonPath,
    electronBuilderPath,
  ]

  it.each(uiSurfaces)('%s não exibe mais o nome antigo', async (file) => {
    const content = await readFile(file, 'utf-8')
    expect(content).not.toContain(LEGACY_NAME)
  })

  it('a marca curta vem da constante, não de literal duplicado', async () => {
    // Antes do rebrand, 'cortex' estava escrito à mão nos dois arquivos — e por
    // ser minúsculo e curto escapou da busca pelo nome completo.
    for (const file of ['Shell.ts', 'Launcher.ts']) {
      const source = await readFile(path.join(repoRoot, 'electron', 'renderer', file), 'utf-8')
      expect(source).not.toContain("'cortex'")
      expect(source).toContain('APP_WORDMARK')
    }
  })

  it('o nome antigo sobrevive APENAS como identidade de dados', async () => {
    const source = await readFile(path.join(repoRoot, 'electron', 'appIdentity.ts'), 'utf-8')
    // A única ocorrência é a atribuição de APP_DATA_NAME (comentários citam o
    // termo "produto", não o literal).
    const occurrences = source.split(LEGACY_NAME).length - 1
    expect(occurrences).toBe(1)
  })
})
