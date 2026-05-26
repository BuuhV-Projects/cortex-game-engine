/**
 * Renderizador markdown minimalista para mensagens do chat IA.
 *
 * Cobre os casos comuns: **bold**, *italic*, `code`, ```code blocks```,
 * # headings, - listas, quebras de linha. NÃO suporta tudo de CommonMark
 * (links, imagens, tables, blockquotes etc.) — adicionar quando virar
 * atrito. Saída sempre tem HTML válido (entrada é escapada primeiro,
 * então não há risco de injection mesmo com conteúdo arbitrário do LLM).
 */
export function renderMarkdown(text: string): string {
  // 1) Escape HTML — qualquer < > & vira entidade antes de qualquer parse
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 2) Code blocks ```lang\n...\n``` (antes de tudo pra não conflitar com inline code)
  const codeBlocks: string[] = []
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, lang: string | undefined, code: string) => {
    const idx = codeBlocks.length
    const langClass = lang ? ` class="md-code-lang-${lang}"` : ''
    codeBlocks.push(`<pre class="md-pre"><code${langClass}>${code.replace(/\n$/, '')}</code></pre>`)
    return `\x00CODEBLOCK${idx}\x00`
  })

  // 3) Inline code `...`
  const inlineCodes: string[] = []
  html = html.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = inlineCodes.length
    inlineCodes.push(`<code class="md-code">${code}</code>`)
    return `\x00INLINE${idx}\x00`
  })

  // 4) Headings (#, ##, ### no início da linha)
  html = html.replace(/^(#{1,3}) (.+)$/gm, (_m, hashes: string, content: string) => {
    const level = Math.min(hashes.length + 2, 4) // # → h3, ## → h4, ### → h4
    return `<h${level} class="md-h">${content}</h${level}>`
  })

  // 5) Bold **text**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')

  // 6) Italic *text* (não pega ** que já virou <strong>)
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')

  // 7) Listas com "- ", "* ", "+ " no início da linha — agrupa consecutivas
  html = html.replace(/((?:^[-*+] .+(?:\n|$))+)/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => `<li>${line.replace(/^[-*+] /, '')}</li>`)
      .join('')
    return `<ul class="md-list">${items}</ul>`
  })

  // 8) Quebras de linha — duas ou mais viram <br><br>, uma vira <br>.
  // Evita inserir <br> antes/depois de tags em bloco recém-criadas.
  html = html
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
    // Limpa <br> imediatamente antes/depois de tags em bloco
    .replace(/<br>(<\/?(ul|li|h[1-6]|pre)>)/g, '$1')
    .replace(/(<\/?(ul|li|h[1-6]|pre)>)<br>/g, '$1')

  // 9) Restaura code blocks e inline code (não passam por mais nenhum replace)
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, idx: string) => codeBlocks[parseInt(idx)])
  html = html.replace(/\x00INLINE(\d+)\x00/g, (_m, idx: string) => inlineCodes[parseInt(idx)])

  return html
}
