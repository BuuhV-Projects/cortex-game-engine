// Contact sheet rotulado das thumbnails de um kit — HTML + Chrome headless.
// Uso: node make-sheet.mjs <kit-dir> <saida-base> [porPagina]
import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// `--only a,b,c` limita a folha a esses assets (revisar um punhado sem refazer tudo).
const [kitDir, outBase, perPage = '50'] = process.argv.slice(2)
const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null
const thumbs = readdirSync(resolve(kitDir, 'thumbnails'))
  .filter((f) => f.endsWith('.png'))
  .filter((f) => !only || only.has(f.replace('.png', '')))
  .sort()
const pages = []
for (let i = 0; i < thumbs.length; i += Number(perPage)) pages.push(thumbs.slice(i, i + Number(perPage)))

pages.forEach((page, p) => {
  const cells = page.map((f) => {
    const src = resolve(kitDir, 'thumbnails', f).split('\\').join('/')
    return `<figure><img src="file:///${src}"><figcaption>${f.replace('.png', '')}</figcaption></figure>`
  }).join('\n')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { background:#101820; color:#e8f1f8; font:13px system-ui; margin:0; padding:12px; }
    .grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:8px; }
    figure { margin:0; background:#1b2735; border-radius:8px; padding:6px; text-align:center; }
    img { width:100%; aspect-ratio:1; object-fit:contain; background:#0b1119; border-radius:6px; }
    figcaption { font-size:11px; margin-top:4px; word-break:break-all; }
  </style><div class="grid">${cells}</div>`
  writeFileSync(`${outBase}-${p + 1}.html`, html)
})
console.log(`paginas: ${pages.length}`)
