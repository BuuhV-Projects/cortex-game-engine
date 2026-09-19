[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / HostChannel

# Class: HostChannel

Defined in: src/core/HostChannel.ts:46

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

Defined in: src/core/HostChannel.ts:51

O host expôs o canal? (`CORTEX_IDE_CHANNEL=1` no export nativo).

##### Returns

`boolean`

## Methods

### listen()

> **listen**(): `void`

Defined in: src/core/HostChannel.ts:100

Só pros testes: deixa o canal escutar sem nenhum handler registrado.

#### Returns

`void`

***

### on()

> **on**(`type`, `handler`): `void`

Defined in: src/core/HostChannel.ts:60

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

Defined in: src/core/HostChannel.ts:66

Envia uma mensagem. No-op sem canal.

#### Parameters

##### message

[`HostMessage`](../interfaces/HostMessage.md)

#### Returns

`void`
