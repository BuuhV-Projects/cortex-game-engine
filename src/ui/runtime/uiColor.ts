/**
 * Cor da UI de runtime (ADR-0102) com **canal alpha** — aceita `#rgb`,
 * `#rrggbb`, `#rrggbbaa`, `rgb(...)` e `rgba(...)`. O backend DOM repassa a
 * string pro CSS (o browser resolve); o backend renderer (console) usa este
 * parser pra separar a cor (THREE.Color não tem alpha) do alpha, que entra no
 * shader como uniform próprio.
 */

export interface ParsedUiColor {
  /** Cor sem alpha, em `#rrggbb` (o que `THREE.Color.set` entende). */
  rgb: string;
  /** Alpha [0..1] embutido na cor (1 = opaco). */
  alpha: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const hex2 = (v: number): string => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');

/** `background` CSS decomposto (cor sólida = `to` null). */
export interface ParsedUiBackground {
  from: string;
  to: string | null;
  /** Eixo do gradiente: 0 = vertical (180deg), 1 = horizontal (90deg). */
  axis: 0 | 1;
}

const GRADIENT_RE =
  /^linear-gradient\(\s*(180deg|90deg|to bottom|to right)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/i;

/**
 * Decompõe um `background` CSS do subset: cor sólida OU
 * `linear-gradient(180deg|90deg, c1, c2)` (`to bottom`/`to right` também
 * valem). `legacyTo` cobre o campo `backgroundTo` antigo dos widgets.
 */
export function parseUiBackground(background: string, legacyTo?: string | null): ParsedUiBackground {
  const gradient = background.trim().match(GRADIENT_RE);
  if (gradient) {
    const dir = gradient[1]!.toLowerCase();
    return {
      from: gradient[2]!,
      to: gradient[3]!,
      axis: dir === '90deg' || dir === 'to right' ? 1 : 0,
    };
  }
  return { from: background, to: legacyTo ?? null, axis: 0 };
}

/** `box-shadow` CSS decomposto (subset sombra dura). */
export interface ParsedUiBoxShadow {
  offsetY: number;
  color: string;
}

const BOX_SHADOW_RE = /^0(?:px)?\s+(-?\d+(?:\.\d+)?)px\s+0(?:px)?\s+(.+)$/;

/**
 * Decompõe um `box-shadow` do subset da UI: `"0 Npx 0 <cor>"` (sombra DURA,
 * sem blur/spread) ou `"none"`. Fora do subset → `null` (sem sombra) — a
 * validação estrita acontece na compilação do CSS ({@link parseUiCss}).
 */
export function parseUiBoxShadow(value: string): ParsedUiBoxShadow | null {
  const v = value.trim();
  if (!v || v === 'none') return null;
  const match = v.match(BOX_SHADOW_RE);
  if (!match) return null;
  const offsetY = Number(match[1]);
  return offsetY > 0 ? { offsetY, color: match[2]!.trim() } : null;
}

/**
 * Separa cor e alpha de uma cor CSS do subset da UI. Formatos fora do subset
 * (nomes tipo `red`, `hsl(...)`) passam direto com alpha 1 — o backend DOM
 * ainda os entende; no console o `THREE.Color.set` resolve os nomeados.
 */
export function parseUiColor(value: string): ParsedUiColor {
  const v = value.trim();

  // #rgb | #rgba | #rrggbb | #rrggbbaa
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = hex[0]!, g = hex[1]!, b = hex[2]!;
      const alpha = hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) / 255 : 1;
      return { rgb: `#${r}${r}${g}${g}${b}${b}`, alpha: clamp01(alpha) };
    }
    if (hex.length === 6) return { rgb: v.toLowerCase(), alpha: 1 };
    if (hex.length === 8) {
      return {
        rgb: `#${hex.slice(0, 6).toLowerCase()}`,
        alpha: clamp01(parseInt(hex.slice(6, 8), 16) / 255),
      };
    }
    return { rgb: v, alpha: 1 }; // malformada — deixa o THREE/CSS reclamar
  }

  // rgb(r, g, b) | rgba(r, g, b, a)
  const fn = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (fn) {
    const [, r, g, b, a] = fn;
    return {
      rgb: `#${hex2(Number(r))}${hex2(Number(g))}${hex2(Number(b))}`,
      alpha: a === undefined ? 1 : clamp01(Number(a)),
    };
  }

  return { rgb: v, alpha: 1 };
}
