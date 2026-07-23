// Render de VALIDAÇÃO de um level: 4 vistas ortográficas (TOPO, FRENTE, LADO) +
// 3/4 ISO, num contact-sheet. É como se AFERE se o level presta: o TOPO revela se
// virou linha reta e o espaçamento XZ; FRENTE/LADO revelam alturas e sobreposição;
// a ISO dá a leitura de maquete. Blender headless (mesmo pipeline do inspect_assets).
//
// Uso: node render_level_views.mjs <level3d.json> <kitAssetsDir> <out.png>
//
// level3d.json: { pieces: [{ asset, pos:[x,y,z], rotY?, scale?, backdrop? }] }
// pos = coords de MUNDO da engine (Y-up). Backdrop (planet/meteor) é omitido.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { join, isAbsolute, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const [levelPath, kitDir, outPath] = process.argv.slice(2)
if (!levelPath || !kitDir || !outPath) {
  console.error('uso: node render_level_views.mjs <level3d.json> <kitAssetsDir> <out.png>')
  process.exit(1)
}
const level = JSON.parse(readFileSync(levelPath, 'utf8'))
const BACKDROP_RE = /^(planet|meteors?|sky|nebula)/i
const glbOf = (asset) => {
  const name = asset.replace(/\.glb$/i, '')
  for (const c of [join(kitDir, `${name}.glb`), join(kitDir, 'assets', `${name}.glb`)]) if (existsSync(c)) return c
  return null
}
const resolved = []
let skipped = 0
for (const p of level.pieces ?? []) {
  if (p.backdrop === true || BACKDROP_RE.test(p.asset)) { skipped++; continue }
  const glb = glbOf(p.asset)
  if (!glb) continue
  resolved.push({ glb, pos: p.pos ?? [0, 0, 0], rotY: p.rotY ?? 0, scale: p.scale ?? 1 })
}
if (resolved.length === 0) { console.error('nenhuma peça resolvida.'); process.exit(1) }

const OUT_DIR = join(tmpdir(), `cortex_views_${Date.now()}`)
mkdirSync(OUT_DIR, { recursive: true })
const PIECES_JSON = JSON.stringify(resolved)
const OUT_DIR_JSON = JSON.stringify(OUT_DIR)

const py = `\
import bpy, json, math, mathutils

PIECES = ${PIECES_JSON}
OUT_DIR = ${OUT_DIR_JSON}
RES_W = 1600

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            try: coll.remove(b)
            except Exception: pass

def set_engine():
    for eng in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE','CYCLES'):
        try: bpy.context.scene.render.engine = eng; return
        except Exception: continue

def setup_world():
    w = bpy.data.worlds.new('W'); w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.09,0.08,0.16,1.0); bg.inputs[1].default_value = 0.55
    bpy.context.scene.world = w

def place(p):
    before = set(bpy.context.scene.objects)
    try: bpy.ops.import_scene.gltf(filepath=p['glb'])
    except Exception as e: print('IMPORT_ERROR', repr(e)); return
    new = [o for o in bpy.context.scene.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    empty = bpy.data.objects.new('P', None); bpy.context.scene.collection.objects.link(empty)
    for r in roots: r.parent = empty
    x,y,z = p['pos']
    empty.location = (x, -z, y)
    empty.rotation_euler = (0,0, math.radians(p.get('rotY',0)))
    s = p.get('scale',1); empty.scale = (s,s,s)

def scene_bbox():
    pts=[]; deps=bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type!='MESH': continue
        oe=o.evaluated_get(deps)
        for c in oe.bound_box: pts.append(oe.matrix_world @ mathutils.Vector(c))
    mn=mathutils.Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
    mx=mathutils.Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    return mn,mx,(mn+mx)/2.0

clear(); setup_world()
for p in PIECES: place(p)
sc=bpy.context.scene; set_engine()
sc.render.film_transparent=False; sc.render.image_settings.file_format='PNG'
mn,mx,center=scene_bbox(); size=mx-mn
dist=size.length+60.0

# Luz: key + fill (sol de 2 lados) — leitura clara de volume.
key=bpy.data.lights.new('K','SUN'); key.energy=3.0
ko=bpy.data.objects.new('K',key); sc.collection.objects.link(ko); ko.rotation_euler=(math.radians(55),math.radians(10),math.radians(40))
fill=bpy.data.lights.new('F','SUN'); fill.energy=1.1
fo=bpy.data.objects.new('F',fill); sc.collection.objects.link(fo); fo.rotation_euler=(math.radians(65),0,math.radians(210))

def render_view(name, loc, rot, ox, oy):
    cd=bpy.data.cameras.new('C'); cd.type='ORTHO'; cd.ortho_scale=max(ox,0.5)*1.12+3.0
    cd.clip_start=0.01; cd.clip_end=dist*4
    cam=bpy.data.objects.new('C',cd); sc.collection.objects.link(cam); sc.camera=cam
    cam.location=loc; cam.rotation_euler=rot
    rw=RES_W; rh=max(1,int(round(RES_W*(max(oy,0.5)*1.12+3.0)/(max(ox,0.5)*1.12+3.0))))
    rh=min(rh, RES_W)  # trava faixas extremas
    sc.render.resolution_x=rw; sc.render.resolution_y=rh
    sc.render.filepath=OUT_DIR+'/'+name+'.png'
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam); bpy.data.cameras.remove(cd)
    return {'name':name,'w':rw,'h':rh}

def track(loc):
    d=(center-loc).normalized(); return d.to_track_quat('-Z','Y').to_euler()

views=[]
# TOPO: olha pra baixo (-Z), +X direita, profundidade(+Y) cima.
views.append(render_view('topo', center+mathutils.Vector((0,0,dist)), (0,0,0), size.x, size.y))
# FRENTE: olha ao longo da profundidade (+Y), X horizontal, altura(Z) vertical.
loc_f=center+mathutils.Vector((0,-dist,0)); views.append(render_view('frente', loc_f, track(loc_f), size.x, size.z))
# LADO: olha ao longo de X, profundidade horizontal, altura vertical.
loc_l=center+mathutils.Vector((dist,0,0)); views.append(render_view('lado', loc_l, track(loc_l), size.y, size.z))
# ISO 3/4.
diso=mathutils.Vector((1,-1,0.85)).normalized(); loc_i=center+diso*dist
views.append(render_view('iso', loc_i, track(loc_i), math.hypot(size.x,size.y), math.hypot(size.x,size.y)*0.52+size.z))

with open(OUT_DIR+'/views.json','w') as f: json.dump(views,f)
print('VIEWS_DONE', len(views))
`

