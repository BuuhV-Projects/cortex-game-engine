// Protótipo vanilla do Layout A (Classic Dock) — espelha layout-a.jsx +
// ide-shared.jsx em DOM puro, pra validar no vite/Playwright antes de portar
// pros componentes do studio (Electron).

const NS = 'http://www.w3.org/2000/svg'

function h(tag, props, ...kids) {
  const e = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') e.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v)
      else if (k === 'html') e.innerHTML = v
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v)
      else e.setAttribute(k, v === true ? '' : v)
    }
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue
    e.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return e
}

const ICONS = {
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

function icon(name, { size = 15, stroke = 1.6, fill = false, color } = {}) {
  const span = h('span', { class: 'ico', style: color ? { color } : undefined })
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', size); svg.setAttribute('height', size)
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', fill ? 'none' : 'currentColor')
  svg.setAttribute('stroke-width', stroke)
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  for (const d of (ICONS[name] || '').split('|')) {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', d); p.setAttribute('fill', fill ? 'currentColor' : 'none')
    svg.append(p)
  }
  span.append(svg)
  return span
}

const TYPE_META = {
  cam: { icon: 'camera', color: 'oklch(0.72 0.13 235)' },
  light: { icon: 'sun', color: 'oklch(0.82 0.13 85)' },
  mesh: { icon: 'cube', color: 'oklch(0.74 0.15 150)' },
  group: { icon: 'folder', color: 'oklch(0.70 0.16 285)' },
  helper: { icon: 'focus', color: 'oklch(0.55 0.012 280)' },
}
const HIER = [
  { name: '__editor_collider_gizmos', type: 'group', dim: true },
  { name: 'Camera', type: 'cam' },
  { name: '(CameraHelper)', type: 'helper', indent: 1, dim: true },
  { name: '(HemisphereLight)', type: 'light' },
  { name: '(AmbientLight)', type: 'light' },
  { name: '(DirectionalLight)', type: 'light' },
  { name: 'safety_net', type: 'mesh' },
  { name: 'ground_start', type: 'mesh', sel: true },
  { name: 'ground_start_dirt', type: 'mesh', indent: 1 },
  { name: 'tree_start', type: 'mesh' },
  { name: '(HemisphereLightHelper)', type: 'helper', dim: true },
  { name: '(DirectionalLightHelper)', type: 'helper', dim: true },
  { name: 'bush_start', type: 'mesh' },
  { name: 'grass_a', type: 'mesh' },
  { name: 'grass_b', type: 'mesh' },
  { name: 'grass_c', type: 'mesh' },
  { name: 'arrow_go', type: 'mesh' },
  { name: 'coin_1', type: 'mesh' },
]
const CONSOLE_LINES = [
  { n: '58692', t: 'class SceneStore {' },
  { n: '58693', t: '  path = "scenes/scene-data.json";' },
  { n: '58694', t: '  async save(e) {' },
  { n: '58695', t: '    await (await import(["@tauri-apps","plugin-fs"].join("/"))).writeTextFile(this.path, JSON.stringify(e));' },
  { n: '58696', t: '  }' },
  { n: '58697', t: '}' },
  { n: '', t: '▲ [vite] dynamic import cannot be analyzed — see rollup/plugins/dynamic-import-vars#limitations', k: 'warn' },
  { n: '', t: '  Plugin: vite:import-analysis · vendor/cortex-game-engine/index.dev.js', k: 'warn' },
  { n: '', t: '✓ scene "start" carregada — 18 objetos, 0 erros', k: 'ok' },
]

const spacer = () => h('span', { class: 'spacer' })

function MenuBar() {
  return h('div', { class: 'menubar' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }), 'cortex'),
    ['File', 'Edit', 'View', 'Projeto', 'Window'].map((m) => h('span', { class: 'mi' }, m)),
    spacer(),
    h('span', { class: 'mi muted', style: { fontSize: '11.5px' } }, 'plataform-25d'),
    h('div', { class: 'winbtns' },
      h('span', { class: 'winbtn' }, icon('min', { size: 13 })),
      h('span', { class: 'winbtn' }, icon('max', { size: 11 })),
      h('span', { class: 'winbtn close' }, icon('close', { size: 12 })),
    ),
  )
}

function Transport() {
  return h('div', { class: 'row gap-6' },
    h('button', { class: 'btn stop' }, icon('stop', { size: 13, fill: true }), 'Stop'),
    h('button', { class: 'iconbtn' }, icon('pause', { size: 15 })),
    h('button', { class: 'iconbtn' }, icon('refresh', { size: 15 })),
  )
}

