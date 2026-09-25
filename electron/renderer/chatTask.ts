/**
 * Modos do Chat IA por TAREFA (ADR-0265 / SPEC-0266, Orquestrador no
 * ADR-0269 / SPEC-0270): o usuário escolhe "Orquestrador", "Modelagem" ou
 * "Codificar" e nunca vê nome de modelo. Aqui fica a regra de qual modelo cada
 * tarefa usa — pura, para ser testada sem a UI.
 */

export type ChatTask = 'orchestrator' | 'modeling' | 'coding'

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
 * Lê a tarefa salva. Sem valor, Orquestrador (o padrão, ADR-0269). Aceita os
 * valores de antes: `astra` era a cabeça de cena (vira Modelagem);
 * `sonnet`/`opus`/`haiku` eram o Claude (viram Codificar).
 */
export function taskFromSaved(saved: string | null): ChatTask {
  if (saved === null || saved === 'orchestrator') return 'orchestrator'
  return saved === 'modeling' || saved === 'astra' ? 'modeling' : 'coding'
}

/**
 * Modelo de cada tarefa. Codificar roda sempre o Opus (ADR-0276: depuração de
 * várias etapas é onde o modelo forte compensa a cota). O Orquestrador segue
 * em Sonnet (ADR-0130) e só vai ao Opus com o ajuste ligado.
 */
export function modelForTask(task: ChatTask, strongCoding: boolean): ChatModel {
  if (task === 'modeling') return 'astra'
  if (task === 'coding') return 'opus'
  return strongCoding ? 'opus' : 'sonnet'
}

/** O botão cicla Orquestrador → Modelagem → Codificar → Orquestrador. */
export function nextTask(task: ChatTask): ChatTask {
  if (task === 'orchestrator') return 'modeling'
  return task === 'modeling' ? 'coding' : 'orchestrator'
}
