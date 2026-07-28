/**
 * **Binding de input** — o átomo do remapeamento (ADR-0164): uma origem física
 * (tecla, botão do mouse, botão do gamepad ou sentido de um eixo) que ativa uma
 * ação. Este módulo é puro: parse, serialização e rótulo legível — sem estado,
 * sem DOM, sem gamepad.
 *
 * Formato de texto (o que vai pro `config.ini`):
 *
 * | Token | Origem | Exemplo |
 * | --- | --- | --- |
 * | `key:<nome>` | teclado (`KeyboardEvent.key`) | `key:w`, `key:Shift` |
 * | `pad:<n>` | botão do gamepad (layout standard) | `pad:0` (A) |
 * | `axis:<n>+` / `axis:<n>-` | eixo do gamepad com sentido | `axis:1-` |
 * | `mouse:<n>` | botão do mouse (0=esq, 1=meio, 2=dir) | `mouse:2` |
 *
 * @example
 * parseBinding('axis:1-')      // { source: 'axis', index: 1, sign: -1 }
 * formatBinding({ source: 'pad', index: 0 })  // 'pad:0'
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

/** Origem física de um binding. */
export type BindingSource = 'key' | 'pad' | 'axis' | 'mouse';

/** Uma origem física que ativa uma ação. */
export interface InputBinding {
  readonly source: BindingSource;
  /** Botão/eixo (`pad`, `axis`, `mouse`) — ignorado quando `source` é `key`. */
  readonly index?: number;
  /** Tecla (`KeyboardEvent.key` normalizado) — só quando `source` é `key`. */
  readonly key?: string;
  /** Sentido do eixo: `+1` ou `-1` — só quando `source` é `axis`. */
  readonly sign?: 1 | -1;
}

// ─── Tokens de tecla ───────────────────────────────────────────────────────────

/**
 * Teclas cujo caractere colidiria com o formato (separador/`:`) têm nome
 * próprio na serialização. O resto vai cru.
 */
const KEY_TOKENS: ReadonlyArray<readonly [key: string, token: string]> = [
  [' ', 'Space'],
  [',', 'Comma'],
  [':', 'Colon'],
];

/** Separador entre bindings de uma mesma ação no `config.ini`. */
export const BINDING_SEPARATOR = ',';

/** Índice máximo aceito pra botão/eixo (defesa contra arquivo editado à mão). */
const MAX_INDEX = 63;

/**
 * Normaliza uma tecla pro mesmo formato do {@link InputManager}: letras (1
 * caractere) viram minúsculas; teclas nomeadas (`Shift`, `ArrowLeft`) passam
 * intactas. Sem isso, `W` (com Shift) não casaria com o binding `w`.
 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

// ─── Parse / serialize ─────────────────────────────────────────────────────────

/** Converte texto (`'pad:0'`) em binding, ou `null` se malformado. */
export function parseBinding(text: string): InputBinding | null {
  const raw = text.trim();
  const colon = raw.indexOf(':');
  if (colon <= 0) return null;
  const source = raw.slice(0, colon);
  const rest = raw.slice(colon + 1);
  if (rest.length === 0) return null;

  if (source === 'key') {
    const named = KEY_TOKENS.find(([, token]) => token === rest);
    return { source: 'key', key: named ? named[0] : normalizeKey(rest) };
  }
  if (source === 'pad' || source === 'mouse') {
    const index = Number(rest);
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) return null;
    return { source, index };
  }
  if (source === 'axis') {
    const last = rest[rest.length - 1];
    if (last !== '+' && last !== '-') return null;
    const index = Number(rest.slice(0, -1));
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) return null;
    return { source: 'axis', index, sign: last === '+' ? 1 : -1 };
  }
  return null;
}

/** Converte um binding no texto do `config.ini`. */
export function formatBinding(binding: InputBinding): string {
  if (binding.source === 'key') {
    const key = binding.key ?? '';
    const named = KEY_TOKENS.find(([k]) => k === key);
    return `key:${named ? named[1] : key}`;
  }
  if (binding.source === 'axis') {
    return `axis:${binding.index ?? 0}${binding.sign === -1 ? '-' : '+'}`;
  }
  return `${binding.source}:${binding.index ?? 0}`;
}