function CameraReadout() {
  return h('span', { class: 'vp-coords', style: { fontSize: '11px' },
    html: 'cam <b>8.0 · 6.0 · 10.0</b> &nbsp;yaw <b>39°</b> &nbsp;pitch <b>−21°</b>' })
}

function ToolBar() {
  return h('div', { class: 'row', style: { height: '46px', flex: '0 0 auto', padding: '0 12px', gap: '12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' } },
    h('button', { class: 'btn accent sm' }, icon('plus', { size: 13 }), 'Novo Projeto'),
    h('button', { class: 'btn ghost sm' }, icon('folder', { size: 13, fill: true }), 'Abrir'),
    h('div', { class: 'divx' }),
    Transport(),
    h('span', { class: 'chip run' }, h('span', { class: 'dot' }), 'RODANDO'),
    spacer(),
    h('span', { class: 'vp-pill', style: { background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--tx)' } },
      icon('camera', { size: 13, color: 'var(--tx-lo)' }), CameraReadout()),
    h('button', { class: 'iconbtn' }, icon('layout', { size: 16 })),
    h('button', { class: 'iconbtn' }, icon('grid', { size: 16 })),
    h('button', { class: 'iconbtn' }, icon('expand', { size: 15 })),
    h('button', { class: 'iconbtn' }, icon('gear', { size: 16 })),
  )
}

function HierarchyList() {
  return h('div', { class: 'tree scroll grow' },
    HIER.map((n) => {
      const m = TYPE_META[n.type]
      return h('div', { class: 'node' + (n.sel ? ' sel' : '') + (n.dim ? ' dim' : '') },
        n.indent ? h('span', { class: 'indent' }) : null,
        icon(n.type === 'group' ? 'chevD' : 'chevR', { size: 11, color: 'var(--tx-dim)' }),
        h('span', { class: 'ico', style: { color: n.sel ? 'var(--accent)' : m.color } }, icon(m.icon, { size: 13 })),
        h('span', { class: 'nm' }, n.name),
        h('span', { class: 'eye' }, icon('eye', { size: 12 })),
      )
    }),
  )
}

function LeftDock() {
  return h('div', { class: 'panel', style: { width: '250px', flex: '0 0 auto', borderTop: 'none', borderBottom: 'none', borderLeft: 'none' } },
    h('div', { class: 'panel-h', style: { padding: '0', height: '36px' } },
      h('div', { class: 'tabs grow' },
        h('button', { class: 'tab on' }, icon('cube', { size: 13 }), 'Hierarquia'),
        h('button', { class: 'tab' }, icon('folder', { size: 13, fill: true }), 'Projeto'),
      ),
      h('button', { class: 'hbtn' }, icon('plus', { size: 14 })),
    ),
    h('div', { class: 'row', style: { padding: '8px 8px 4px' } },
      h('div', { class: 'search grow' }, icon('search', { size: 13 }), h('input', { placeholder: 'Filtrar objetos…' })),
    ),
    HierarchyList(),
  )
}

function Scene() {
  const scene = h('div', { class: 'scene', style: { position: 'relative', width: '100%', height: '100%' } })
  scene.innerHTML = `
    <div class="sky-grid"></div>
    <div class="sun"></div>
    <div class="plat" style="left:20%;top:50%;width:52%;height:24%;transform:rotateX(16deg) rotateZ(-2.5deg);transform-style:preserve-3d">
      <div class="top" style="position:absolute;inset:0 0 58% 0"></div>
      <div class="side" style="position:absolute;inset:42% 0 28% 0"></div>
      <div class="dirt" style="position:absolute;inset:72% 0 0 0;border-radius:0 0 8px 8px"></div>
    </div>
    <div class="tree3d" style="left:25%;top:30%;width:7%"><div class="crown" style="width:100%;aspect-ratio:0.9"></div><div class="trunk" style="width:22%;height:28px"></div></div>
    <div class="tree3d" style="left:60%;top:40%;width:5.6%"><div class="crown" style="width:100%;aspect-ratio:0.9"></div><div class="trunk" style="width:22%;height:22px"></div></div>
    <div class="tree3d" style="left:68%;top:34%;width:4.3%"><div class="crown" style="width:100%;aspect-ratio:0.9"></div><div class="trunk" style="width:22%;height:17px"></div></div>
    <div style="position:absolute;left:57%;top:44%;width:7%;height:3.4%;background:linear-gradient(180deg, oklch(0.6 0.2 25), oklch(0.5 0.18 25));border-radius:3px;clip-path:polygon(0 0, 72% 0, 100% 50%, 72% 100%, 0 100%);box-shadow:0 3px 8px rgba(0,0,0,.3)"></div>
    <div style="position:absolute;left:60%;top:47.4%;width:4px;height:9%;background:oklch(0.5 0.07 60);border-radius:2px"></div>
    <div class="coin" style="left:76%;top:36%;width:5.5%;aspect-ratio:1;font-weight:800;font-size:15px">★</div>
    <div class="coin" style="left:83%;top:40%;width:4.5%;aspect-ratio:1;font-weight:800;font-size:12px;opacity:.92">★</div>
    <div class="selbox" style="left:19%;top:47%;width:54%;height:30%">
      <span class="h tl"></span><span class="h tr"></span><span class="h bl"></span><span class="h br"></span>
    </div>
    <div class="gizmo" style="left:32%;top:58%">
      <div class="arm ax-x"><span class="head"></span></div>
      <div class="arm ax-y"><span class="head"></span></div>
      <div class="arm ax-z"><span class="head"></span></div>
      <div style="position:absolute;width:9px;height:9px;border-radius:50%;background:#fff;left:-4px;top:-3px;box-shadow:0 0 0 2px var(--accent)"></div>
    </div>`
  return scene
}

function ConsolePanel() {
  return h('div', { class: 'console-b mono scroll grow' },
    CONSOLE_LINES.map((l) => h('div', { class: 'ln' + (l.k === 'warn' ? ' warn' : '') },
      h('span', { class: 'n' }, l.n),
      h('span', { class: 't', style: l.k === 'ok' ? { color: 'var(--play)' } : undefined }, l.t),
    )),
  )
}

function CenterDock() {
  const vp = h('div', { class: 'grow', style: { position: 'relative', minHeight: '0', borderBottom: '1px solid var(--line)' } },
    Scene(),
    h('div', { style: { position: 'absolute', top: '10px', left: '10px' } },
      h('span', { class: 'vp-pill' }, h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('cube', { size: 13 })), 'ground_start')),
    h('div', { class: 'row gap-4', style: { position: 'absolute', top: '10px', right: '10px' } },
      ['move', 'rotate', 'scale'].map((mname, i) =>
        h('span', { class: 'vp-pill', style: { width: '30px', padding: '0', justifyContent: 'center', background: i === 0 ? 'var(--accent)' : undefined, borderColor: i === 0 ? 'transparent' : undefined } }, icon(mname, { size: 15 }))),
    ),
    h('div', { style: { position: 'absolute', bottom: '10px', left: '10px' } },
      h('span', { class: 'vp-pill', style: { cursor: 'pointer' } }, icon('keyboard', { size: 14 }), 'Atalhos')),
    h('div', { style: { position: 'absolute', bottom: '10px', right: '10px' } },
      h('span', { class: 'vp-pill mono', style: { fontSize: '10.5px' } }, '60 fps · 18 obj · 2 lights')),
  )
  const consoleDock = h('div', { class: 'console', style: { height: '178px', flex: '0 0 auto', display: 'flex', flexDirection: 'column' } },
    h('div', { class: 'panel-h', style: { padding: '0', background: 'var(--bg-1)' } },
      h('div', { class: 'tabs' },
        h('button', { class: 'tab on' }, icon('terminal', { size: 13 }), 'Console'),
        h('button', { class: 'tab' }, 'Terminal'),
      ),
      spacer(),
      h('span', { class: 'chip', style: { marginRight: '6px' } }, h('span', { class: 'dot', style: { background: 'var(--warn)' } }), '2'),
      h('button', { class: 'hbtn' }, icon('trash', { size: 13 })),
    ),
    ConsolePanel(),
  )
  return h('div', { class: 'col grow', style: { minWidth: '0' } }, vp, consoleDock)
}

