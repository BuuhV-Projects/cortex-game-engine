// Helpers de UI compartilhados do redesign (ADR do redesign / Layout A):
// `h` (hyperscript mínimo) + `icon` (set de ícones SVG de linha). Usados pela
// casca nova (MenuBar/Toolbar) e pelos painéis reskinados.

const NS = 'http://www.w3.org/2000/svg'

type Child = Node | string | number | null | undefined | false
export interface Props {
  class?: string
  style?: Partial<CSSStyleDeclaration> | string
  html?: string
  title?: string
  type?: string
  placeholder?: string
  value?: string
  [key: `data-${string}`]: string | undefined
  [key: `on${string}`]: ((ev: Event) => void) | undefined
}

/** Hyperscript mínimo: cria um elemento com props/estilos/eventos e filhos. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v as string
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'style') el.setAttribute('style', v as string)
      else if (k === 'html') el.innerHTML = v as string
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      else el.setAttribute(k, v === true ? '' : String(v))
    }
  }
  for (const c of kids) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

/** Anexa filhos a um elemento (aceita arrays/nulos). */
export function append(el: HTMLElement, ...kids: (Child | Child[])[]): HTMLElement {
  for (const c of kids.flat()) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

const ICONS: Record<string, string> = {
  folder: 'M2 5.5C2 4.7 2.7 4 3.5 4H6l1.4 1.6H12.5C13.3 5.6 14 6.3 14 7v5.5c0 .8-.7 1.5-1.5 1.5h-9C2.7 14 2 13.3 2 12.5z',
  file: 'M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M9 2v3h3',
  search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5',
  plus: 'M8 3v10M3 8h10',
  refresh: 'M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3',
  play: 'M5 3.5v9l8-4.5z',
  stop: 'M4.5 4.5h7v7h-7z',
  pause: 'M5.5 4v8M10.5 4v8',
  expand: 'M9 2h5v5M14 2l-5 5M7 14H2V9M2 14l5-5',
  layout: 'M2 3.5h12v9H2zM6.5 3.5v9M2 8h4.5',
  gear: 'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z|M13 8a5 5 0 0 0-.1-1l1.3-1-1.3-2.2-1.6.5a5 5 0 0 0-1.7-1L9.2 1H6.8l-.3 1.3a5 5 0 0 0-1.7 1l-1.6-.5L1.9 5l1.3 1a5 5 0 0 0 0 2l-1.3 1 1.3 2.2 1.6-.5a5 5 0 0 0 1.7 1L6.8 15h2.4l.3-1.3a5 5 0 0 0 1.7-1l1.6.5L14.1 11l-1.3-1a5 5 0 0 0 .2-1z',
  camera: 'M2 5.5C2 4.7 2.7 4 3.5 4h1L5.5 2.5h5L11.5 4h1c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5h-9C2.7 13 2 12.3 2 11.5z|M8 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  sun: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13',
  cube: 'M8 1.6l5.5 3.1v6.6L8 14.4l-5.5-3.1V4.7zM2.6 4.8L8 7.9l5.4-3.1M8 7.9V14',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z|M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  chevR: 'M6 4l4 4-4 4',
  chevD: 'M4 6l4 4 4-4',
  lock: 'M4.5 7V5.2a3.5 3.5 0 0 1 7 0V7M3.5 7h9v6.5h-9z',
  trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  dots: 'M3 8h.01M8 8h.01M13 8h.01',
  sparkle: 'M8 2l1.4 3.6L13 7l-3.6 1.4L8 12 6.6 8.4 3 7l3.6-1.4z',
  terminal: 'M3 4l3 3-3 3M7.5 11h5.5',
  move: 'M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2',
  rotate: 'M13 8a5 5 0 1 1-1.7-3.8M13 2.5v2.2h-2.2',
  scale: 'M3 13l6-6M3 9.5V13h3.5M13 3l-4 4M13 6.5V3H9.5',
  link: 'M6.5 9.5l3-3M5.5 8L4 9.5a2.1 2.1 0 0 0 3 3L8.5 11M10.5 8L12 6.5a2.1 2.1 0 0 0-3-3L7.5 5',
  keyboard: 'M2 4.5h12v7H2zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M4 9.3h.01M11.5 9.3h.01M6 9.3h4',
  panelL: 'M2 3.5h12v9H2zM6 3.5v9',
  close: 'M4 4l8 8M12 4l-8 8',
  min: 'M3 8h10',
  max: 'M3.5 3.5h9v9h-9z',
  grid: 'M2 6h12M2 10h12M6 2v12M10 2v12',
  focus: 'M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3|M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
}

export interface IconOpts {
  size?: number
  stroke?: number
  fill?: boolean
  color?: string
}

/** Cria um ícone SVG do set por nome. */
export function icon(name: string, opts: IconOpts = {}): HTMLSpanElement {
  const { size = 15, stroke = 1.6, fill = false, color } = opts
  const span = h('span', { class: 'ico', style: color ? { color } : undefined })
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', fill ? 'none' : 'currentColor')
  svg.setAttribute('stroke-width', String(stroke))
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const d of (ICONS[name] ?? '').split('|')) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d)
    p.setAttribute('fill', fill ? 'currentColor' : 'none')
    svg.append(p)
  }
  span.append(svg)
  return span
}
