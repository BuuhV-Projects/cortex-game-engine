[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FrameCap

# Class: FrameCap

Defined in: [src/core/GameLoop.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L77)

Teto de quadros com ALVO acumulado (ADR-0257) — separado do laço para ser
testável sem `requestAnimationFrame`.

O orçamento avança por soma (`proximoAlvo += orcamento`), não por "tempo desde
o último frame". A diferença é o ponto inteiro deste código: com vsync a 75 Hz
e teto 60, a versão por delta pula todo frame de 13,3 ms e entrega 37,5 fps; a
versão por alvo entrega 4 de cada 5 vsyncs = 60 fps exatos.

Também estima o refresh do monitor pela mediana dos primeiros intervalos, e
avisa (por `debug`) quando o teto não é divisor dele — caso em que haverá
judder periódico, que é informação que o dev não tem como obter sozinho.

## Constructors

### Constructor

> **new FrameCap**(`maxFps?`): `FrameCap`

Defined in: [src/core/GameLoop.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L86)

#### Parameters

##### maxFps?

`number` = `0`

#### Returns

`FrameCap`

## Accessors

### maxFps

#### Get Signature

> **get** **maxFps**(): `number`

Defined in: [src/core/GameLoop.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L91)

Teto atual; `0` = sem teto.

##### Returns

`number`

#### Set Signature

> **set** **maxFps**(`fps`): `void`

Defined in: [src/core/GameLoop.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L95)

##### Parameters

###### fps

`number`

##### Returns

`void`

***

### refreshHz

#### Get Signature

> **get** **refreshHz**(): `number` \| `null`

Defined in: [src/core/GameLoop.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L104)

Refresh estimado do monitor (Hz), ou `null` enquanto não há amostras.

##### Returns

`number` \| `null`

## Methods

### admit()

> **admit**(`nowMs`): `boolean`

Defined in: [src/core/GameLoop.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L113)

Registra o frame candidato e diz se ele deve rodar. Chamado a CADA callback
de frame, inclusive os que serão pulados — a estimativa do refresh precisa
dos intervalos crus.

#### Parameters

##### nowMs

`number`

#### Returns

`boolean`
