// Geometria do preview nativo (SPEC-0207): onde a janela do host deve ficar
// dentro do palco da IDE.
//
// A janela nativa cobre todo o DOM (airspace), então ela NÃO ocupa o palco
// inteiro: sobram faixas em cima e embaixo para as pills do viewport (fase,
// ferramentas, atalhos, perf), que são DOM. Este cálculo é a única fonte da
// verdade dessa reserva — o CSS `.native-preview` só pinta o fundo das faixas.

/** Retângulo em px, no referencial da janela da IDE. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Faixas reservadas para as pills, em px. */
export interface PreviewBars {
  top: number
  bottom: number
}

/**
 * Retângulo do host dentro do palco, já descontadas as faixas das pills.
 * `null` quando não sobra área útil — painel colapsado ou baixo demais; o
 * chamador não deve mandar geometria nesse caso (uma janela 0×0 não é
 * configurável no wgpu).
 */
export function nativePreviewBounds(stage: Rect, bars: PreviewBars): Rect | null {
  if (stage.width <= 0 || stage.height <= 0) return null
  const height = Math.round(stage.height) - bars.top - bars.bottom
  if (height <= 0) return null
  return {
    x: Math.round(stage.x),
    y: Math.round(stage.y) + bars.top,
    width: Math.round(stage.width),
    height,
  }
}
