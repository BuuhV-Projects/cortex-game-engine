import type Anthropic from '@anthropic-ai/sdk'
import { readFile, writeFile, readdir, rm, mkdir, stat } from 'fs/promises'
import { dirname, relative } from 'path'
import { spawn } from 'child_process'
import { resolveInsideProject, SandboxError } from './sandbox.js'
import { generateEcsScript, generateBlenderModel } from './generators.js'

/**
 * Tools expostas ao agente (ADR-0017). Cada tool tem schema JSON Schema
 * para o tool use da SDK Anthropic + um executor que roda no main process
 * com acesso a fs/process.
 */

export const TOOL_SCHEMAS: Anthropic.Tool[] = [
  {
    name: 'list_files',
    description:
      'Lista arquivos e pastas em um diretório do projeto. Use para descobrir a ' +
      'estrutura antes de ler ou escrever. Path é relativo à raiz do projeto. ' +
      'Use "." para listar a raiz.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do diretório, relativo à raiz do projeto (ex: "scripts" ou ".").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Lê o conteúdo completo de um arquivo do projeto. Use para entender código ' +
      'existente antes de propor mudanças. Path é relativo à raiz do projeto.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do arquivo, relativo à raiz do projeto.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Cria ou sobrescreve um arquivo no projeto. Sobrescreve sem aviso se o ' +
      'arquivo já existe — usuário precisa aprovar antes. Cria diretórios pai ' +
      'automaticamente. Path é relativo à raiz do projeto.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do arquivo de destino, relativo à raiz do projeto.',
        },
        content: {
          type: 'string',
          description: 'Conteúdo completo do arquivo.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'delete_file',
    description:
      'Remove um arquivo ou diretório do projeto. Operação irreversível — ' +
      'usuário precisa aprovar antes.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho do alvo, relativo à raiz do projeto.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description:
      'Executa um comando shell no diretório do projeto. Use para instalar ' +
      'dependências (yarn add), rodar testes, ou outras operações de CLI. ' +
      'Não use para iniciar processos longos (servers, watch). Timeout 60s.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Comando completo a executar (ex: "yarn add three").',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'generate_script',
    description:
      'Gera um script JavaScript ECS completo a partir de uma descrição em ' +
      'linguagem natural e salva no projeto. Use para criar Systems e Components ' +
      'novos. Exige ANTHROPIC_API_KEY configurada.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Descrição em linguagem natural do comportamento ' +
            '(ex: "sistema de pulo ao pressionar espaço").',
        },
        target_path: {
          type: 'string',
          description:
            'Caminho destino do arquivo gerado, relativo à raiz do projeto ' +
            '(ex: "scripts/jump.js").',
        },
      },
      required: ['description', 'target_path'],
    },
  },
  {
    name: 'generate_blender_model',
    description:
      'Gera um modelo 3D (.glb) a partir de uma descrição em linguagem natural, ' +
      'usando Blender headless. Exige Blender instalado no PATH (ou ' +
      'BLENDER_PATH definido) e ANTHROPIC_API_KEY configurada. Timeout 5min.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Descrição do modelo (ex: "espada medieval com lâmina e cabo").',
        },
        target_path: {
          type: 'string',
          description:
            'Caminho destino do arquivo .glb, relativo à raiz do projeto ' +
            '(ex: "assets/sword.glb").',
        },
      },
      required: ['description', 'target_path'],
    },
  },
]

export const TOOLS_REQUIRING_APPROVAL = new Set([
  'write_file',
  'delete_file',
  'run_command',
  'generate_script',
  'generate_blender_model',
])

export interface ToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

export interface ToolExecutionResult {
  content: string
  isError: boolean
}

export interface ToolContext {
  projectRoot: string | null
  anthropicClient: Anthropic | null
  announce(request: ToolRequest): void
  requestApproval(request: ToolRequest): Promise<boolean>
  notifyExecuted(id: string, result: ToolExecutionResult): void
}

