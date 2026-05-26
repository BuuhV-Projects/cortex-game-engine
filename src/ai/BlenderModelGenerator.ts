import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── System prompt (cacheado via cache_control ephemeral) ─────────────────────

const BPY_SYSTEM_PROMPT = `\
Você é um especialista na API Python do Blender (bpy). Gera scripts Python que criam \
modelos 3D no Blender e os exportam como arquivos GLB.

## Módulo bpy — Referência da API

### Configuração da cena
\`\`\`python
import bpy

# Limpar a cena padrão (remove todos os objetos)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Limpar dados órfãos
for block in bpy.data.meshes:
    bpy.data.meshes.remove(block)
for block in bpy.data.materials:
    bpy.data.materials.remove(block)
\`\`\`

### Criação de geometria — Primitivas
\`\`\`python
# Cubo
bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))

# Cilindro
bpy.ops.mesh.primitive_cylinder_add(
    radius=1.0, depth=2.0, vertices=32, location=(0, 0, 0))

# Esfera UV
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=1.0, segments=32, ring_count=16, location=(0, 0, 0))

# Cone
bpy.ops.mesh.primitive_cone_add(
    radius1=1.0, radius2=0.0, depth=2.0, vertices=32, location=(0, 0, 0))

# Plano
bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, 0))

# Torus
bpy.ops.mesh.primitive_torus_add(
    major_radius=1.0, minor_radius=0.25,
    major_segments=48, minor_segments=16)
\`\`\`

### Manipulação de objetos
\`\`\`python
# Acessar o objeto ativo (recém-criado)
obj = bpy.context.active_object

# Renomear objeto e mesh
obj.name = "Sword"
obj.data.name = "SwordMesh"

# Transformações (1 unidade Blender = 1 metro)
obj.location      = (0.0, 0.0, 1.0)           # posição (x, y, z)
obj.rotation_euler = (0.0, 0.0, 1.5708)        # radianos (x, y, z)
obj.scale          = (1.0, 0.5, 2.0)           # escala (x, y, z)

# Aplicar transformações ao mesh
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# Selecionar / ativar objetos
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

# Parenting
child.parent = parent
child.matrix_parent_inverse = parent.matrix_world.inverted()
\`\`\`

### Operações de malha com bmesh
\`\`\`python
import bmesh

obj  = bpy.context.active_object
mesh = obj.data

bm = bmesh.new()
bm.from_mesh(mesh)

# Extrudar faces
result = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
verts  = [v for v in result['geom'] if isinstance(v, bmesh.types.BMVert)]
bmesh.ops.translate(bm, vec=(0, 0, 1.5), verts=verts)

# Bevel nas arestas
bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.05, segments=2, profile=0.5)

# Subdivisão
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)

bm.to_mesh(mesh)
mesh.update()
bm.free()
\`\`\`

### Modificadores
\`\`\`python
obj = bpy.context.active_object

# Solidify — dar espessura a uma superfície
mod           = obj.modifiers.new(name="Solidify", type='SOLIDIFY')
mod.thickness = 0.05

# Bevel
mod          = obj.modifiers.new(name="Bevel", type='BEVEL')
mod.width    = 0.02
mod.segments = 2

# Subdivision Surface (mais polígonos / smoothing)
mod        = obj.modifiers.new(name="Subdiv", type='SUBSURF')
mod.levels = 2

# Boolean (subtrair/unir meshes) — Blender ≥ 4.0
mod           = obj.modifiers.new(name="Bool", type='BOOLEAN')
mod.operation = 'DIFFERENCE'   # 'UNION' | 'DIFFERENCE' | 'INTERSECT'
mod.object    = cutter_obj
# IMPORTANTE: na API moderna (Blender 4.x+) os solvers válidos são apenas
# 'FLOAT', 'EXACT' ou 'MANIFOLD'. NÃO use 'FAST' — esse enum foi removido
# e causa TypeError. Se não precisar especificar, omita a linha (default OK).
# mod.solver = 'EXACT'

# Aplicar modificador
bpy.ops.object.modifier_apply(modifier=mod.name)
\`\`\`

### Materiais PBR — Principled BSDF
\`\`\`python
# Criar material
mat           = bpy.data.materials.new(name="SteelBlade")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# Nó Principled BSDF (já presente por padrão)
principled = nodes.get("Principled BSDF")

# ─── Propriedades PBR ────────────────────────────────────────────────────────
# Base Color (RGBA, 0.0–1.0)
principled.inputs["Base Color"].default_value      = (0.80, 0.80, 0.85, 1.0)
# Metallic: 0.0 = dielétrico, 1.0 = metal puro
principled.inputs["Metallic"].default_value        = 1.0
# Roughness: 0.0 = espelho, 1.0 = totalmente difuso
principled.inputs["Roughness"].default_value       = 0.15
# IOR (índice de refração): 1.45 = vidro, 1.5 = plástico, 2.4 = diamante
principled.inputs["IOR"].default_value             = 1.45
# Emission Color + Strength (0.0 = sem emissão)
principled.inputs["Emission Color"].default_value  = (0.0, 0.0, 0.0, 1.0)
principled.inputs["Emission Strength"].default_value = 0.0
# Alpha (1.0 = opaco; usar mat.blend_method = 'BLEND' para transparência)
principled.inputs["Alpha"].default_value           = 1.0

# ─── Receitas de materiais comuns ────────────────────────────────────────────
# Aço polido   : Metallic=1.0, Roughness=0.05, BaseColor=(0.80,0.80,0.85)
# Ferro enferrujado: Metallic=0.7, Roughness=0.9, BaseColor=(0.30,0.15,0.05)
# Madeira      : Metallic=0.0, Roughness=0.8,  BaseColor=(0.40,0.25,0.10)
# Pedra        : Metallic=0.0, Roughness=0.9,  BaseColor=(0.50,0.50,0.50)
# Ouro         : Metallic=1.0, Roughness=0.1,  BaseColor=(1.00,0.78,0.28)
# Plástico red : Metallic=0.0, Roughness=0.4,  BaseColor=(0.80,0.05,0.05)
# Emissivo neon: EmissionColor=(0,1,0,1), EmissionStrength=5.0

# Atribuir material ao objeto
obj.data.materials.append(mat)

# Múltiplos materiais por polígono
# obj.data.materials.append(mat2)
# for face in mesh.polygons: face.material_index = 1
\`\`\`

### Exportação GLTF/GLB
\`\`\`python
# Exportar toda a cena como GLB (binário)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_PATH,         # variável injetada antes da execução
    export_format='GLB',          # 'GLB' (binário, recomendado) ou 'GLTF_EMBEDDED'
    use_selection=False,          # False = exportar tudo
    export_apply=True,            # aplicar modificadores antes de exportar
    export_materials='EXPORT',    # incluir materiais PBR
    export_colors=True,           # vertex colors
    export_texcoords=True,        # UV maps
    export_normals=True,          # normais
    export_tangents=False,
    export_animations=False,      # sem animações para modelos estáticos
    export_skins=False,
    export_morph=False,
    export_lights=False,          # não exportar luzes da cena
    export_cameras=False,         # não exportar câmeras
)
\`\`\`

## Formato da resposta

Responda **sempre** com:
1. Breve explicação do modelo que será gerado.
2. Script completo em único bloco \`\`\`python ... \`\`\`.

O script deve:
- Importar \`bpy\` (e \`bmesh\` se necessário) no topo.
- Limpar a cena padrão logo no início.
- Usar a variável \`OUTPUT_PATH\` para o caminho de exportação — ela já estará definida \
quando o script for executado, não a redefina.
- Chamar \`bpy.ops.export_scene.gltf(filepath=OUTPUT_PATH, ...)\` ao final.
- Incluir comentários descrevendo as partes principais.`;

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Resultado retornado por {@link BlenderModelGenerator.generate}. */
export interface GenerateModelResult {
  /** Caminho do arquivo `.glb` exportado pelo Blender. */
  glbPath: string;
  /** Caminho do script Python temporário (pode ser inspecionado ou re-executado). */
  scriptPath: string;
}

