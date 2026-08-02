#!/usr/bin/env node
/**
 * Pré-checagem de Blender — trava as skills que dependem dele (SPEC-0181).
 *
 * Blender não é opcional para processar kit 3D, medir mapa autorado ou renderizar
 * as 4 vistas de validação: sem ele o passo não tem substituto, e seguir "sem as
 * vistas" entrega fase não-validada com cara de pronta. Então a skill roda isto
 * ANTES de qualquer coisa; saída != 0 significa PARE e reporte ao usuário.
 *
 * Imprime o caminho do executável no stdout (para `BLENDER=$(node check-blender.mjs)`).
 */
import { existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/** Raízes onde o instalador oficial põe o Blender, por plataforma. */
const INSTALL_ROOTS = {
  win32: ['C:/Program Files/Blender Foundation', 'C:/Program Files (x86)/Blender Foundation'],
  darwin: ['/Applications/Blender.app/Contents/MacOS', '/Applications'],
  linux: ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt'],
}

const EXE_NAME = { win32: 'blender.exe', darwin: 'Blender', linux: 'blender' }

/**
 * Resolve o executável do Blender.
 *
 * Ordem: `BLENDER_PATH` (explícito vence sempre; apontar pro nada NÃO cai em
 * fallback — configuração errada tem que doer) → `blender` no PATH → varredura
 * das raízes de instalação, preferindo a versão mais nova.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} platform
 * @param {(cmd: string) => boolean} onPath testa se um comando existe no PATH
 * @param {string[]} [roots] raízes de instalação (default: as da plataforma)
 * @returns {string | null} caminho absoluto, ou null se não achou
 */
export function findBlender(env, platform, onPath, roots = INSTALL_ROOTS[platform] ?? []) {
  const explicit = env.BLENDER_PATH?.trim()
  if (explicit) return existsSync(explicit) ? explicit : null

  const exe = EXE_NAME[platform] ?? 'blender'
  if (onPath(exe)) return exe

  for (const root of roots) {
    if (!existsSync(root)) continue
    // "Blender 5.1", "Blender 4.2"… — a mais nova primeiro.
    const versions = safeReaddir(root)
      .filter((d) => /^blender/i.test(d))
      .sort()
      .reverse()
    for (const dir of [...versions, '']) {
      const candidate = join(root, dir, exe)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isOnPath(cmd) {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which'
    execFileSync(probe, [cmd], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Só executa a checagem quando chamado como script (permite importar em teste).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const found = findBlender(process.env, process.platform, isOnPath)
  if (!found) {
    process.stderr.write(
      'BLENDER AUSENTE — esta skill não pode continuar.\n\n' +
        'Blender é pré-requisito obrigatório: converter/medir modelos 3D e renderizar as\n' +
        'vistas de validação não têm substituto. Seguir sem ele produziria um kit não\n' +
        'medido ou uma fase não validada — pior que não entregar.\n\n' +
        'Como resolver:\n' +
        '  1. Instale o Blender (https://www.blender.org/download/).\n' +
        '  2. Se já estiver instalado fora do caminho padrão, aponte BLENDER_PATH para o\n' +
        '     executável (ex.: BLENDER_PATH="C:/Program Files/Blender Foundation/Blender 5.1/blender.exe").\n\n' +
        'PARE aqui e informe isso ao usuário.\n',
    )
    process.exit(1)
  }
  process.stdout.write(found)
}