/** Lista de bindings a partir da linha do `config.ini`; entradas inválidas são descartadas. */
export function parseBindingList(text: string): InputBinding[] {
  return text
    .split(BINDING_SEPARATOR)
    .map((part) => parseBinding(part))
    .filter((b): b is InputBinding => b !== null);
}

/** Serializa a lista pro `config.ini` (vazia = string vazia). */
export function formatBindingList(bindings: readonly InputBinding[]): string {
  return bindings.map(formatBinding).join(BINDING_SEPARATOR);
}

/** Dois bindings apontam pra mesma origem física? */
export function sameBinding(a: InputBinding, b: InputBinding): boolean {
  if (a.source !== b.source) return false;
  if (a.source === 'key') return normalizeKey(a.key ?? '') === normalizeKey(b.key ?? '');
  if (a.source === 'axis') return a.index === b.index && a.sign === b.sign;
  return a.index === b.index;
}

/** `true` se o binding vem do teclado/mouse (coluna "teclado" da tela de Controles). */
export function isKeyboardBinding(binding: InputBinding): boolean {
  return binding.source === 'key' || binding.source === 'mouse';
}

/** `true` se o binding vem do gamepad (coluna "controle" da tela de Controles). */
export function isGamepadBinding(binding: InputBinding): boolean {
  return binding.source === 'pad' || binding.source === 'axis';
}

// ─── Rótulo legível ────────────────────────────────────────────────────────────

/** Nomes amigáveis de teclas nomeadas (o resto é a própria tecla em maiúscula). */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Espaço',
  ArrowUp: 'Seta cima',
  ArrowDown: 'Seta baixo',
  ArrowLeft: 'Seta esq.',
  ArrowRight: 'Seta dir.',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Shift: 'Shift',
  Control: 'Ctrl',
  Alt: 'Alt',
  Tab: 'Tab',
};

/**
 * Rótulo dos botões no layout **standard** do W3C — o mesmo que o host nativo
 * emite (`native/src/shims/input.cpp`). Índices sem nome viram `Botão N`.
 */
const PAD_LABELS: readonly string[] = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3',
  'D-pad cima', 'D-pad baixo', 'D-pad esq.', 'D-pad dir.',
  'Guide',
];

/** Rótulo dos eixos: 0/1 = stick esquerdo, 2/3 = stick direito. */
const AXIS_LABELS: readonly (readonly [neg: string, pos: string])[] = [
  ['Stick esq. esq.', 'Stick esq. dir.'],
  ['Stick esq. cima', 'Stick esq. baixo'],
  ['Stick dir. esq.', 'Stick dir. dir.'],
  ['Stick dir. cima', 'Stick dir. baixo'],
];

const MOUSE_LABELS: readonly string[] = ['Mouse esq.', 'Mouse meio', 'Mouse dir.'];

/**
 * Rótulo legível pra mostrar na tela de Controles. Usa só glifos que a Roboto
 * rasteriza no console (SPEC-0165) — nada de emoji ou ícone de tecla.
 *
 * @example
 * bindingLabel({ source: 'axis', index: 1, sign: -1 }) // 'Stick esq. cima'
 */
export function bindingLabel(binding: InputBinding): string {
  if (binding.source === 'key') {
    const key = binding.key ?? '';
    return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  }
  if (binding.source === 'mouse') {
    return MOUSE_LABELS[binding.index ?? 0] ?? `Mouse ${binding.index ?? 0}`;
  }
  if (binding.source === 'pad') {
    return PAD_LABELS[binding.index ?? 0] ?? `Botão ${binding.index ?? 0}`;
  }
  const pair = AXIS_LABELS[binding.index ?? 0];
  if (pair) return binding.sign === -1 ? pair[0] : pair[1];
  return `Eixo ${binding.index ?? 0}${binding.sign === -1 ? '-' : '+'}`;
}