// ─── BlenderModelGenerator ───────────────────────────────────────────────────

/**
 * Gera modelos 3D (.glb) a partir de descrições em linguagem natural.
 *
 * Usa o `@anthropic-ai/claude-agent-sdk` em modo single-shot (sem tools, sem
 * sessão, sem preset do Claude Code) para pedir um script Python `bpy` ao
 * Claude, e então roda Blender headless para exportar o GLB. A auth fica a
 * cargo do SDK — funciona com `ANTHROPIC_API_KEY` no env ou OAuth do
 * `claude login` (ver ADR-0020).
 *
 * @example
 * const gen = new BlenderModelGenerator();
 * const { glbPath, scriptPath } = await gen.generate(
 *   'uma espada medieval com lâmina metálica e cabo de madeira',
 *   './assets/sword.glb',
 * );
 *
 * @see ADR-0004 (Blender CLI) / ADR-0020 (Claude Agent SDK)
 */
export class BlenderModelGenerator {
  /**
   * Gera um modelo 3D `.glb` a partir de uma descrição em linguagem natural.
   *
   * Fluxo:
   * 1. Pede o script ao Claude via `claude-agent-sdk` (sem tools, sem cwd).
   * 2. Extrai o bloco ```python da resposta.
   * 3. Injeta `OUTPUT_PATH` no topo do script.
   * 4. Salva o script em arquivo temporário.
   * 5. Executa `blender --background --python <script>`.
   * 6. Retorna `{ glbPath, scriptPath }`.
   *
   * @param description - Descrição em linguagem natural do modelo desejado.
   * @param outputPath  - Caminho de destino do arquivo `.glb` a ser gerado.
   * @returns Objeto com `{ glbPath, scriptPath }`.
   * @throws {Error} Se a API não retornar um bloco ```python válido.
   * @throws {Error} Se o Blender não estiver instalado ou falhar.
   */
  async generate(description: string, outputPath: string): Promise<GenerateModelResult> {
    // Garante extensão .glb
    const glbPath = outputPath.endsWith('.glb') ? outputPath : `${outputPath}.glb`;

    // ── 1. Gerar script Python via Claude Agent SDK (single-shot) ──────────
    // systemPrompt como string usa prompt custom puro (sem preset Claude Code).
    // allowedTools: [] zera as tools nativas (Read/Write/Bash) — só queremos
    // uma resposta de texto, não interação com filesystem.
    const fullText = await _querySingleShot(BPY_SYSTEM_PROMPT, description);

    // ── 2. Extrair bloco ```python da resposta ─────────────────────────────
    const codeMatch = /```python\s*([\s\S]*?)```/.exec(fullText);
    if (!codeMatch || !codeMatch[1]) {
      throw new Error(
        'A IA não retornou um bloco de código Python válido (```python ... ```). ' +
          'Tente reformular a descrição.',
      );
    }

    const generatedScript = codeMatch[1].trim();

    // ── 3. Injetar OUTPUT_PATH no topo do script ──────────────────────────
    // Claude é instruído a usar OUTPUT_PATH; injetamos o valor real aqui.
    const scriptContent = `OUTPUT_PATH = ${JSON.stringify(glbPath)}\n\n${generatedScript}`;

    // ── 4. Salvar script em arquivo temporário ────────────────────────────
    const scriptPath = join(tmpdir(), `blender_gen_${Date.now()}.py`);
    await writeFile(scriptPath, scriptContent, 'utf-8');

    // ── 5. Executar Blender CLI ────────────────────────────────────────────
    // Respeita BLENDER_PATH; usa 'blender' como padrão (deve estar no PATH)
    const blenderBin = process.env['BLENDER_PATH'] ?? 'blender';
    await _runBlender(blenderBin, scriptPath);

    // ── 6. Verificar que o GLB foi escrito ────────────────────────────────
    // Blender pode sair com exit 0 mesmo quando o script Python crasha antes
    // do `bpy.ops.export_scene.gltf(...)` (ex.: incompatibilidade de API entre
    // versões). Sem esta checagem retornaríamos "sucesso" para a IA, que
    // anunciaria o modelo ao usuário sem o arquivo existir.
    if (!existsSync(glbPath) || statSync(glbPath).size === 0) {
      throw new Error(
        `Blender encerrou sem erro, mas o arquivo ${glbPath} não foi criado. ` +
          `Provável crash do script Python antes da exportação — inspecione ${scriptPath} ` +
          `e rode "${blenderBin} --background --python ${scriptPath}" no terminal para ver o traceback.`,
      );
    }

    // ── 7. Retornar caminhos ───────────────────────────────────────────────
    return { glbPath, scriptPath };
  }
}

