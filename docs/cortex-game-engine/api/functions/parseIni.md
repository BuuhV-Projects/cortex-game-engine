[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseIni

# Function: parseIni()

> **parseIni**(`text`): [`IniValues`](../type-aliases/IniValues.md)

Defined in: src/i18n/GameConfig.ts:45

Parse de texto INI: seções `[nome]`, pares `chave=valor`, comentários com
`#` ou `;`. Chaves saem achatadas (`secao.chave`). Remove BOM se houver.

## Parameters

### text

`string`

## Returns

[`IniValues`](../type-aliases/IniValues.md)