const RUN_COMMAND_TIMEOUT_MS = 60_000
const GENERATE_SCRIPT_TIMEOUT_MS = 60_000
const GENERATE_MODEL_TIMEOUT_MS = 300_000
const MAX_READ_FILE_BYTES = 256 * 1024
const MAX_DIR_ENTRIES = 500

/**
 * Roteia uma tool call para o executor correto. Faz validação de sandbox,
 * pede aprovação quando necessário, executa e devolve o resultado em string
 * (formato que vai virar `tool_result.content` na próxima rodada do agente).
 */
export async function executeTool(
  id: string,
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const input = (rawInput ?? {}) as Record<string, unknown>

  try {
    const request: ToolRequest = {
      id,
      name,
      input,
      summary: buildSummary(name, input),
      needsApproval: TOOLS_REQUIRING_APPROVAL.has(name),
    }

    ctx.announce(request)

    if (request.needsApproval) {
      const approved = await ctx.requestApproval(request)
      if (!approved) {
        const result: ToolExecutionResult = {
          content: 'Usuário negou esta operação.',
          isError: true,
        }
        ctx.notifyExecuted(id, result)
        return result
      }
    }

    const result = await runTool(name, input, ctx)
    ctx.notifyExecuted(id, result)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const result: ToolExecutionResult = { content: message, isError: true }
    ctx.notifyExecuted(id, result)
    return result
  }
}

function buildSummary(name: string, input: Record<string, unknown>): string {
  const path = typeof input['path'] === 'string' ? input['path'] : ''
  const targetPath = typeof input['target_path'] === 'string' ? input['target_path'] : ''
  const command = typeof input['command'] === 'string' ? input['command'] : ''
  const description = typeof input['description'] === 'string' ? input['description'] : ''
  const content = typeof input['content'] === 'string' ? input['content'] : ''
  const contentSize = `${content.length} caracteres`

  switch (name) {
    case 'list_files':
      return `Listar ${path || '.'}`
    case 'read_file':
      return `Ler ${path}`
    case 'write_file':
      return `Criar/sobrescrever ${path} (${contentSize})`
    case 'delete_file':
      return `Remover ${path}`
    case 'run_command':
      return `Executar: ${command}`
    case 'generate_script':
      return `Gerar script ECS → ${targetPath} (${description})`
    case 'generate_blender_model':
      return `Gerar modelo 3D → ${targetPath} (${description})`
    default:
      return name
  }
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  switch (name) {
    case 'list_files':
      return runListFiles(input, ctx)
    case 'read_file':
      return runReadFile(input, ctx)
    case 'write_file':
      return runWriteFile(input, ctx)
    case 'delete_file':
      return runDeleteFile(input, ctx)
    case 'run_command':
      return runRunCommand(input, ctx)
    case 'generate_script':
      return runGenerateScript(input, ctx)
    case 'generate_blender_model':
      return runGenerateBlenderModel(input, ctx)
    default:
      return { content: `Tool desconhecida: ${name}`, isError: true }
  }
}

// ─── Executores ───────────────────────────────────────────────────────────────

async function runListFiles(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const target = resolveInsideProject(ctx.projectRoot, input['path'])
  const entries = await readdir(target, { withFileTypes: true })
  const items = entries.slice(0, MAX_DIR_ENTRIES).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' : 'file',
  }))
  const truncated = entries.length > MAX_DIR_ENTRIES
  const lines = items.map((item) => `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`)
  if (truncated) {
    lines.push(`... (${entries.length - MAX_DIR_ENTRIES} mais omitidos)`)
  }
  return { content: lines.join('\n') || '(diretório vazio)', isError: false }
}

async function runReadFile(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const target = resolveInsideProject(ctx.projectRoot, input['path'])
  const fileInfo = await stat(target)
  if (fileInfo.isDirectory()) {
    throw new Error(`${input['path']} é um diretório, use list_files.`)
  }
  if (fileInfo.size > MAX_READ_FILE_BYTES) {
    throw new Error(
      `Arquivo muito grande (${fileInfo.size} bytes). Limite: ${MAX_READ_FILE_BYTES} bytes.`,
    )
  }
  const content = await readFile(target, 'utf-8')
  return { content, isError: false }
}

