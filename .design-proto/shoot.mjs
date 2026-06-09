// Servidor estático + screenshot via Playwright (Chrome do sistema).
// Uso: node shoot.mjs <dir> <outPng> [url]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const dir = resolve(process.argv[2] || '.')
const out = resolve(process.argv[3] || 'shot.png')
const path = process.argv[4] || '/index.html'

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/') p = '/index.html'
    const file = join(dir, p)
    const buf = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

await new Promise((r) => server.listen(0, r))
const port = server.address().port
const url = `http://localhost:${port}${path}`
console.log('serving', dir, '->', url)

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900, deviceScaleFactor: 1.25 } })
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(900) // dá tempo das webfonts assentarem
await page.screenshot({ path: out })
console.log('screenshot ->', out)

await browser.close()
server.close()
