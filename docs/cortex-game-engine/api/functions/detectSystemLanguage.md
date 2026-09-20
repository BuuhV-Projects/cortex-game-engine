[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / detectSystemLanguage

# Function: detectSystemLanguage()

> **detectSystemLanguage**(): `string`

Defined in: [src/i18n/I18n.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/i18n/I18n.ts#L73)

Idioma do SO do usuário: `__cortexLocale` (host nativo, via
`SDL_GetPreferredLocales`) ou `navigator.language` (browser/Studio).
Normalizado no formato dos arquivos (`pt-BR`, `en`); vazio se indisponível.

## Returns

`string`