function vec(k, vals) {
  const ax = ['x', 'y', 'z']
  return h('div', { class: 'field' },
    h('span', { class: 'k' }, k),
    h('div', { class: 'vec' },
      vals.map((v, i) => h('label', { class: 'num' },
        h('span', { class: 'ax ' + ax[i] }, ax[i].toUpperCase()),
        h('input', { value: v }),
      )),
    ),
  )
}

function Inspector() {
  return h('div', { class: 'insp scroll grow' },
    h('div', { class: 'insp-id' },
      h('span', { class: 'chip' }, icon('cube', { size: 17 })),
      h('div', { class: 'col', style: { gap: '2px' } },
        h('span', { class: 'nm' }, 'ground_start'),
        h('span', { class: 'sub' }, 'mesh · id 0x1a7f'),
      ),
      h('span', { class: 'vis iconbtn' }, icon('eye', { size: 15 })),
    ),
    h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, icon('chevD', { size: 12 }), h('span', { class: 'lbl' }, 'Transform'), spacer(), icon('link', { size: 13, color: 'var(--tx-dim)' })),
      h('div', { class: 'sec-b' },
        vec('Position', ['12.00', '0.00', '4.50']),
        vec('Rotation', ['0', '0', '0']),
        vec('Scale', ['1.00', '1.00', '1.00']),
      ),
    ),
    h('div', { class: 'sec' },
      h('div', { class: 'sec-h' }, icon('chevD', { size: 12 }), h('span', { class: 'lbl' }, 'Components')),
      h('div', { class: 'sec-b' },
        h('div', { class: 'comp' },
          h('div', { class: 'comp-h' }, h('span', { class: 'ico', style: { color: 'var(--accent)' } }, icon('cube', { size: 14 })), h('span', { class: 'nm' }, 'Mesh Renderer'), h('span', { class: 'tog on' })),
          h('div', { class: 'comp-b' },
            h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Mesh'), h('span', { class: 'v' }, 'ground_start.glb')),
            h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Material'), h('span', { class: 'row gap-6' }, h('span', { class: 'swatch', style: { background: 'oklch(0.68 0.18 145)' } }), h('span', { class: 'v' }, 'M_Grass'))),
            h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Cast Shadows'), h('span', { class: 'tog on' })),
          ),
        ),
        h('div', { class: 'comp' },
          h('div', { class: 'comp-h' }, h('span', { class: 'ico', style: { color: 'var(--info)' } }, icon('grid', { size: 14 })), h('span', { class: 'nm' }, 'Box Collider'), h('span', { class: 'tog on' })),
          h('div', { class: 'comp-b' },
            h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Is Trigger'), h('span', { class: 'tog' })),
            h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Size'), h('span', { class: 'v' }, '10 · 2 · 4')),
          ),
        ),
        h('button', { class: 'btn ghost sm', style: { alignSelf: 'stretch', borderStyle: 'dashed', borderColor: 'var(--line-2)' } }, icon('plus', { size: 13 }), 'Adicionar componente'),
      ),
    ),
    h('div', { class: 'sec', style: { borderBottom: 'none' } },
      h('div', { class: 'sec-h' }, icon('chevR', { size: 12 }), h('span', { class: 'lbl' }, 'Tags & Layer')),
    ),
  )
}

