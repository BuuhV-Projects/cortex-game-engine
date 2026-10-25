[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / registerNativeMaterial

# Function: registerNativeMaterial()

> **registerNativeMaterial**(`name`, `def`): `void`

Defined in: [src/render/native/GameMaterials.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/GameMaterials.ts#L28)

Registers the WGSL of a game material. The `def` is a regular native model: its `wgsl()` has a
`vs(vin : VIn)` that builds the position from `nativeLocal(vin)` (instance and skin applied) and
`view.time` (the shader clock, see `ShaderClock.ts`), and an `fs`. Its own vertex attributes go in
`attributeTypes` (an `InstancedBufferAttribute` of the geometry is per instance).

## Parameters

### name

`string`

The value of `material.userData.nativeMaterial`.

### def

[`NativeModelDef`](../interfaces/NativeModelDef.md)

The model; its `name` is ignored (the registry names it `wgsl:<name>`).

## Returns

`void`

## Example

```ts
registerNativeMaterial('sea', seaModel);
seaMaterial.userData.nativeMaterial = 'sea';
```
