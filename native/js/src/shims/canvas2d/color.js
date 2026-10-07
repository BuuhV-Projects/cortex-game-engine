// Cor CSS → [r, g, b, a] (r,g,b 0..255 inteiros; a 0..1) pro canvas 2D
// (SPEC-0313). Aceita o que o fillStyle do browser aceita: #rgb[a],
// #rrggbb[aa], rgb[a]() com vírgula ou espaço (e %), hsl[a](), nomes CSS e
// `transparent`. Cor inválida → null (o contexto mantém a anterior).

// Os 148 nomes do CSS Color 4 (hex sem #).
const NAMED_SOURCE =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,' +
  'beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,' +
  'blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,' +
  'chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,' +
  'cyan:00ffff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,' +
  'darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,' +
  'darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,' +
  'darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,' +
  'darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,' +
  'deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,' +
  'floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,' +
  'ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,' +
  'greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,' +
  'indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,' +
  'lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,' +
  'lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,' +
  'lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,' +
  'lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
  'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,' +
  'magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,' +
  'mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,' +
  'mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,' +
  'mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,' +
  'moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,' +
  'olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,' +
  'palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,' +
  'peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,' +
  'purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,' +
  'saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,' +
  'seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,' +
  'slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,' +
  'steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,' +
  'turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,' +
  'yellow:ffff00,yellowgreen:9acd32';

const NAMED = new Map();
for (const pair of NAMED_SOURCE.split(',')) {
  const [name, hex] = pair.split(':');
  NAMED.set(name, hex);
}

const MAX_BYTE = 255;
const PERCENT = 100;
const HUE_TURN = 360;
const HUE_SECTOR = 60;
/** Teto do cache de strings já interpretadas (cores vêm de poucas constantes). */
const CACHE_LIMIT = 1024;

const cache = new Map();

function clampByte(v) {
  return v < 0 ? 0 : v > MAX_BYTE ? MAX_BYTE : Math.round(v);
}

function clampUnit(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function parseHex(hex) {
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  const short = hex.length === 3 || hex.length === 4;
  if (!short && hex.length !== 6 && hex.length !== 8) return null;
  const step = short ? 1 : 2;
  const channel = (i) => {
    const part = hex.substr(i * step, step);
    return parseInt(short ? part + part : part, 16);
  };
  const hasAlpha = hex.length === 4 || hex.length === 8;
  return [channel(0), channel(1), channel(2), hasAlpha ? channel(3) / MAX_BYTE : 1];
}

/** Número CSS ("12", "50%", ".5") → valor; `percentOf` diz quanto vale 100%. */
function parseNumber(token, percentOf) {
  if (token === undefined || token === '') return NaN;
  if (token.endsWith('%')) return (parseFloat(token) / PERCENT) * percentOf;
  return parseFloat(token);
}

/** Separa "a, b, c / d" ou "a b c / d" em [a, b, c, d?]. */
function splitArgs(body) {
  return body.replace(/\//g, ' ').replace(/,/g, ' ').trim().split(/\s+/);
}

function parseRgb(body) {
  const args = splitArgs(body);
  if (args.length < 3 || args.length > 4) return null;
  const rgb = [0, 1, 2].map((i) => parseNumber(args[i], MAX_BYTE));
  const a = args.length === 4 ? parseNumber(args[3], 1) : 1;
  if (rgb.some(isNaN) || isNaN(a)) return null;
  return [clampByte(rgb[0]), clampByte(rgb[1]), clampByte(rgb[2]), clampUnit(a)];
}

function hueToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % HUE_TURN) + HUE_TURN) % HUE_TURN) / HUE_SECTOR;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const sectors = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = sectors[Math.floor(hp) % sectors.length];
  const m = l - c / 2;
  return [(r + m) * MAX_BYTE, (g + m) * MAX_BYTE, (b + m) * MAX_BYTE];
}

function parseHsl(body) {
  const args = splitArgs(body);
  if (args.length < 3 || args.length > 4) return null;
  const h = parseFloat(args[0]);
  const s = parseNumber(args[1], 1);
  const l = parseNumber(args[2], 1);
  const a = args.length === 4 ? parseNumber(args[3], 1) : 1;
  if ([h, s, l, a].some(isNaN)) return null;
  const [r, g, b] = hueToRgb(h, clampUnit(s), clampUnit(l));
  return [clampByte(r), clampByte(g), clampByte(b), clampUnit(a)];
}

function parseUncached(text) {
  const s = text.trim().toLowerCase();
  if (s.startsWith('#')) return parseHex(s.slice(1));
  if (s === 'transparent') return [0, 0, 0, 0];
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (fn) return fn[1].startsWith('rgb') ? parseRgb(fn[2]) : parseHsl(fn[2]);
  const named = NAMED.get(s);
  return named ? parseHex(named) : null;
}

/** Cor CSS → [r, g, b, a] ou null. O array devolvido é compartilhado: não mutar. */
export function parseColor(text) {
  if (typeof text !== 'string') return null;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const parsed = parseUncached(text);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, parsed);
  return parsed;
}

function hex2(v) {
  return (v < 16 ? '0' : '') + v.toString(16);
}

/** Forma serializada que o browser devolve ao LER fillStyle/strokeStyle. */
export function serializeColor(rgba) {
  const [r, g, b, a] = rgba;
  if (a >= 1) return '#' + hex2(r) + hex2(g) + hex2(b);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
}
