/**
 * Testes do plugin local `cortex-studio` (ADR-0180 / SPEC-0181).
 *
 * Duas frentes: a resolução do diretório (dev vs empacotado, e o fallback
 * silencioso) e a INTEGRIDADE do plugin real do repositório — que agora é
 * artefato distribuído no instalador. Uma skill sem frontmatter válido não é
 * descoberta pelo SDK, e o sintoma no Studio seria "a IA ignorou a skill", sem
 * erro nenhum. O teste transforma isso em falha de build.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolvePluginDir, PLUGIN_NAME, LEVEL_BUILDER_AGENT } from '../../electron/agent/plugin.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_DIR = join(REPO_ROOT, '.claude')

/** Cria um diretório com o manifesto de plugin dentro. */
function makePlugin(base: string, name: string): string {
  const dir = join(base, name)
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '1.0.0' }))
  return dir
}

describe('resolvePluginDir', () => {
  it('acha o plugin empacotado (resources/agent-plugin)', () => {
    const base = mkdtempSync(join(tmpdir(), 'cortex-plugin-'))
    const expected = makePlugin(base, 'agent-plugin')
    expect(resolvePluginDir(base)).toBe(expected)
  })

  it('acha o layout de dev (.claude na raiz do repo)', () => {
    const base = mkdtempSync(join(tmpdir(), 'cortex-plugin-'))
    const expected = makePlugin(base, '.claude')
    expect(resolvePluginDir(base)).toBe(expected)
  })

  it('prefere o empacotado quando os dois existem', () => {
    const base = mkdtempSync(join(tmpdir(), 'cortex-plugin-'))
    const packaged = makePlugin(base, 'agent-plugin')
    makePlugin(base, '.claude')
    expect(resolvePluginDir(base)).toBe(packaged)
  })

  it('devolve null sem manifesto — o turno roda sem skills, não falha', () => {
    const base = mkdtempSync(join(tmpdir(), 'cortex-plugin-'))
    mkdirSync(join(base, 'agent-plugin', 'skills'), { recursive: true }) // sem .claude-plugin/
    expect(resolvePluginDir(base)).toBeNull()
    expect(resolvePluginDir(join(base, 'nao-existe'))).toBeNull()
  })
})

describe('plugin real do repositório', () => {
  it('tem manifesto com o nome que prefixa o subagente', () => {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf-8'),
    ) as { name?: string; version?: string; description?: string }
    expect(manifest.name).toBe(PLUGIN_NAME)
    expect(manifest.version).toBeTruthy()
    expect(manifest.description).toBeTruthy()
    expect(LEVEL_BUILDER_AGENT).toBe(`${PLUGIN_NAME}:level-builder`)
  })

  it('é resolvido a partir da raiz do repositório (caminho de dev)', () => {
    expect(resolvePluginDir(REPO_ROOT)).toBe(PLUGIN_DIR)
  })

  it('expõe o subagente level-builder com frontmatter válido', () => {
    const md = readFileSync(join(PLUGIN_DIR, 'agents', 'level-builder.md'), 'utf-8')
    expect(md.startsWith('---')).toBe(true)
    expect(md).toMatch(/^name:\s*level-builder$/m)
    expect(md).toMatch(/^description:\s*\S+/m)
  })

  it('traz as skills do pipeline de fase, cada uma com name + description', () => {
    const skillsDir = join(PLUGIN_DIR, 'skills')
    const skills = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)

    // As duas primeiras vieram do ~/.claude global no ADR-0180: sem elas, o
    // pipeline montar-fase perde método de construção e critérios de design.
    for (const required of [
      'montar-jogo',
      'level-design-plataforma',
      'montar-fase',
      'blueprint-fase',
      'fase-por-trechos',
      'process-asset-kit',
      'process-asset-kit-2d',
    ]) {
      expect(skills).toContain(required)
    }

    for (const skill of skills) {
      const path = join(skillsDir, skill, 'SKILL.md')
      expect(existsSync(path), `${skill} sem SKILL.md`).toBe(true)
      const md = readFileSync(path, 'utf-8')
      expect(md.startsWith('---'), `${skill}: frontmatter ausente`).toBe(true)
      // O `name` do frontmatter é a chave de invocação — divergir do diretório
      // faz a skill existir e não ser chamável pelo nome que a doc anuncia.
      expect(md, `${skill}: name divergente`).toMatch(new RegExp(`^name:\\s*${skill}$`, 'm'))
      expect(md, `${skill}: sem description`).toMatch(/^description:\s*\S+/m)
    }
  })

  it('não deixa caminho absoluto do repositório cravado nas skills', () => {
    const skillsDir = join(PLUGIN_DIR, 'skills')
    for (const skill of readdirSync(skillsDir)) {
      const path = join(skillsDir, skill, 'SKILL.md')
      if (!existsSync(path)) continue
      const md = readFileSync(path, 'utf-8')
      // No Studio o cwd é o projeto do jogo: caminho do repo da engine não
      // existe. Scripts e kits têm que vir de $CORTEX_PLUGIN_DIR/$CORTEX_KITS_DIR.
      expect(md, `${skill}: caminho absoluto do repo cravado`).not.toMatch(
        /[dD]:\/@buuhvprojects\/js-game-engine/,
      )
    }
  })
})
