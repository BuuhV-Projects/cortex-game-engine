/**
 * **Lint de trechos** (spec 0005) — verificador DETERMINÍSTICO dos trechos
 * fatiados (`assets/chunks/`). É o juiz do loop fatiar → lint → corrigir →
 * re-fatiar (método "Loop Engineer": sinal verificável em vez de olhômetro em
 * screenshot — foi olhômetro que deixou passar checkpoint de lado e cerca
 * tombada no 1º sweep).
 *
 * Regras (cada uma nasceu de um defeito real apontado em playtest):
 *  R1  gameplay eixo-alinhado — checkpoint/finish/trampolim/canhão com
 *      tombamento (rotX/rotZ) ou rotY fora de múltiplo de 90° = ERRO.
 *      (checkpoint de lado vira portal que o player não atravessa)
 *  R2  moldura tombada — cerca/barreira/estaca com |rotX|>30° ou |rotZ|>30°
 *      = ERRO (destroço do demo sem contexto no trecho recomposto).
 *  R3  gameplay flutuante — peça de gameplay sem pista num raio de 6 m no
 *      plano XZ = AVISO (provável órfã de corte).
 *  R4  catálogo são — entryY/exitY/length finitos; maxGap > 3.2 m vira AVISO
 *      (trecho só encaixável com canhão; não pode entrar em fase simples).
 *
 * Uso: node tools/lint_chunks.mjs   → imprime o laudo; exit 1 se houver ERRO.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CHUNKS_DIR = join(ROOT, 'assets/chunks')

const GAMEPLAY = new Set(['checkpoint', 'finish', 'trampoline', 'cannon'])
const FRAME = new Set(['borda'])
const TRACK = new Set(['ground', 'pista'])
const TILT_MAX = 30 * (Math.PI / 180)
const SNAP = Math.PI / 2

const errors = []
const warns = []

// Tombamento pela MATRIZ (Euler XYZ, convenção three.js): ângulo do UP local
// vs UP do mundo, |dot| ignora flip — (−172°,1°,1°) é yaw com flip e renderiza
// em pé; NÃO é peça caída. Mesma matemática do fatiador (regras R1/R2).
function tiltOf([x, y, z]) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  const qx = s1 * c2 * c3 + c1 * s2 * s3
  const qz = c1 * c2 * s3 + s1 * s2 * c3
  // Componente Y do UP rotacionado: y' = 1 − 2(qx² + qz²).
  const upY = 1 - 2 * (qx * qx + qz * qz)
  return Math.acos(Math.min(1, Math.abs(upY)))
}

for (const worldDir of readdirSync(CHUNKS_DIR)) {
  const dir = join(CHUNKS_DIR, worldDir)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'catalog.json')) {
    const chunk = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const where = `${worldDir}/${chunk.id}`

    // R4 — catálogo são
    for (const k of ['length', 'entryY', 'exitY']) {
      if (!Number.isFinite(chunk[k])) errors.push(`R4 ${where}: campo ${k} inválido (${chunk[k]})`)
    }
    if ((chunk.maxGap ?? 0) > 3.2) {
      warns.push(`R4 ${where}: vão interno de ${chunk.maxGap}m (> pulo) — só entra em fase com canhão calibrado`)
    }

    const track = chunk.pieces.filter((p) => TRACK.has(p.cat))
    for (const p of chunk.pieces) {
      const [rx, ry, rz] = p.rot
      // R1 — gameplay eixo-alinhado: sem tombamento; portal (checkpoint/finish/
      // trampolim) travado em múltiplo de 90°; canhão tem yaw livre (mira).
      if (GAMEPLAY.has(p.cat)) {
        const offSnap = p.cat === 'cannon' ? 0 : Math.abs(ry - Math.round(ry / SNAP) * SNAP)
        if (Math.abs(rx) > 0.05 || Math.abs(rz) > 0.05 || offSnap > 0.05) {
          errors.push(`R1 ${where}: ${p.file} (${p.cat}) desalinhada — rot ${p.rot.map((v) => (v * 57.3).toFixed(0) + '°').join(',')}`)
        }
        // R3 — gameplay flutuante (sem pista por perto no plano XZ)
        const near = track.some((t) => (t.pos[0] - p.pos[0]) ** 2 + (t.pos[2] - p.pos[2]) ** 2 < 36)
        if (track.length && !near) {
          warns.push(`R3 ${where}: ${p.file} (${p.cat}) sem pista num raio de 6m — órfã de corte?`)
        }
      }
      // R2 — moldura tombada DE VERDADE (tombamento pela matriz, não pelo Euler)
      if (FRAME.has(p.cat) && tiltOf(p.rot) > TILT_MAX) {
        errors.push(`R2 ${where}: ${p.file} tombada ${(tiltOf(p.rot) * 57.3).toFixed(0)}° — rot ${p.rot.map((v) => (v * 57.3).toFixed(0) + '°').join(',')}`)
      }
    }
  }
}

console.log(`lint_chunks: ${errors.length} erro(s), ${warns.length} aviso(s)`)
for (const e of errors) console.log('  ERRO ', e)
for (const w of warns) console.log('  aviso', w)
process.exit(errors.length ? 1 : 0)
