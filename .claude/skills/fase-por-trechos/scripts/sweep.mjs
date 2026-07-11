/**
 * **Varredura panorâmica de fase** (QA visual, spec 0005) — fotografa a fase em
 * N QUADROS ao longo do percurso, como uma panorâmica em partes: numa carga só,
 * entra no Play, esconde a UI do editor e, quadro a quadro, TELEPORTA o player
 * (rush:checkpoint + rush:die) pra posição seguinte e captura o PNG.
 *
 * Serve pra caçar defeito de composição que um clique pontual não pega:
 * objeto torto, peça flutuando no vazio, ilha que não devia estar ali, emenda
 * desnivelada. Revisar os quadros EM SEQUÊNCIA (são a fase inteira).
 *
 * Uso:  node tools/sweep.mjs <url> <dirSaida> [x0] [x1] [quadros] [alturaCam] [z]
 * Ex.:  node tools/sweep.mjs "http://localhost:5174/?level=mix-ilhas-2" shots/sweep 0 115 12 22 0
 *
 * `alturaCam` é o Y do teleporte: o player cai e a câmera de perseguição vê o
 * trecho de cima enquanto isso (o teleporte re-dispara a cada quadro).
 * Requisitos: vite dev rodando; Chrome instalado; Node 22+.
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [url, outDir, x0 = '0', x1 = '110', frames = '12', camY = '22', zArg = '0'] = process.argv.slice(2)
if (!url || !outDir) {
  console.error('uso: node tools/sweep.mjs <url> <dirSaida> [x0] [x1] [quadros] [alturaCam] [z]')
  process.exit(2)
}

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334 // porta própria — não briga com um shot.mjs simultâneo

const chrome = spawn(CHROME, [
  '--headless=new',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800',
  '--user-data-dir=' + (process.env.TEMP ?? '/tmp') + '/rush-sweep-profile',
  'about:blank',
], { stdio: 'ignore' })
const bye = (code) => {
  try { chrome.kill() } catch { /* já morreu */ }
  process.exit(code)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let targets = null
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    break
  } catch { await sleep(200) }
}
if (!targets) { console.error('chrome não subiu'); bye(1) }

const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()

const ws = new WebSocket(tab.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const consoleLines = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleLines.push(`[EXCEPTION] ${m.params.exceptionDetails?.text ?? ''}`)
  }
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
await send('Runtime.enable')
await send('Page.enable')

const evalJs = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value

// Boot até o marco 'pronto'.
let stage = ''
const t0 = Date.now()
while (Date.now() - t0 < 90_000) {
  stage = await evalJs('window.__bootStage ?? "(sem marco)"')
  if (stage === 'pronto' || String(stage).startsWith('fase')) break
  await sleep(500)
}
if (!(stage === 'pronto' || String(stage).startsWith('fase'))) {
  console.error(`boot NÃO chegou em 'pronto' (parou em: ${stage})`)
  bye(1)
}

// Play do editor (bundle dev trava a gameplay no gate) + esconde a UI.
await evalJs(`(function(){
  var b = Array.from(document.querySelectorAll('button')).find(function(e){ return /Play/.test(e.textContent||'') })
  if (b) b.click()
  return b ? 'play' : 'sem botao Play (build prod?)'
})()`)
await sleep(600)
await evalJs(`Array.from(document.body.children).forEach(function(e){ if (e.tagName !== 'CANVAS') e.style.display = 'none' })`)

mkdirSync(outDir, { recursive: true })
const N = Number(frames)
const a = Number(x0), b = Number(x1), y = Number(camY), z = Number(zArg)

for (let i = 0; i < N; i++) {
  const x = a + ((b - a) * i) / Math.max(1, N - 1)
  // Teleporta (checkpoint + die) e deixa a câmera de perseguição enquadrar.
  await evalJs(`(function(){
    document.dispatchEvent(new CustomEvent('rush:checkpoint', { detail: { x: ${x}, y: ${y}, z: ${z} } }))
    document.dispatchEvent(new CustomEvent('rush:die'))
    return 'tp'
  })()`)
  await sleep(1100)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = join(outDir, `q${String(i + 1).padStart(2, '0')}-x${Math.round(x)}.png`)
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log(`quadro ${i + 1}/${N}: x=${x.toFixed(0)} → ${file}`)
}

if (consoleLines.length) console.log('⚠️ exceções na página:\n' + consoleLines.slice(0, 6).join('\n'))
console.log(`varredura completa: ${N} quadros em ${outDir} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
bye(0)
