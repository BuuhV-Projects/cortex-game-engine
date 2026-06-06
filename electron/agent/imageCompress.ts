import { nativeImage } from 'electron'

/** Resultado da compressão: buffer comprimido + extensão/mime correspondentes. */
export interface CompactImage {
  /** Bytes da imagem comprimida (ou o original, se a compressão não ajudou). */
  data: Buffer
  /** `'jpg'` quando comprimiu, `'png'` no fallback. */
  ext: 'jpg' | 'png'
  /** Media type pro bloco multimodal. */
  mimeType: 'image/jpeg' | 'image/png'
}

/**
 * Encolhe uma imagem (PNG/JPEG) pra um JPEG redimensionado. As imagens que as
 * tools devolvem ao agente (screenshots de playtest, thumbnails de asset) viram
 * **image blocks** que acumulam na sessão do Claude Agent SDK e são reenviados a
 * cada turno — um punhado de PNGs full-res (0.5–0.6 MB cada) estoura o limite de
 * 32 MB por request. Um screenshot 1280×720 cai de ~0.6 MB (PNG) pra ~80–150 KB
 * (JPEG 960px q70): ~5–8× menor, segurando a sessão bem abaixo do teto.
 *
 * Usa `nativeImage` (Electron main, onde as tools rodam) — sem dependência nova.
 * Se algo falhar ou o JPEG não ficar menor, devolve o original intacto.
 */
export function toCompactImage(buf: Buffer, maxWidth = 960, quality = 70): CompactImage {
  try {
    let img = nativeImage.createFromBuffer(buf)
    if (!img.isEmpty()) {
      const { width } = img.getSize()
      if (width > maxWidth) img = img.resize({ width: maxWidth })
      const jpeg = img.toJPEG(quality)
      if (jpeg.length > 0 && jpeg.length < buf.length) {
        return { data: jpeg, ext: 'jpg', mimeType: 'image/jpeg' }
      }
    }
  } catch {
    // Cai pro original abaixo.
  }
  return { data: buf, ext: 'png', mimeType: 'image/png' }
}
