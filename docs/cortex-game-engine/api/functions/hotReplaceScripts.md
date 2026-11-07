[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / hotReplaceScripts

# Function: hotReplaceScripts()

> **hotReplaceScripts**(`path`, `mod`): `boolean`

Defined in: [src/scripts/ScriptHotReload.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptHotReload.ts#L35)

**Hot reload de um módulo de script** (SPEC-0697, ADR-0698) — chamado pelo `accept`
que o `createHotReloadPlugin` injeta em `scripts/*.ts`.

Registra as classes novas (instâncias criadas depois usam o construtor novo) e troca
a classe das instâncias **vivas** sem recriá-las: `setPrototypeOf` para a classe nova,
cópia das propriedades próprias que a instância não tinha (de um `new NovaClasse()`
descartável), campos novos do schema com o valor do slot, `started` preservado e
`onHotReload()` no fim. Os scripts que este caminho registrou antes e sumiram do
módulo são derrubados (`onDestroy`) e saem do registro. Fora do Play só o registro
muda — o próximo Play instancia a classe nova.

Um módulo sem exports devolve `true` e só derruba o que sumiu: não há nada que
invalide o estado, então o reload completo não ganharia nada.

## Parameters

### path

`string`

Caminho do módulo relativo à raiz (`scripts/Girar.ts`).

### mod

`unknown`

O namespace novo do módulo.

## Returns

`boolean`

`false`, sem mudar nada, se o módulo exporta algum valor que não é
  `ScriptBehavior` ou se algum script dele é base de um script de outro arquivo — o
  plugin então faz o reload completo.
