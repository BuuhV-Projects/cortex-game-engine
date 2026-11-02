[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AutopilotStep

# Interface: AutopilotStep

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/input/InputAutopilot.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L50)

One step of a profile: hold these buttons/axes for `s` seconds.

## Properties

### axes?

> `optional` **axes?**: `Record`\<`string`, `number`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/input/InputAutopilot.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L53)

***

### buttons?

> `optional` **buttons?**: `string`[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/input/InputAutopilot.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L52)

***

### driver?

> `optional` **driver?**: `true`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/input/InputAutopilot.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L58)

Closed loop (SPEC-0595): every frame the registered [AutopilotDriver](../type-aliases/AutopilotDriver.md) sets `leftX`
(steer), `RT` (throttle) and `LT` (brake). Without a driver the pad stays neutral.

***

### s

> **s**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/input/InputAutopilot.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputAutopilot.ts#L51)
