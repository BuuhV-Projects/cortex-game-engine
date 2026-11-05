/**
 * Classificação de arquivo por extensão: linguagem do Monaco e tipo de preview
 * (imagem/markdown). Extraído do `Editor.ts` — nada aqui depende do editor.
 */

// Mapeia extensão de arquivo para a linguagem reconhecida pelo Monaco
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  html: 'html',
  css: 'css',
  md: 'markdown',
}

export function detectLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext'
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** `true` se o arquivo é uma imagem (abre como preview, não no editor de código). */
export function isImageFile(name: string): boolean {
  return extOf(name) in IMAGE_MIME
}

/** `true` se o arquivo é markdown (abre renderizado como preview). */
export function isMarkdownFile(name: string): boolean {
  const e = extOf(name)
  return e === 'md' || e === 'markdown'
}

export function mimeForImage(name: string): string {
  return IMAGE_MIME[extOf(name)] ?? 'application/octet-stream'
}