async function runWriteFile(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const target = resolveInsideProject(ctx.projectRoot, input['path'])
  const content = input['content']
  if (typeof content !== 'string') {
    throw new Error('content deve ser string.')
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf-8')
  const relPath = relative(ctx.projectRoot ?? '', target)
  return { content: `Arquivo escrito: ${relPath} (${content.length} caracteres).`, isError: false }
}

async function runDeleteFile(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const target = resolveInsideProject(ctx.projectRoot, input['path'])
  await rm(target, { recursive: true, force: true })
  return { content: `Removido: ${input['path']}.`, isError: false }
}

async function runRunCommand(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  if (!ctx.projectRoot) {
    throw new SandboxError('Nenhum projeto aberto.')
  }
  const command = input['command']
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('command deve ser string não-vazia.')
  }

  return new Promise<ToolExecutionResult>((resolvePromise) => {
    const child = spawn(command, {
      shell: true,
      cwd: ctx.projectRoot ?? undefined,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, RUN_COMMAND_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      resolvePromise({ content: `Falha ao iniciar comando: ${err.message}`, isError: true })
    })

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) {
        resolvePromise({
          content: `Comando excedeu timeout de ${RUN_COMMAND_TIMEOUT_MS / 1000}s e foi morto.`,
          isError: true,
        })
        return
      }
      const summary = [
        `exit code: ${code ?? 'null'}`,
        stdout.trim() ? `stdout:\n${truncate(stdout, 4000)}` : '',
        stderr.trim() ? `stderr:\n${truncate(stderr, 4000)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      resolvePromise({ content: summary || '(sem output)', isError: code !== 0 })
    })
  })
}

async function runGenerateScript(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    return {
      content:
        'Esta ferramenta exige ANTHROPIC_API_KEY configurada como variável de ambiente. ' +
        'Configure no console.anthropic.com e reinicie o IDE.',
      isError: true,
    }
  }
  if (!ctx.anthropicClient) {
    return { content: 'Cliente Anthropic não disponível.', isError: true }
  }
  const description = input['description']
  const targetPath = input['target_path']
  if (typeof description !== 'string' || typeof targetPath !== 'string') {
    throw new Error('description e target_path devem ser strings.')
  }

  const absoluteTarget = resolveInsideProject(ctx.projectRoot, targetPath)

  const result = await withTimeout(
    generateEcsScript(ctx.anthropicClient, description),
    GENERATE_SCRIPT_TIMEOUT_MS,
    'generate_script',
  )

  await mkdir(dirname(absoluteTarget), { recursive: true })
  await writeFile(absoluteTarget, result.code, 'utf-8')

  return {
    content:
      `Script gerado e salvo em ${targetPath}.\n\n` +
      `Explicação:\n${result.explanation || '(sem explicação)'}`,
    isError: false,
  }
}

async function runGenerateBlenderModel(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    return {
      content:
        'Esta ferramenta exige ANTHROPIC_API_KEY configurada como variável de ambiente. ' +
        'Configure no console.anthropic.com e reinicie o IDE.',
      isError: true,
    }
  }
  if (!ctx.anthropicClient) {
    return { content: 'Cliente Anthropic não disponível.', isError: true }
  }
  const description = input['description']
  const targetPath = input['target_path']
  if (typeof description !== 'string' || typeof targetPath !== 'string') {
    throw new Error('description e target_path devem ser strings.')
  }

  const absoluteTarget = resolveInsideProject(ctx.projectRoot, targetPath)

  const result = await withTimeout(
    generateBlenderModel(ctx.anthropicClient, description, absoluteTarget),
    GENERATE_MODEL_TIMEOUT_MS,
    'generate_blender_model',
  )

  return {
    content:
      `Modelo 3D gerado em ${targetPath}.\n` +
      `Script Python intermediário: ${result.scriptPath}`,
    isError: false,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n... (${text.length - max} caracteres truncados)`
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} excedeu timeout de ${ms / 1000}s.`))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
