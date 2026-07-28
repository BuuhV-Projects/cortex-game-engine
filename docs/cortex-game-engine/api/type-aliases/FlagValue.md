[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FlagValue

# Type Alias: FlagValue

> **FlagValue** = `boolean` \| `number` \| `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/narrative/StoryState.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/narrative/StoryState.ts#L16)

StoryState — store de **flags de história** (ADR-0070).

É a memória narrativa do jogo: o que o jogador já fez/descobriu/escolheu.
Lógica pura e **serializável** — base do save narrativo (o jogo pode combiná-la
com seu próprio estado de investigação). Sem DOM, sem Three, sem ECS → testável.

Uma flag "ligada" é qualquer valor **truthy** (`true`, número ≠ 0, string não
vazia). `has(key)` reflete isso; `requires` de diálogo usa `has`.

## Example

```ts
const story = new StoryState();
story.set('falou_com_marlene', true);
story.has('falou_com_marlene'); // true
```
