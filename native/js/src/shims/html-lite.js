// Parser mínimo de HTML pro `innerHTML` do dom-lite (SPEC-0313). Só ESTRUTURA:
// tags viram elementos (pela fábrica do document, então <canvas> é canvas 2D),
// atributos viram setAttribute, aninhamento respeitado. Texto solto e
// comentários são ignorados; <style>/<script> viram elemento sem conteúdo.
// Não há layout nem CSS — o host não compõe DOM na tela.

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTRIBUTE = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['style', 'script', 'textarea', 'title']);

function applyAttributes(element, source) {
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(source)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    const name = match[1].toLowerCase();
    // o <img> do host (shims/image.js) não tem setAttribute: atributo vira propriedade (src dispara o fetch)
    if (typeof element.setAttribute === 'function') element.setAttribute(name, value);
    else element[name] = value;
  }
}

/** Pula o conteúdo de <style>/<script> até o fechamento. */
function skipRawText(html, tag, from) {
  const end = html.toLowerCase().indexOf('</' + tag, from);
  return end < 0 ? html.length : end;
}

/** Monta os filhos de `root` a partir de `html`; `create(tag)` = document.createElement. */
export function parseHtmlInto(root, html, create) {
  const stack = [root];
  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(html)) !== null) {
    if (match[2] === undefined) continue; // comentário
    const tag = match[2].toLowerCase();
    const parent = stack[stack.length - 1];
    if (match[1] === '/') {
      if (stack.length > 1 && String(parent.tagName).toLowerCase() === tag) stack.pop();
      continue;
    }
    const element = create(tag);
    applyAttributes(element, match[3]);
    parent.appendChild(element);
    const selfClosing = /\/\s*$/.test(match[3]);
    if (VOID_TAGS.has(tag) || selfClosing) continue;
    stack.push(element);
    // conteúdo de <style>/<script> não é HTML: pula até o </style> (que desempilha)
    if (RAW_TEXT_TAGS.has(tag)) TAG.lastIndex = skipRawText(html, tag, TAG.lastIndex);
  }
}
