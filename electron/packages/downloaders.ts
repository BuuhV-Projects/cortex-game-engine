import { execFile } from 'child_process'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AssetDownloader } from './installer.js'

/**
 * Downloaders de asset de GitHub Release (SPEC-0641 §4). O público vai por HTTPS
 * direto; o privado passa pelo `gh` do usuário — o Studio nunca lê, recebe ou
 * guarda token: quem autentica é o próprio `gh`.
 */

/** HTTPS da URL pública do asset. 404 (inexistente ou repo privado) → null. */
export const httpsReleaseDownloader: AssetDownloader = async (repo, tag, file) => {
  const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`
  const res = await fetch(url, { redirect: 'follow' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`download de ${file} falhou: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** `gh release download` numa pasta temporária. Sem `gh` / sem acesso → null. */
export const ghReleaseDownloader: AssetDownloader = async (repo, tag, file) => {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-pkg-'))
  try {
    const ok = await new Promise<boolean>((resolve) => {
      execFile(
        'gh',
        ['release', 'download', tag, '-R', repo, '-p', file, '-D', dir, '--clobber'],
        { windowsHide: true, timeout: 30 * 60_000 },
        (err) => resolve(!err),
      )
    })
    if (!ok) return null
    return new Uint8Array(await readFile(join(dir, file)))
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