const tmpPy = join(OUT_DIR, 'render.py')
writeFileSync(tmpPy, py, 'utf-8')
const blender = process.env.BLENDER_PATH || 'blender'
console.log(`Blender: ${resolved.length} peças (${skipped} backdrop) → 4 vistas`)
const r = spawnSync(blender, ['--background', '--python', tmpPy], { stdio: 'inherit' })
if (r.status !== 0) { console.error('Blender falhou.'); process.exit(1) }

// ── Compositor: contact-sheet vertical (4 vistas full-width + rótulos) ─────────
const views = JSON.parse(readFileSync(join(OUT_DIR, 'views.json'), 'utf8'))
const LABELS = { topo: 'TOPO — layout XZ (linearidade + espaçamento)', frente: 'FRENTE — X × altura', lado: 'LADO — profundidade × altura', iso: '3/4 ISO — maquete' }
const dataUri = (f) => `data:image/png;base64,${readFileSync(join(OUT_DIR, f)).toString('base64')}`
const W = 1760
const PAD = 24, LABEL_H = 34, GAP = 18, TITLE_H = 74
let totalH = TITLE_H + PAD
const blocks = []
for (const v of views) {
  const dispH = Math.round(W * (v.h / v.w))
  blocks.push({ v, dispH })
  totalH += LABEL_H + dispH + GAP
}
totalH += PAD
const title = level.title ?? 'Level'
const blocksHtml = blocks.map(({ v, dispH }) =>
  `<div class="blk"><div class="vl">${LABELS[v.name] ?? v.name}</div>` +
  `<img src="${dataUri(v.name + '.png')}" style="width:${W}px;height:${dispH}px"></div>`).join('\n')
const html = `<!--BP_W:${W + PAD * 2} BP_H:${totalH}-->
<div style="width:${W + PAD * 2}px;background:#0e0b1e;color:#e8e6f5;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;padding:${PAD}px;box-sizing:border-box">
  <div style="font-size:26px;font-weight:800;margin:2px 0 4px">${title} <span style="color:#b49bff">— validação (4 vistas)</span></div>
  <div style="font-size:13px;color:#9a96c0;margin-bottom:10px">TOPO afere linearidade e espaçamento · FRENTE/LADO aferem altura e sobreposição · ISO é a leitura de maquete. Backdrop omitido.</div>
  ${blocksHtml.replace(/class="blk"/g, `class="blk" style="margin-bottom:${GAP}px"`).replace(/class="vl"/g, `class="vl" style="font-size:13px;font-weight:700;letter-spacing:.06em;color:#c9bcff;height:${LABEL_H}px;display:flex;align-items:center"`)}
</div>`
const tmpHtml = join(OUT_DIR, 'sheet.html')
writeFileSync(tmpHtml, html, 'utf-8')
const shot = join(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), 'shot.mjs')
const s = spawnSync('node', [shot, tmpHtml, resolve(outPath), String(W + PAD * 2), '2'], { stdio: 'inherit' })
rmSync(OUT_DIR, { recursive: true, force: true })
if (s.status !== 0) { console.error('shot falhou.'); process.exit(1) }
console.log('OK →', outPath)
