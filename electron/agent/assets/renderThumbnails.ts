import { spawn } from 'node:child_process'
import { readdir, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute, resolve, basename } from 'node:path'

/**
 * Renderiza um thumbnail (PNG 3/4 view) de cada `.glb` de um diretório e extrai
 * suas dimensões (bounding box em unidades do engine) usando o Blender em modo
 * headless. É o que dá "olhos" ao Chat IA sobre os assets de um pacote importado:
 * sem isso a IA só vê nomes de arquivo e posiciona modelos às cegas (ver
 * tool `inspect_assets`).
 *
 * Reusa a mesma estratégia de invocação do {@link BlenderModelGenerator}
 * (`blender --background --python script.py`, respeitando BLENDER_PATH), mas com
 * um script Python DETERMINÍSTICO (não gerado por LLM): importa cada GLB, calcula
 * o bounding box em world-space, enquadra a câmera e renderiza com EEVEE.
 */

/** Dimensões do bounding box em eixos glTF/three (Y-up), em unidades do engine. */
export interface AssetDims {
  /** Largura (eixo X). */
  x: number
  /** Altura (eixo Y, vertical). */
  y: number
  /** Profundidade (eixo Z). */
  z: number
}

export interface AssetThumbnail {
  /** Nome do arquivo sem extensão (ex.: "bridge"). */
  name: string
  /** Caminho do .glb relativo à raiz do projeto (ex.: "assets/bridge.glb"). */
  assetPath: string
  /** Bounding box em unidades do engine, ou null se não foi possível medir. */
  dims: AssetDims | null
  /** PNG do thumbnail, ou null se a renderização falhou para este asset. */
  png: Buffer | null
}

export interface RenderThumbnailsResult {
  thumbnails: AssetThumbnail[]
  ok: boolean
  /** Nota humana (sucesso ou causa da falha global). */
  note: string
}

export interface RenderThumbnailsOptions {
  /** Diretório a varrer, relativo à raiz do projeto. Default "assets". */
  dir?: string
  /** Lado do thumbnail quadrado, em px. Default 384. */
  size?: number
  /** Máximo de .glb a renderizar (proteção contra pacotes enormes). Default 48. */
  max?: number
}

interface ManifestEntry {
  name: string
  thumb: string
  dims: [number, number, number] | null
}

/** Encontra todos os `.glb` em `dir` recursivamente (caminhos absolutos). */
async function findGlbFiles(dir: string, max: number): Promise<string[]> {
  let entries: string[]
  try {
    const found = await readdir(dir, { recursive: true, withFileTypes: true })
    entries = found
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.glb'))
      // e.parentPath (Node 20.12+) ou e.path (mais antigo) dá o diretório do entry.
      .map((e) => join((e as { parentPath?: string; path?: string }).parentPath ?? (e as { path?: string }).path ?? dir, e.name))
  } catch {
    return []
  }
  entries.sort()
  return entries.slice(0, max)
}

/**
 * Monta o script Python do Blender. Determinístico: recebe a lista de GLBs e o
 * diretório de saída e renderiza um thumbnail por asset + um manifest.json com
 * as dimensões. Cada asset é envolto em try/except pra um arquivo corrompido não
 * derrubar o lote inteiro.
 */
function buildBlenderScript(glbPaths: string[], outDir: string, size: number): string {
  // JSON é literal válido em Python pra listas/strings; backslashes de paths
  // Windows já vêm escapados (\\) pelo JSON.stringify — viram backslash único.
  const assetsJson = JSON.stringify(glbPaths)
  const outDirJson = JSON.stringify(outDir)
  return `\
import bpy, json, os, math, mathutils

ASSETS = ${assetsJson}
OUT_DIR = ${outDirJson}
SIZE = ${size}

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.images, bpy.data.armatures, bpy.data.cameras,
                 bpy.data.lights):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass

def set_engine():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
        try:
            sc.render.engine = eng
            return
        except Exception:
            continue

def setup_world():
    # Fundo claro neutro com um pouco de emissão pra ambient occlusion suave.
    w = bpy.data.worlds.new('TW')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.85, 0.87, 0.90, 1.0)
        bg.inputs[1].default_value = 0.7
    bpy.context.scene.world = w

def mesh_bbox():
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        return None, None, None
    pts = []
    for o in objs:
        for corner in o.bound_box:
            pts.append(o.matrix_world @ mathutils.Vector(corner))
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx, (mn + mx) / 2.0

def frame_and_render(out_png):
    set_engine()
    sc = bpy.context.scene
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'

    mn, mx, center = mesh_bbox()
    if mn is None:
        return None

    size_v = mx - mn
    radius = max(size_v.length / 2.0, 0.001)

    # Câmera perspectiva num ângulo 3/4 (frente-direita-cima), tipo vitrine.
    cam_data = bpy.data.cameras.new('TC')
    cam_data.lens = 50.0
    cam = bpy.data.objects.new('TC', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    sc.camera = cam

    fov = cam_data.angle
    dist = (radius / math.sin(fov / 2.0)) * 1.5
    direction = mathutils.Vector((1.0, -1.0, 0.7)).normalized()
    cam.location = center + direction * dist
    look = (center - cam.location).normalized()
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()

    # Sun key-light vindo de cima-frente + fill pelo world.
    sun_data = bpy.data.lights.new('TS', 'SUN')
    sun_data.energy = 3.0
    sun = bpy.data.objects.new('TS', sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = mathutils.Vector((0.9, 0.2, 0.5))

    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    # Dimensões reportadas em eixos glTF/three (Y-up): Blender Z vira altura,
    # Blender Y vira profundidade (o importer converte Y-up->Z-up no load).
    return [round(size_v.x, 4), round(size_v.z, 4), round(size_v.y, 4)]

os.makedirs(OUT_DIR, exist_ok=True)
setup_world()
results = []
for path in ASSETS:
    name = os.path.splitext(os.path.basename(path))[0]
    entry = {'name': name, 'thumb': name + '.png', 'dims': None}
    try:
        clear()
        bpy.ops.import_scene.gltf(filepath=path)
        out_png = os.path.join(OUT_DIR, name + '.png')
        entry['dims'] = frame_and_render(out_png)
    except Exception as e:
        print('THUMB_ERROR', name, repr(e))
    results.append(entry)

with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
    json.dump(results, f)
print('THUMB_DONE', len(results))
`
}

