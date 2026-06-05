# 0038 - Editor embutido ligado no template starter + IA o reusa

**Data:** 2026-06-05
**Status:** aceito

## Contexto

O engine tem um modo editor embutido (ADR-0030): `EditorState`,
`EditorCameraSystem` (câmera de voo livre), `ObjectEditSystem` (gizmo estilo
Blender/Unity) e `EditorHud`. Mas ele **não vinha ligado** no template de projeto
novo (`templates/new-project/main.ts`, que era three puro, sem `World`/ECS), e
**não tinha receita** no guia curado `engine-api.md` (só uma linha listando os
nomes das classes).

Consequência prática: ao pedir ao Chat IA pra montar/editar uma fase, a IA não
tinha como descobrir nem ligar o editor — então reimplementava do zero a própria
câmera de edição e navegação de cena, duplicando o que o engine já oferece e
divergindo do padrão.

## Decisão

Atacar nas três frentes que faziam o editor ser "invisível":

1. **Template starter já liga o editor.** `templates/new-project/main.ts` passou
   a criar um `World`, anexar um `InputManager` e registrar `EditorCameraSystem`
   + `ObjectEditSystem` + `Object3DSyncSystem`, com `createEditorState()` e
   `createEditorHud()`. O cubo da cena starter virou uma entidade ECS com
   `TransformComponent` + `Object3DComponent` + `EditableTargetComponent` (o
   "avatar" que o editor teleporta — `EditorCameraSystem` exige uma entidade
   alvo, senão nem o toggle funciona). O loop chama `world.tick(dt)` e renderiza
   pela câmera de voo livre quando `editorState.active`. Toggle na tecla **F2**.
   A cena starter (céu + névoa + chão + cubo) foi preservada.

2. **Receita completa no `engine-api.md`.** A seção "Modo editor embutido" ganhou
   um exemplo de wiring de ponta a ponta (requisitos, controles, snippet) +
   instrução explícita de NÃO reimplementar câmera/seleção/gizmo. Como esse
   arquivo é injetado no system prompt do Chat IA, a IA passa a saber a receita.

3. **Regra no `AGENT_SYSTEM_PROMPT`.** Na seção de level design: ao montar/editar
   fase ou navegar a cena em modo de edição, ESTENDER o editor embutido; nunca
   escrever câmera/seleção/gizmo do zero; se um projeto antigo não liga o editor,
   ligá-lo seguindo a receita em vez de criar um sistema paralelo.

## Consequências

- **Todo projeto novo** nasce com modo de edição (F2) — alinha o starter ao
  padrão ECS (ADR-0022), que antes ele não exercitava.
- O starter deixou de ser three puro: agora introduz `World`/entidade/sistemas
  já no `main.ts`. É mais código pra um iniciante ler, mas serve de exemplo vivo
  do padrão ECS + do editor (o comentário explica os controles).
- O `EditorCameraSystem` exige uma entidade `EditableTargetComponent`; por isso
  o cubo virou avatar. Jogos sem avatar precisam criar um alvo (mesmo invisível)
  pra a câmera livre/toggle funcionarem — documentado na receita.
- `onSaveEdits` no template só notifica (toast + console); persistir de fato é
  responsabilidade do jogo (ligar ao `SceneFileWriter`/IO, ADR-0031).
- Projetos **já criados** antes desta mudança continuam sem o editor no `main.ts`;
  a regra no prompt orienta a IA a ligá-lo sob demanda nesses casos.
- Não há verificação automatizada do template (depende de criar projeto + rodar
  no IDE WebGPU); validação é manual.
