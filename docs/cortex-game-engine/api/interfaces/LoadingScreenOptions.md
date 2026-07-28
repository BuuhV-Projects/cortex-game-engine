[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / LoadingScreenOptions

# Interface: LoadingScreenOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L21)

## Properties

### accent?

> `optional` **accent?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L25)

Cor da barra de progresso.

***

### background?

> `optional` **background?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L22)

***

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L36)

Liga/desliga a tela visível — só afeta [runWithLoadingScreen](../functions/runWithLoadingScreen.md) (default
`true`). Passe `false` no **editor** (`{ enabled: !game.editorActive }`): lá o
usuário itera direto e **editar um script recarrega a página** (HMR do Vite),
então um overlay a cada reload atrapalha e "reinicia a cena" visualmente. Com
`false` a `task` roda igual, só **sem a tela** (nem o loop de render) — como o
boot fazia antes da tela existir. Em **Play/export** deixe `true` (cobre o
carregamento pesado e o frame congelado antes do `game.start()`).

***

### message?

> `optional` **message?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L23)

***

### parent?

> `optional` **parent?**: `HTMLElement`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/LoadingScreen.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L26)