function runBlender(blenderBin: string, scriptPath: string): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(blenderBin, ['--background', '--python', scriptPath], {
      stdio: ['ignore', 'inherit', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err: Error) => {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'ENOENT') {
        reject(
          new Error(
            `Blender não encontrado em "${blenderBin}". Instale o Blender e ` +
              'garanta que está no PATH, ou defina BLENDER_PATH com o caminho do executável.',
          ),
        )
      } else {
        reject(new Error(`Falha ao iniciar o Blender: ${err.message}`))
      }
    })
    child.on('close', (code: number | null) => {
      if (code === 0) resolvePromise()
      else {
        const detail = stderr.trim() ? `\n\nSaída de erro:\n${stderr.trim()}` : ''
        reject(new Error(`Blender encerrou com código ${String(code)}.${detail}`))
      }
    })
  })
}

/**
 * Varre o diretório de assets do projeto, renderiza um thumbnail por `.glb` e
 * mede o bounding box de cada um. Os PNGs ficam num diretório temporário; o
 * chamador (tool `inspect_assets`) decide onde persistir/como devolver à IA.
 */
export async function renderAssetThumbnails(
  projectRoot: string,
  opts: RenderThumbnailsOptions = {},
): Promise<RenderThumbnailsResult> {
  const relDir = opts.dir ?? 'assets'
  const size = opts.size ?? 384
  const max = opts.max ?? 48

  const absDir = isAbsolute(relDir) ? relDir : resolve(projectRoot, relDir)
  const rel = relative(projectRoot, absDir)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { thumbnails: [], ok: false, note: `Diretório "${relDir}" sai do projeto.` }
  }
  if (!existsSync(absDir)) {
    return { thumbnails: [], ok: false, note: `Diretório não encontrado: ${relDir}` }
  }

  const glbPaths = await findGlbFiles(absDir, max)
  if (glbPaths.length === 0) {
    return { thumbnails: [], ok: false, note: `Nenhum .glb encontrado em ${relDir}.` }
  }

  const outDir = join(tmpdir(), `cortex_thumbs_${Date.now()}`)
  const scriptPath = join(tmpdir(), `cortex_thumbs_${Date.now()}.py`)

  try {
    await mkdir(outDir, { recursive: true })
    await writeFile(scriptPath, buildBlenderScript(glbPaths, outDir, size), 'utf-8')

    const blenderBin = process.env['BLENDER_PATH'] ?? 'blender'
    await runBlender(blenderBin, scriptPath)

    const manifestPath = join(outDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      return {
        thumbnails: [],
        ok: false,
        note: `Blender rodou mas não gerou manifest.json — inspecione ${scriptPath}.`,
      }
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as ManifestEntry[]

    const thumbnails: AssetThumbnail[] = []
    for (let i = 0; i < manifest.length; i++) {
      const entry = manifest[i]!
      const glb = glbPaths[i]!
      let png: Buffer | null = null
      const thumbFile = join(outDir, entry.thumb)
      if (existsSync(thumbFile)) {
        try {
          png = await readFile(thumbFile)
        } catch {
          png = null
        }
      }
      thumbnails.push({
        name: entry.name || basename(glb, '.glb'),
        assetPath: relative(projectRoot, glb).replace(/\\/g, '/'),
        dims: entry.dims ? { x: entry.dims[0], y: entry.dims[1], z: entry.dims[2] } : null,
        png,
      })
    }

    const rendered = thumbnails.filter((t) => t.png).length
    return {
      thumbnails,
      ok: rendered > 0,
      note:
        `${rendered}/${thumbnails.length} thumbnail(s) renderizado(s) de ${relDir}.` +
        (rendered < thumbnails.length ? ' Alguns assets falharam (ver dims null).' : ''),
    }
  } catch (err) {
    return {
      thumbnails: [],
      ok: false,
      note: err instanceof Error ? err.message : String(err),
    }
  } finally {
    // Limpa o diretório temporário (os PNGs já foram lidos para Buffer).
    await rm(outDir, { recursive: true, force: true }).catch(() => {})
    await rm(scriptPath, { force: true }).catch(() => {})
  }
}
