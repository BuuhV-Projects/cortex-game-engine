import { resolve, sep, isAbsolute } from 'path'

/**
 * Sandbox de paths do agente (ADR-0017). Garante que qualquer caminho passado
 * por uma tool da IA esteja contido dentro do projeto aberto. Rejeita bytes
 * nulos, paths absolutos vindos do LLM (a IA sempre fala em paths relativos)
 * e qualquer tentativa de escapar via `..`.
 */

export class SandboxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxError'
  }
}

/**
 * Resolve `inputPath` como relativo a `projectRoot` e valida que o resultado
 * fica dentro de `projectRoot`. Retorna o caminho absoluto seguro.
 */
export function resolveInsideProject(projectRoot: string | null, inputPath: unknown): string {
  if (!projectRoot) {
    throw new SandboxError('Nenhum projeto aberto. Abra um projeto antes de usar esta ferramenta.')
  }
  if (typeof inputPath !== 'string') {
    throw new SandboxError('Path deve ser uma string.')
  }
  if (inputPath.includes('\0')) {
    throw new SandboxError('Path contém byte nulo.')
  }
  if (isAbsolute(inputPath)) {
    throw new SandboxError(
      'Use sempre paths relativos ao projeto (ex: "scripts/jump.js"), nunca absolutos.',
    )
  }

  const normalizedRoot = resolve(projectRoot)
  const absoluteTarget = resolve(normalizedRoot, inputPath)

  const isInside =
    absoluteTarget === normalizedRoot ||
    absoluteTarget.startsWith(normalizedRoot + sep)

  if (!isInside) {
    throw new SandboxError(
      `Path "${inputPath}" escapa do projeto. Operações fora da raiz do projeto não são permitidas.`,
    )
  }

  return absoluteTarget
}
