import { BrowserWindow } from 'electron'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'

/**
 * Rasteriza o HTML do blueprint (fragmento self-contained com thumbnails já
 * embutidas) num PNG, numa BrowserWindow oculta do Electron — mesmo padrão do
 * `playtest_game` (janela fora da tela, `show:true` pra o Chromium pintar de
 * fato; `capturePage` em janela never-shown pode vir em branco). Captura em
 * `scale`× via `zoomFactor` pra nitidez, no tamanho carimbado pelo render.
 */
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function rasterizeBlueprint(
  html: string,
  width: number,
  height: number,
  tmpDir: string,
  scale = 2,
): Promise<Buffer> {
  // Documento completo: o render devolve um fragmento (<div class="bp-root">).
  const doc =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;background:#0e0b1e}</style></head>` +
    `<body>${html}</body></html>`

  await mkdir(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `_bp_${process.pid}.html`)
  await writeFile(tmpFile, doc, 'utf-8')

  let win: BrowserWindow | null = null
  try {
    win = new BrowserWindow({
      x: -4000,
      y: -4000,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      show: true,
      skipTaskbar: true,
      useContentSize: true,
      webPreferences: { backgroundThrottling: false, offscreen: false },
    })
    const wc = win.webContents
    await wc.loadFile(tmpFile)
    // Zoom escala o conteúdo (largura fixa = `width`) pra preencher a janela `width*scale`.
    wc.setZoomFactor(scale)
    // Deixa o layout/thumbnails (data-URI) assentarem antes da foto.
    await delay(450)
    const image = await wc.capturePage({
      x: 0,
      y: 0,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    })
    return image.toPNG()
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    await rm(tmpFile, { force: true }).catch(() => {})
  }
}