// ─── Utilitário interno ───────────────────────────────────────────────────────

/**
 * Chamada LLM single-shot via Claude Agent SDK. Coleta os blocos de texto
 * do assistant e retorna o conteúdo concatenado. Sem tools, sem sessão.
 */
async function _querySingleShot(systemPrompt: string, userPrompt: string): Promise<string> {
  const q = query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      allowedTools: [],
      includePartialMessages: false,
    },
  });

  let fullText = '';
  for await (const msg of q) {
    const m = msg as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
      for (const block of m.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          fullText += block.text;
        }
      }
    }
  }
  return fullText;
}

/**
 * Executa `blender --background --python <scriptPath>` e aguarda o término.
 *
 * @throws {Error} Se o Blender não for encontrado ou retornar código de saída não-zero.
 */
function _runBlender(blenderBin: string, scriptPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(blenderBin, ['--background', '--python', scriptPath], {
      // stdin:  ignorado  — Blender não precisa de entrada
      // stdout: herdado   — Blender --background é verboso; herdar evita deadlock por
      //                     buffer cheio (~64 KB) quando o pipe não é consumido
      // stderr: pipe      — capturado para incluir na mensagem de erro se falhar
      stdio: ['ignore', 'inherit', 'pipe'],
    });

    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: Error) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        reject(
          new Error(
            `Blender não encontrado em "${blenderBin}". ` +
              'Instale o Blender e certifique-se de que está disponível no PATH, ' +
              'ou defina a variável de ambiente BLENDER_PATH com o caminho completo ' +
              'do executável (ex: BLENDER_PATH=/usr/bin/blender).',
          ),
        );
      } else {
        reject(new Error(`Falha ao iniciar o Blender: ${err.message}`));
      }
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = stderr.trim() ? `\n\nSaída de erro:\n${stderr.trim()}` : '';
        reject(
          new Error(
            `Blender encerrou com código de saída ${String(code)}.${detail}`,
          ),
        );
      }
    });
  });
}
