// Matriz afim 2D do canvas (SPEC-0313): array [a, b, c, d, e, f], a mesma
// ordem do setTransform/DOMMatrix — x' = a·x + c·y + e, y' = b·x + d·y + f.
// As operações mutam a matriz recebida (o estado do contexto é dono dela).

export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

/** m ← m × [a b c d e f] (aplica a nova transformação no espaço local). */
export function multiply(m, a, b, c, d, e, f) {
  const [ma, mb, mc, md, me, mf] = m;
  m[0] = ma * a + mc * b;
  m[1] = mb * a + md * b;
  m[2] = ma * c + mc * d;
  m[3] = mb * c + md * d;
  m[4] = ma * e + mc * f + me;
  m[5] = mb * e + md * f + mf;
}

export function translate(m, x, y) {
  multiply(m, 1, 0, 0, 1, x, y);
}

export function scale(m, x, y) {
  multiply(m, x, 0, 0, y, 0, 0);
}

export function rotate(m, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  multiply(m, cos, sin, -sin, cos, 0, 0);
}

/** Inversa (nova matriz) ou null se degenerada. */
export function invert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0 || !isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Escala média (√|det|) — converte larguras de linha/tamanho de fonte pro dispositivo. */
export function meanScale(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** Sem rotação/cisalhamento: retângulos continuam retângulos alinhados. */
export function isAxisAligned(m) {
  return m[1] === 0 && m[2] === 0;
}

export function isFiniteMatrix(m) {
  return m.every(isFinite);
}
