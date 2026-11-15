// Notas da release para o repo público (SPEC-0740): as do semantic-release apontam para o repo privado do engine
// (links de commit, de comparação e de issue, que dão 404 fora e expõem os hashes). Tira esses links e deixa o texto.
// Uso (no workflow): NOTES="..." PRIVATE_REPO=owner/nome node .github/scripts/public-notes.mjs > notas.md
import { pathToFileURL } from 'node:url'

/** Nome de repo do GitHub (`owner/nome`): letras, dígitos, `-`, `_` e `.`; só o `.` é especial na regex. */
const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

/** Notas sem nenhum link para `privateRepo` (`owner/nome`): link de commit some, os demais viram só o texto. */
export function publicNotes(notes, privateRepo) {
  if (!REPO_NAME.test(privateRepo)) throw new Error(`repo inválido: ${privateRepo}`)
  const base = `https://github[.]com/${privateRepo.split('.').join('[.]')}/`
  const commitLink = new RegExp(String.raw` ?\(\[[0-9a-f]{7,40}\]\(${base}commit/[0-9a-f]+\)\)`, 'g')
  const anyLink = new RegExp(String.raw`\[([^\]]+)\]\(${base}[^)]*\)`, 'g')
  return notes.replace(commitLink, '').replace(anyLink, '$1')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.PRIVATE_REPO
  if (!repo) throw new Error('PRIVATE_REPO ausente')
  process.stdout.write(publicNotes(process.env.NOTES ?? '', repo))
}
