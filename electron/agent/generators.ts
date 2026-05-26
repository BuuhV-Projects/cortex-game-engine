import type Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'child_process'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ECS_SYSTEM_PROMPT, BPY_SYSTEM_PROMPT } from './prompts.js'

/**
 * Roda o `ScriptGenerator` equivalente (ADR-0003) sem importar a classe
 * original — evita o side-effect de `auth.ts` no momento de import.
 *
 * Devolve `{ code, explanation }` extraídos do bloco ```js da resposta.
 */
export async function generateEcsScript(
  client: Anthropic,
  description: string,
): Promise<{ code: string; explanation: string }> {
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: ECS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: description }],
  })

  const fullText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const codeMatch = /```js\s*([\s\S]*?)```/.exec(fullText)
  if (codeMatch === null || !codeMatch[1]) {
    throw new Error(
      'A IA não retornou um bloco de código JavaScript válido (```js ... ```). ' +
        'Tente reformular a descrição.',
    )
  }

  const code = codeMatch[1].trim()

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function(code)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `O código gerado contém erro de sintaxe JavaScript: ${message}\n\nCódigo gerado:\n${code}`,
    )
  }

  const codeBlockIndex = fullText.indexOf('```js')
  const explanation = (codeBlockIndex > 0 ? fullText.slice(0, codeBlockIndex) : '').trim()

  return { code, explanation }
}

/**
 * Roda o `BlenderModelGenerator` equivalente (ADR-0004): gera script Python
 * via Claude, salva em arquivo temporário, executa `blender --background`.
 *
 * Retorna o caminho do `.glb` gerado (já é o `absoluteGlbPath` recebido).
 */
export async function generateBlenderModel(
  client: Anthropic,
  description: string,
  absoluteGlbPath: string,
): Promise<{ glbPath: string; scriptPath: string }> {
  const glbPath = absoluteGlbPath.endsWith('.glb') ? absoluteGlbPath : `${absoluteGlbPath}.glb`

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: BPY_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: description }],
  })

  const fullText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const codeMatch = /```python\s*([\s\S]*?)```/.exec(fullText)
  if (!codeMatch || !codeMatch[1]) {
    throw new Error(
      'A IA não retornou um bloco de código Python válido (```python ... ```). ' +
        'Tente reformular a descrição.',
    )
  }

  const generatedScript = codeMatch[1].trim()
  const scriptContent = `OUTPUT_PATH = ${JSON.stringify(glbPath)}\n\n${generatedScript}`

  const scriptPath = join(tmpdir(), `blender_gen_${Date.now()}.py`)
  await writeFile(scriptPath, scriptContent, 'utf-8')

  const blenderBin = process.env['BLENDER_PATH'] ?? 'blender'
  await runBlender(blenderBin, scriptPath)

  return { glbPath, scriptPath }
}

function runBlender(blenderBin: string, scriptPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
            `Blender não encontrado em "${blenderBin}". ` +
              'Instale o Blender e certifique-se de que está disponível no PATH, ' +
              'ou defina a variável de ambiente BLENDER_PATH com o caminho completo.',
          ),
        )
      } else {
        reject(new Error(`Falha ao iniciar o Blender: ${err.message}`))
      }
    })

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve()
      } else {
        const detail = stderr.trim() ? `\n\nSaída de erro:\n${stderr.trim()}` : ''
        reject(new Error(`Blender encerrou com código de saída ${String(code)}.${detail}`))
      }
    })
  })
}
