# 0044 - Cena data-driven (JSON) com overlay do editor

**Data:** 2026-06-05
**Status:** aceito

## Contexto

O editor (F2, SPEC-0038/0041/0042) editava uma cena **construída em código**
(`main.ts` imperativo). Isso tornava as edições descartáveis (recriadas a cada
play) e — pior — **delete/add não tinham como ser corretos**: persistir um delete
sobre código vira "código cria, editor remove" (create-then-remove), desperdício
que não escala. O usuário (que delega o level design à IA) queria editor de
verdade: mover/remover/adicionar/arrastar e **salvar**, sem desperdício.

Decisão de formato discutida com o usuário: a cena vira **dado** (não código),
porque só assim o editor reescreve a fonte. Formato **JSON** (não TS): o editor
reescreve JSON trivialmente; reescrever código TS seria cirurgia de AST frágil.
**Multi-arquivo** (diffs limpos, edição cirúrgica), **importado** (o Vite bundla
no build → multi-arquivo em dev, bundle único no build, sem fetch). Lógica de
jogo continua em TS.

## Decisão

Sistema de cena data-driven em fases:

1. **`SceneDefinition` (zod) + `SceneBuilder`** (`src/scene/`): a cena é uma lista
   de nós (`model`/`primitive`/`light`/`water`) com `place` (grounding) ou
   `transform`; `buildScene` é o **único ponto de instanciação**. Cores aceitam
   hex string. `addSceneNode` instancia um nó ao vivo (add do editor).

2. **Overlay do editor = reuso do `SceneFileV1` (SPEC-0031).** O editor grava em
   `assets/scene-data.json`: `objects` = overrides de transform por id,
   `data.deleted` = ids removidos, `data.added` = nós adicionados. `buildScene`
   aplica: **pula deletados (nunca instancia → sem create-then-remove)**,
   sobrescreve transforms, instancia adicionados. Escrita via
   `autoDetectSceneFileWriter` (dev: `createSceneSavePlugin`; Tauri: fs).

3. **Editor write-back** (`attachEditor`, bundle dev): auto-save (sem tecla) das
   transforms do selecionado, `Delete` grava remoção, painel "Add"
   (`createEditorAddPanel`) lista `.glb` (via `createAssetListPlugin`, GET dev) e
   adiciona à cena + overlay. Conserta o bug "K perde tudo" e torna delete
   performático.

4. **IA autora JSON** (prompt + `engine-api.md`): a cena estática vira
   `scenes/*.json`; posições de conexão são **bakeadas a partir das dimensões do
   `inspect_assets`** (a IA não roda código na autoria); `place` resolve o
   grounding. A IA pode "achatar" a overlay na base depois.

5. **Template data-driven:** `scenes/world.json` + `props.json` importados,
   `main.ts` faz `buildScene([...], { overlay })`. Lógica fica em TS.

## Tauri / asar

- **Build do jogo:** JSON da cena é **importado** → o Vite bundla no `dist`. A
  overlay (`assets/scene-data.json`) e a textura são copiadas pelo `copyAssets`
  pro `dist/assets`. `devUrl` do Tauri alinhado em 5174.
- **IDE (Electron asar):** loader/schema vão no bundle vendorizado; o plugin Vite
  (`sceneSavePlugin.js`, agora com `createAssetListPlugin`) é copiado de
  `dist/src/vite` via `resourceBase()` (extraResources, fora do asar — `.d.ts`
  some do asar, ADR-0034). Vendoring de tipos atualizado (`SceneDefinition`,
  `SceneBuilder`).

## Consequências

- Delete/add limpos e editor que persiste — o editor vira ferramenta de autoria.
- A IA muda de "código imperativo" pra "autora de JSON" (mudança de comportamento
  grande; mitigada no prompt/engine-api). Conexões dependem de bakear dimensões
  do `inspect_assets`.
- Água adicionada ao vivo não anima caustics até recarregar (caso raro).
- A overlay (último estado do editor) **vai pro build** (copyAssets) — desejável
  (suas edições shippam); "achatar" na base é opcional.
- **Não validável só com typecheck:** o build Tauri de ponta a ponta (incluir os
  JSON no `.exe`, write-back via plugin em dev, fs no Tauri) exige criar projeto +
  rodar `vite build`/`tauri build` na IDE. Engine typecheck, 2 bundles, testes
  (incl. SceneBuilder) e `docs:engine` passam; o resto é verificação manual.
- Coexiste com o `SceneFile`/`SceneLoader.applyToRoot` (SPEC-0031, override por
  nome em cena de código) — agora o mesmo formato serve de overlay data-driven.
- Relaciona-se com SPEC-0031 (SceneFile/IO), 0037 (inspect_assets), 0041/0042
  (editor) e 0039/0040 (helpers de cena que o loader reusa).
