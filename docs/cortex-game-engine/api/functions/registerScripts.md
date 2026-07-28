[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / registerScripts

# Function: registerScripts()

> **registerScripts**(`modules`): `string`[]

Defined in: [.claude/worktrees/feat-input-rebind/src/scripts/ScriptRegistry.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scripts/ScriptRegistry.ts#L38)

Registra em **lote** os scripts de um projeto — o par do
`import.meta.glob` do vite no `main.ts` do template:

```ts
registerScripts(import.meta.glob('./scripts/*.ts', { eager: true }))
```

Varre os exports de cada módulo e registra as subclasses de
[ScriptBehavior](../classes/ScriptBehavior.md). O nome (que o Inspector lista e a cena persiste) vem,
em ordem: `static scriptName` (override — ex.: nome amigável em PT) → **nome
do arquivo** (estilo Unity; sobrevive à minificação do build) → `class.name`
(só quando o arquivo tem mais de um script — aí ligue `keepNames` no build
ou declare `scriptName`, senão o nome some na minificação). ⚠️ Renomear o
arquivo (ou o `scriptName`) muda o nome persistido — cenas salvas que o
referenciam precisam acompanhar. Retorna os nomes registrados (debug/teste).

## Parameters

### modules

`Record`\<`string`, `unknown`\>

## Returns

`string`[]
