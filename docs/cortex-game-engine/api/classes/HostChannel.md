[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / HostChannel

# Class: HostChannel

Defined in: [src/core/HostChannel.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L48)

Canal de mensagens com a IDE. Uso típico:

## Example

```ts
const channel = new HostChannel()
if (channel.available) {
  channel.on('select', (msg) => selectById(msg['id'] as string))
  channel.send({ type: 'state', outliner })
}
```

## Constructors

### Constructor

> **new HostChannel**(): `HostChannel`

#### Returns

`HostChannel`

## Accessors

### available

#### Get Signature

> **get** **available**(): `boolean`

Defined in: [src/core/HostChannel.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L53)

O host expôs o canal? (`CORTEX_IDE_CHANNEL=1` no export nativo).

##### Returns

`boolean`

***

### embedded

#### Get Signature

> **get** **embedded**(): `boolean`

Defined in: [src/core/HostChannel.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L111)

O host está EMBUTIDO numa janela da IDE? (`CORTEX_PARENT_HWND`).

##### Returns

`boolean`

## Methods

### listen()

> **listen**(): `void`

Defined in: [src/core/HostChannel.ts:128](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L128)

Só pros testes: deixa o canal escutar sem nenhum handler registrado.

#### Returns

`void`

***

### on()

> **on**(`type`, `handler`): `void`

Defined in: [src/core/HostChannel.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L62)

Registra o handler de um tipo de mensagem. O primeiro `on` liga a escuta
no host (uma vez só) e já responde ao handshake: um `hello` da IDE recebe
`ack` automático, com a versão do protocolo.

#### Parameters

##### type

`string`

##### handler

(`msg`) => `void`

#### Returns

`void`

***

### send()

> **send**(`message`): `void`

Defined in: [src/core/HostChannel.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L68)

Envia uma mensagem. No-op sem canal.

#### Parameters

##### message

[`HostMessage`](../interfaces/HostMessage.md)

#### Returns

`void`

***

### setBounds()

> **setBounds**(`x`, `y`, `width`, `height`): `void`

Defined in: [src/core/HostChannel.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/HostChannel.ts#L119)

Move/redimensiona a janela do host — coordenadas relativas à janela PAI.
No-op fora do modo embutido.

#### Parameters

##### x

`number`

##### y

`number`

##### width

`number`

##### height

`number`

#### Returns

`void`
