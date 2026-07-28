[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / clearSceneAssetCaches

# Function: clearSceneAssetCaches()

> **clearSceneAssetCaches**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L80)

**Despeja todos os caches de asset** do módulo (SPEC-0152): dispõe geometrias
(incluindo a árvore BVH do raycast), materiais, texturas e libera o PCM de
áudio no host nativo (`free`), então esvazia os Maps. Também aciona o hook do
host `__cortexClearObjectUrls` (ADR-0153) — os `blob:` URLs criados no parse
de GLB deixam de reter os bytes.

Os caches são por URL e **propositalmente** não expiram sozinhos (trocar de
fase reusa peças de kit sem recarregar). Chame isto nos pontos de troca
"larga" — tipicamente via `game.reset({ releaseAssets: true })` ao voltar pro
menu/trocar de mundo. Depois disto, cada asset volta a custar carga completa.

## Returns

`void`
