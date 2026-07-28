[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MoveAxisProvider

# Type Alias: MoveAxisProvider

> **MoveAxisProvider** = () => `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/TopDownMovementSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L12)

Provedor do **eixo de movimento** top-down (−1..1 em cada componente), implementado
pelo **jogo** lendo o controle dele (teclado/joystick). O engine não sabe de onde
vem (ADR-0066): `x` = esquerda/direita, `y` = cima(−1)/baixo(+1) na tela.

## Returns

`object`

### x

> **x**: `number`

### y

> **y**: `number`
