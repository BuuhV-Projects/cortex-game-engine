/**
 * Handlers IPC — setup de Tauri (ADR-0024). SPEC-0693.
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { readFile, writeFile, cp } from 'fs/promises'
import { existsSync } from 'fs'
import { writePlaceholderIcons } from '../installer-icons.js'
import { ensureGitignoreEntry, resourceBase, validatePath } from './shared.js'

export function registerInstallerIpc(): void {
  /**
   * Verifica se um projeto já tem Tauri configurado: precisa ter
   * `src-tauri/tauri.conf.json` E o script `tauri:build` no package.json.
   *
   * Projetos criados antes do template Tauri-ready não têm nada disso;
   * `installer:setup` instala. Projetos novos já saem prontos.
   */
  ipcMain.handle('installer:check', async (_event, projectDir: unknown) => {
    const safeDir = validatePath(projectDir)
    try {
      await readFile(join(safeDir, 'src-tauri', 'tauri.conf.json'), 'utf-8')
    } catch {
      return { configured: false }
    }
    try {
      const pkgRaw = await readFile(join(safeDir, 'package.json'), 'utf-8')
      const pkg = JSON.parse(pkgRaw)
      if (!pkg?.scripts?.['tauri:build']) return { configured: false }
    } catch {
      return { configured: false }
    }
    // Detecção de projeto legado: Cargo.toml declara `[lib] name = game_app_lib`
    // mas src/lib.rs não existe (template inicial estava incompleto). Sem isso,
    // `cargo metadata` falha. Reaplicar o setup escreve o lib.rs e o main.rs novo.
    if (!existsSync(join(safeDir, 'src-tauri', 'src', 'lib.rs'))) {
      return { configured: false }
    }
    // Faltam ícones obrigatórios (tauri.conf.json referencia eles): reaplicar
    // setup gera placeholders cinza-azulado automaticamente.
    if (!existsSync(join(safeDir, 'src-tauri', 'icons', 'icon.ico'))) {
      return { configured: false }
    }
    return { configured: true }
  })

  /**
   * Configura Tauri num projeto existente: copia `templates/new-project/src-tauri/`
   * para o projeto (substituindo `{{PROJECT_NAME}}` pelo nome real) e mescla
   * scripts + devDependencies do template no package.json do projeto.
   *
   * Idempotente: se `src-tauri/` já existe, mantém. Se o package.json já tem
   * os scripts, não duplica. Não toca em vite.config.ts (usuário pode ter
   * editado) — o README do template explica os ajustes recomendados.
   */
  ipcMain.handle('installer:setup', async (_event, projectDir: unknown) => {
    const safeDir = validatePath(projectDir)
    const projectName = safeDir.split(/[\\/]/).filter(Boolean).pop() ?? 'game'

    // ── 1. Copia src-tauri/ do template ─────────────────────────────────────
    // cp recursivo com force:false: preenche arquivos faltantes (ex.: lib.rs
    // novo num projeto legado) sem sobrescrever edições do usuário.
    const tauriDir = join(safeDir, 'src-tauri')
    const templateTauriDir = join(resourceBase(), 'templates', 'new-project', 'src-tauri')
    await cp(templateTauriDir, tauriDir, { recursive: true, force: false, errorOnExist: false })

    // Substitui {{PROJECT_NAME}} nos arquivos de texto copiados (Cargo.toml,
    // tauri.conf.json). Walk recursivo limitado aos arquivos de texto que o
    // template conhece — evita tocar acidentalmente em binários futuros.
    const TEXT_FILES = [
      'Cargo.toml',
      'tauri.conf.json',
      'src/main.rs',
      'src/lib.rs',
      'build.rs',
      '.gitignore',
    ]
    for (const rel of TEXT_FILES) {
      const filePath = join(tauriDir, rel)
      try {
        const content = await readFile(filePath, 'utf-8')
        if (content.includes('{{PROJECT_NAME}}')) {
          await writeFile(filePath, content.replaceAll('{{PROJECT_NAME}}', projectName), 'utf-8')
        }
      } catch {
        // Arquivo pode não existir (ex: .gitignore renomeado); ignorar.
      }
    }

    // ── 1.b Sobrescreve arquivos Rust em projetos legados ──────────────────
    // Projetos configurados pela versão antiga do setup têm um main.rs que
    // chama `tauri::Builder::default().run(...)` direto e nenhum lib.rs.
    // Cargo.toml declara `[lib] name = "game_app_lib"`, então `cargo metadata`
    // falha procurando lib.rs. O cp acima já copiou o lib.rs novo (não
    // existia no destino), mas o main.rs antigo continua incompatível —
    // forçar sobrescrita aqui resolve.
    const mainRsPath = join(tauriDir, 'src', 'main.rs')
    const mainRsTemplate = await readFile(join(templateTauriDir, 'src', 'main.rs'), 'utf-8')
    const mainRsCurrent = await readFile(mainRsPath, 'utf-8').catch(() => '')
    if (!mainRsCurrent.includes('game_app_lib::run')) {
      await writeFile(mainRsPath, mainRsTemplate, 'utf-8')
    }

    // ── 1.c Gera ícones placeholder ────────────────────────────────────────
    // Sem `icons/icon.ico`, o tauri build falha. Geramos um PNG cinza-azulado
    // sólido em todos os tamanhos exigidos e um .ico com PNG embutido —
    // suficiente pro primeiro `tauri build` rodar. Usuário substitui depois
    // com `yarn tauri icon <png>` quando tiver a arte do jogo. Idempotente:
    // a função pula se `icon.ico` já existe.
    const iconsGenerated = await writePlaceholderIcons(tauriDir)

    // ── 2. Merge package.json ───────────────────────────────────────────────
    const pkgPath = join(safeDir, 'package.json')
    const pkgRaw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgRaw) as {
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    pkg.scripts = {
      ...pkg.scripts,
      build: pkg.scripts?.build ?? 'vite build',
      tauri: pkg.scripts?.tauri ?? 'tauri',
      'tauri:dev': pkg.scripts?.['tauri:dev'] ?? 'tauri dev',
      'tauri:build': pkg.scripts?.['tauri:build'] ?? 'tauri build',
    }
    pkg.devDependencies = {
      ...pkg.devDependencies,
      '@tauri-apps/cli': pkg.devDependencies?.['@tauri-apps/cli'] ?? '^2',
    }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')

    // Projetos legados podem não ter `src-tauri/` no .gitignore — garante.
    await ensureGitignoreEntry(safeDir, 'src-tauri/')

    return { ok: true, iconsGenerated }
  })
}
