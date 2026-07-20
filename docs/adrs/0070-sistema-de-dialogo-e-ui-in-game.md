# 0070 - Sistema de Diálogo + UI in-game

**Data:** 2026-06-21
**Status:** aceito — implementado (`src/dialogue/`, `src/narrative/StoryState.ts`; testes em `tests/dialogue/`, `tests/narrative/`)

## Contexto

O engine não tem **UI de runtime** (só o chrome do editor F2, que não vai pro build —
ADR-0042) nem **sistema de diálogo**. Jogos narrativos (o caso concreto é o DDD-61, um
thriller de investigação) vivem de conversa: caixa de fala, escolhas, falas que mudam o
estado da história. Sem isso, a maior fatia do jogo não existe.

**Lição do ADR-0055 (Logic Bricks, revertido):** o engine só adota "comportamento como
dado" se isso **resolver algo que código puro não resolve** e **sem conflito de
autoridade** sobre o transform. Diálogo **passa nesse teste por outro motivo:** uma
árvore de diálogo é **conteúdo autoral** (como um clipe de animação, SPEC-0054), não um
grafo de lógica competindo com os Systems. O `DialogueSystem` é código (um System); o
**dado** é só o texto/escolhas — exatamente o tipo de coisa que se quer editável fora do
código e que a IA (Chat) sabe gerar.

**Precedente de UI:** `createDomLoadingScreen` já mostra o padrão de UI de runtime do
engine — **overlay DOM** sobre o canvas, production-safe. A UI de diálogo segue o mesmo
caminho (DOM), não quads no Three.

## Decisão

### 1. Camada de UI de runtime (fundação, via DOM overlay)
Introduzir uma camada mínima de UI de runtime em **DOM** (espelha
`createDomLoadingScreen`): um módulo que cria/gerencia elementos sobre o canvas
(caixa de diálogo; prompt/caderno do jogo reusam a mesma camada). Vai pro bundle de runtime (`index.js`),
diferente do editor. **Não** usa Three/quads (texto/acessibilidade/layout saem de
graça no DOM).

### 2. Diálogo como DADO (grafo em JSON, schema Zod)
```ts
interface DialogueNode {
  id: string;
  speaker?: string;
  text: string;
  choices?: DialogueChoice[];   // ausente = fala simples, segue `next`
  next?: string;                // próximo nó (fala sem escolha)
}
interface DialogueChoice {
  text: string;
  next?: string;                // null/ausente = encerra
  requires?: string[];          // flags necessárias p/ a opção aparecer
  set?: Record<string, boolean | number | string>; // grava flags de história
  give?: string;                // concede pista (id) — callback p/ o jogo tratar
}
interface DialogueGraph { id: string; start: string; nodes: DialogueNode[]; }
```
Validado por Zod, igual ao `SceneDefinition`. Pode morar em asset `.json` ou ser gerado.

### 3. Runtime: `DialogueRunner` (lógica pura) + UI fina
- **`DialogueRunner`** — percorre o grafo: nó atual → entrega à UI → recebe escolha →
  aplica `set`/`give` → avança. **Lógica pura, sem DOM** (testável em Vitest isolado).
- **UI de diálogo** — assina o runner e renderiza (fala, nome, botões de escolha).
- **`startDialogue(graph, opts?)`** — API pública. Qualquer disparo chama (interação do
  interação do jogo, script de gameplay, cutscene futura). **Diálogo é independente.**
- Enquanto um diálogo está ativo, o gameplay **pausa** (padrão `pauseWhen`/flag, como o
  editor e o multi-cena do SPEC-0069 já fazem). Input vai pra UI.

### 4. Estado de história (`StoryState`)
Um store simples de **flags** (`get/set`, serializável) que `set`/`requires` leem e
escrevem. É a base do **save narrativo** (o jogo combina com seu estado de investigação).

### 5. Autoridade (sem repetir o erro do 0055)
O diálogo **só** lê/escreve `StoryState` e controla a UI. **Nunca** escreve
`Object3D`/transform/física. Zero conflito de dono. A animação de "boca/câmera de
conversa", se houver, é disparada por código de gameplay, não pelo runner.

## Consequências

- **Primeira UI de runtime do engine** (DOM overlay) — fundação reusável pelo jogo
  (prompt de interação, caderno) e por menus/HUD futuros.
- **Diálogo data-driven e testável**: o `DialogueRunner` é lógica pura → Vitest cobre
  percursos, `requires`, `set`, `give` (ADR-0008 do DDD-61 / testes do engine).
- **`StoryState`** novo — começo do save narrativo.
- **Fora de escopo agora:** editor visual de diálogo na IDE (edita-se o JSON / Chat IA);
  voz/áudio de fala; localização. Abrir ADR próprio se/quando.
- **API pública nova** (`startDialogue`, tipos, `StoryState`) → `yarn docs:engine`,
  atualizar `engine-api.md` e `architecture.md`, e **re-vendorizar** (ADR-0009) nos
  projetos. (Só na implementação — este ADR é o plano.)
