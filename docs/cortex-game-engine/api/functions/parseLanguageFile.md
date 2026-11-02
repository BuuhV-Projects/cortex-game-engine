[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseLanguageFile

# Function: parseLanguageFile()

> **parseLanguageFile**(`text`): `Record`\<`string`, `string`\>

Defined in: [src/i18n/I18n.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/I18n.ts#L47)

Faz o parse de um arquivo de idioma (`CHAVE="VALOR"` por linha) num
dicionário. Ignora linhas vazias e comentários (`#` ou `;`). Tira as aspas
externas do valor (tolerando valor sem aspas), converte `\n` literal em
quebra de linha e `\"` em aspas. Remove BOM se houver.

## Parameters

### text

`string`

## Returns

`Record`\<`string`, `string`\>
