// Render ISOMÉTRICO 3D de um LEVEL a partir de coords de MUNDO reais (não px de
// canvas). É a "imagem do level" — os .glb reais posicionados em 3D, vista de
// maquete (ortográfica 3/4), pra saber COMO posicionar as coisas (o que a planta
// 2D esquemática não comunica). Usa Blender headless (mesmo pipeline do
// inspect_assets/renderThumbnails). Gêmeo no Studio: ADR-0142 (a evoluir).
//
// Uso: node render_level_iso.mjs <level3d.json> <kitAssetsDir> <out.png> [w] [h]
//
// level3d.json: { kit, title, pieces: [{ asset, pos:[x,y,z], rotY?, scale?,
//   behavior? }] } — pos em coords de MUNDO da engine (Y-up: x lateral, y altura,
//   z profundidade). O render converte Y-up → Z-up do Blender.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, isAbsolute, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const [levelPath, kitDir, outPath, wArg, hArg] = process.argv.slice(2)
if (!levelPath || !kitDir || !outPath) {
  console.error('uso: node render_level_iso.mjs <level3d.json> <kitAssetsDir> <out.png> [w] [h]')
  process.exit(1)
}
const W = parseInt(wArg ?? '2000', 10)
const H = parseInt(hArg ?? '1100', 10)

const level = JSON.parse(readFileSync(levelPath, 'utf8'))
const pieces = level.pieces ?? []

// Resolve o .glb de cada peça (kitDir/<asset>.glb ou kitDir/assets/<asset>.glb).
function glbOf(asset) {
  const name = asset.replace(/\.glb$/i, '')
  for (const cand of [join(kitDir, `${name}.glb`), join(kitDir, 'assets', `${name}.glb`)]) {
    if (existsSync(cand)) return cand
  }
  return null
}

// O render iso é uma MAQUETE do level JOGÁVEL. Backdrop (planetas/meteoros — decor
// gigante e distante) fica FORA: só esticaria o enquadramento e some o gameplay.
// Pula por `behavior:"decoration"` explícito com flag `backdrop`, ou por nome.
const BACKDROP_RE = /^(planet|meteors?|sky|nebula)/i
function isBackdrop(p) {
  if (p.backdrop === true) return true
  return BACKDROP_RE.test(p.asset)
}

const resolved = []
const missing = []
let skipped = 0
for (const p of pieces) {
  if (isBackdrop(p)) { skipped++; continue }
  const glb = glbOf(p.asset)
  if (!glb) { missing.push(p.asset); continue }
  resolved.push({
    glb,
    pos: p.pos ?? [0, 0, 0],
    rotY: p.rotY ?? 0,
    scale: p.scale ?? 1,
  })
}
if (skipped) console.log(`(${skipped} peça(s) de backdrop omitidas do render iso)`)
if (missing.length) console.warn(`AVISO: ${missing.length} asset(s) sem .glb: ${[...new Set(missing)].join(', ')}`)
if (resolved.length === 0) { console.error('nenhuma peça com .glb resolvido.'); process.exit(1) }

const PIECES_JSON = JSON.stringify(resolved)
const OUT_JSON = JSON.stringify(resolve(outPath))

// ── Script Python do Blender (determinístico) ─────────────────────────────────
// Y-up (engine/glTF) → Z-up (Blender): ponto (x,y,z) → (x, -z, y). O importer já
// converte a GEOMETRIA; posicionamos o Empty-pai de cada peça na coord convertida.
const py = `\
import bpy, json, math, mathutils

PIECES = ${PIECES_JSON}
OUT = ${OUT_JSON}
W = ${W}
H = ${H}

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.images, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            try: coll.remove(b)
            except Exception: pass

def set_engine():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
        try:
            sc.render.engine = eng
            return
        except Exception: continue

def setup_world():
    w = bpy.data.worlds.new('W')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.09, 0.08, 0.16, 1.0)  # índigo escuro (leitura espacial)
        bg.inputs[1].default_value = 0.55
    bpy.context.scene.world = w

def place_piece(p):
    before = set(bpy.context.scene.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=p['glb'])
    except Exception as e:
        print('IMPORT_ERROR', p['glb'], repr(e)); return
    new = [o for o in bpy.context.scene.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    # Empty-pai na origem; parenta os roots e transforma no espaço da engine.
    empty = bpy.data.objects.new('P', None)
    bpy.context.scene.collection.objects.link(empty)
    for r in roots:
        r.parent = empty
    x, y, z = p['pos']
    empty.location = (x, -z, y)          # Y-up -> Z-up
    empty.rotation_euler = (0.0, 0.0, math.radians(p.get('rotY', 0.0)))
    s = p.get('scale', 1.0)
    empty.scale = (s, s, s)

def scene_bbox():
    pts = []
    deps = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        oe = o.evaluated_get(deps)
        for c in oe.bound_box:
            pts.append(oe.matrix_world @ mathutils.Vector(c))
    if not pts: return None, None, None
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx, (mn + mx) / 2.0

clear()
setup_world()
for p in PIECES:
    place_piece(p)

sc = bpy.context.scene
set_engine()
sc.render.resolution_x = W
sc.render.resolution_y = H
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'

mn, mx, center = scene_bbox()
if mn is None:
    print('NO_GEOMETRY'); raise SystemExit(1)

size_v = mx - mn
# Câmera ORTOGRÁFICA num ângulo 3/4 elevado (maquete iso). Direção fixa.
cam_data = bpy.data.cameras.new('C')
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('C', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
direction = mathutils.Vector((1.0, -1.0, 0.85)).normalized()
cam.location = center + direction * (size_v.length + 20.0)
look = (center - cam.location).normalized()
cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
# ortho_scale = maior extensão projetada, com folga. Aprox pela diagonal do bbox.
diag = math.hypot(size_v.x, size_v.y)
cam_data.ortho_scale = max(diag, size_v.z) * 1.15 + 4.0

# Luz: sun key (cima-frente) + sun fill fraco pelo lado oposto.
key = bpy.data.lights.new('K', 'SUN'); key.energy = 3.2
ko = bpy.data.objects.new('K', key); sc.collection.objects.link(ko)
ko.rotation_euler = (math.radians(55), math.radians(10), math.radians(40))
fill = bpy.data.lights.new('F', 'SUN'); fill.energy = 1.0
fo = bpy.data.objects.new('F', fill); sc.collection.objects.link(fo)
fo.rotation_euler = (math.radians(65), 0.0, math.radians(210))

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('LEVEL_ISO_DONE', len(PIECES))
`

const tmpPy = join(tmpdir(), `cortex_level_iso_${Date.now()}.py`)
mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(tmpPy, py, 'utf-8')

const blender = process.env.BLENDER_PATH || 'blender'
console.log(`Blender: ${resolved.length} peças → ${outPath} (${W}×${H})`)
const r = spawnSync(blender, ['--background', '--python', tmpPy], { stdio: 'inherit' })
rmSync(tmpPy, { force: true })
if (r.status !== 0) { console.error('Blender falhou.'); process.exit(1) }
console.log('OK')
