[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / shaderTime

# Variable: shaderTime

> `const` **shaderTime**: `UniformNode`\<`"float"`, `number`\>

Defined in: [src/render/native/ShaderClock.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/ShaderClock.ts#L21)

TSL uniform with the shader clock, for the three side of a game WGSL material.

## Example

```ts
material.positionNode = positionLocal.add(vec3(0, sin(positionLocal.x.add(shaderTime)), 0));
```
