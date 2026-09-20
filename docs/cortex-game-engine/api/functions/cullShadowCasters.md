[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / cullShadowCasters

# Function: cullShadowCasters()

> **cullShadowCasters**(`root`, `cameraPosition`, `minRatio`): [`ShadowCullStats`](../interfaces/ShadowCullStats.md)

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/ShadowCasterCulling.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ShadowCasterCulling.ts#L66)

Percorre `root` e liga/desliga `castShadow` por tamanho angular relativo a
`cameraPosition`. Chamado periodicamente (não todo frame) pelo CSM do
[setupOutdoorLighting](setupOutdoorLighting.md).

Ficam **de fora** (mantêm o que o autor definiu): malha skinada — o bounding
sphere da geometria mente com o rig (personagem perderia sombra de perto) — e
`InstancedMesh`, cujo bounding sphere descreve uma instância e não o conjunto.

## Parameters

### root

`Object3D`

Raiz da cena (matrizes de mundo já atualizadas).

### cameraPosition

`Vector3`

Posição da câmera que está renderizando o frame.

### minRatio

`number`

Limiar `raio/distância`; `0` restaura a autoria e sai.

## Returns

[`ShadowCullStats`](../interfaces/ShadowCullStats.md)
