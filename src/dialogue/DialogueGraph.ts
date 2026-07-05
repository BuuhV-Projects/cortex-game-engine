// zod/v3 — compatível com Hermes/CortexNative (ver SceneFile.ts).
import { z } from 'zod/v3';
import type { FlagValue } from '../narrative/StoryState.js';

/**
 * **Diálogo como DADO** (ADR-0070). Um grafo de conversa: nós com fala +
 * escolhas, que o {@link DialogueRunner} percorre. É **conteúdo autoral** (como
 * um clipe de animação, ADR-0054), não comportamento — por isso vive em JSON,
 * editável fora do código e gerável pelo Chat IA.
 *
 * Schema validado por Zod, no mesmo espírito do `SceneDefinition`.
 *
 * @example
 * const graph = parseDialogueGraph({
 *   id: 'marlene-001', start: 'intro',
 *   nodes: [
 *     { id: 'intro', speaker: 'Marlene', text: 'Você veio por causa do Gabriel?',
 *       choices: [
 *         { text: 'Vim. Me conta o que houve.', next: 'conta', set: { ouviu_marlene: true } },
 *         { text: 'Talvez. Quem é você?', next: 'intro' },
 *       ] },
 *     { id: 'conta', speaker: 'Marlene', text: 'Ele foi pra feira fazer perguntas...',
 *       give: 'pista_feira', next: null },
 *   ],
 * });
 */

const flagValue = z.union([z.boolean(), z.number(), z.string()]);

/** Uma opção de resposta do jogador num nó de diálogo. */
const dialogueChoiceSchema = z.object({
  /** Texto do botão de escolha. */
  text: z.string(),
  /** Próximo nó (id). `null`/ausente encerra o diálogo. */
  next: z.string().nullish(),
  /** Flags necessárias (todas truthy) pra a opção **aparecer**. */
  requires: z.array(z.string()).optional(),
  /** Flags de história a gravar ao escolher (ADR-0070 → StoryState). */
  set: z.record(z.string(), flagValue).optional(),
  /** Pista a conceder ao escolher (id) — entregue via callback p/ o jogo tratar. */
  give: z.string().optional(),
});

/** Um nó do grafo: uma fala, com escolhas (ramo) ou `next` (linha simples). */
const dialogueNodeSchema = z.object({
  /** Identificador único do nó dentro do grafo. */
  id: z.string(),
  /** Nome de quem fala (opcional). */
  speaker: z.string().optional(),
  /** O texto da fala. */
  text: z.string(),
  /** Escolhas. Ausente/vazio = linha simples (segue `next`). */
  choices: z.array(dialogueChoiceSchema).optional(),
  /** Próximo nó pra linha simples (sem escolhas). `null`/ausente encerra. */
  next: z.string().nullish(),
  /** Flags gravadas ao **entrar** no nó (aplicadas uma vez). */
  set: z.record(z.string(), flagValue).optional(),
  /** Pista concedida ao **entrar** no nó (uma vez). */
  give: z.string().optional(),
});

/** O grafo completo de um diálogo. */
const dialogueGraphSchema = z.object({
  /** Id do diálogo. */
  id: z.string(),
  /** Nó inicial (id). */
  start: z.string(),
  /** Nós do grafo. */
  nodes: z.array(dialogueNodeSchema).min(1),
});

export type DialogueChoice = z.infer<typeof dialogueChoiceSchema> & {
  set?: Record<string, FlagValue>;
};
export type DialogueNode = z.infer<typeof dialogueNodeSchema> & {
  set?: Record<string, FlagValue>;
};
export type DialogueGraph = z.infer<typeof dialogueGraphSchema>;

/**
 * Valida e normaliza um objeto cru (ex.: JSON importado) num {@link DialogueGraph}.
 * Lança `ZodError` com mensagem clara se o dado for inválido. Também checa
 * **integridade referencial** (start e todos os `next` apontam pra nós existentes).
 */
export function parseDialogueGraph(data: unknown): DialogueGraph {
  const graph = dialogueGraphSchema.parse(data);

  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) {
    throw new Error(`DialogueGraph "${graph.id}": ids de nó duplicados.`);
  }
  if (!ids.has(graph.start)) {
    throw new Error(`DialogueGraph "${graph.id}": start "${graph.start}" não existe.`);
  }
  const checkRef = (next: string | null | undefined, from: string): void => {
    if (next != null && !ids.has(next)) {
      throw new Error(`DialogueGraph "${graph.id}": nó "${from}" aponta p/ "${next}" inexistente.`);
    }
  };
  for (const node of graph.nodes) {
    checkRef(node.next, node.id);
    for (const c of node.choices ?? []) checkRef(c.next, node.id);
  }
  return graph;
}

/** Indexa os nós por id pra lookup O(1). */
export function indexDialogueNodes(graph: DialogueGraph): Map<string, DialogueNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}