function RightDock() {
  return h('div', { class: 'panel', style: { width: '304px', flex: '0 0 auto', borderTop: 'none', borderBottom: 'none' } },
    h('div', { class: 'panel-h' },
      h('span', { class: 'ttl lit' }, 'Inspector'),
      spacer(),
      h('button', { class: 'hbtn' }, icon('lock', { size: 13 })),
      h('button', { class: 'hbtn' }, icon('dots', { size: 15 })),
    ),
    Inspector(),
  )
}

function ChatRail() {
  return h('div', { class: 'col', style: { width: '46px', flex: '0 0 auto', background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', alignItems: 'center', paddingTop: '10px', gap: '12px' } },
    h('button', { class: 'iconbtn on', style: { width: '32px', height: '32px' } }, icon('sparkle', { size: 16, fill: true })),
    h('span', { style: { writingMode: 'vertical-rl', fontSize: '10.5px', fontWeight: '700', letterSpacing: '.12em', color: 'var(--tx-lo)', textTransform: 'uppercase' } }, 'Chat IA'),
    h('span', { class: 'chip', style: { width: '22px', height: '22px', padding: '0', justifyContent: 'center', background: 'var(--accent-q)', color: 'var(--accent)' } }, '2'),
    spacer(),
    h('button', { class: 'iconbtn', style: { marginBottom: '10px' } }, icon('panelL', { size: 16 })),
  )
}

function LayoutA() {
  return h('div', { class: 'ide ide--dock col', style: { height: '100%' } },
    MenuBar(),
    ToolBar(),
    h('div', { class: 'row grow', style: { minHeight: '0', alignItems: 'stretch' } },
      LeftDock(),
      CenterDock(),
      RightDock(),
      ChatRail(),
    ),
  )
}

document.getElementById('root').append(LayoutA())
