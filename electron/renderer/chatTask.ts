/**
 * Modos do Chat IA por TAREFA (ADR-0265 / SPEC-0266): o usuário escolhe
 * "Modelagem" ou "Codificar" e nunca vê nome de modelo. Aqui fica a regra de
 * qual modelo cada tarefa usa — pura, para ser testada sem a UI.
 */

export type ChatTask = 'modeling' | 'coding'

/** O que vai no IPC do chat (o `AgentModel` do main). */
export type ChatModel = 'astra' | 'sonnet' | 'opus'

/** Chave da tarefa salva por projeto — a mesma que guardava o modelo antes. */
export function taskStorageKey(projectDir: string | null): string {
  return `chat_model:${projectDir ?? '<none>'}`
}

/** Chave do ajuste "Codificar com o modelo mais forte", por projeto. */
export function strongCodingStorageKey(projectDir: string | null): string {
  return `chat_codificar_forte:${projectDir ?? '<none>'}`
}

/**
 * Lê a tarefa salva. Aceita os valores de antes desta spec: `astra` era a
 * cabeça de cena (vira Modelagem); `sonnet`/`opus`/`haiku` eram o Claude
 * (viram Codificar). Sem valor, Codificar.
 */
export function taskFromSaved(saved: string | null): ChatTask {
  return saved === 'modeling' || saved === 'astra' ? 'modeling' : 'coding'
}

/**
 * Modelo de cada tarefa. Codificar usa Sonnet (ADR-0130: a cota do Opus no
 * plano de assinatura é bem menor) e Opus só com o ajuste ligado.
 */
export function modelForTask(task: ChatTask, strongCoding: boolean): ChatModel {
  if (task === 'modeling') return 'astra'
  return strongCoding ? 'opus' : 'sonnet'
}

/** A outra tarefa — o botão alterna entre as duas. */
export function nextTask(task: ChatTask): ChatTask {
  return task === 'modeling' ? 'coding' : 'modeling'
}
