# SPEC-0094 - Overlay de cena por fase (`Game.sceneDataUrl`)

**Data:** 2026-07-04
**Status:** aceito

## Contexto

O overlay do editor (`SceneFileV1`) era um caminho FIXO: `attachEditor` semeava
e salvava sempre em `assets/scene-data.json`, e o `createSceneSavePlugin`
gravava sempre no `target` da config. Funcionava porque todo jogo tinha uma
cena só.

O primeiro jogo multi-fase (teste4, menu de seleção de fases) expôs o furo:

- O overlay guarda `added`/`deleted`/`scripts` etc. **por nome de objeto** —
  compartilhar um arquivo entre fases faria objetos adicionados numa fase
  "vazarem" pra outra (o `buildScene` aplica `added` incondicionalmente).
- Pior: o auto-save serializa o overlay **inteiro** em memória; editar a fase 2
  sobrescreveria o arquivo com uma base que não contém as edições da fase 1 —
  perda de dados do usuário.

## Decisão

O caminho do overlay passa a ser **estado do `Game`**, mutável em runtime:

- **`Game.sceneDataUrl`** (get/set, default `assets/scene-data.json`) +
  **`Game.onSceneDataUrlChange(cb)`**. O jogo define logo depois de escolher a
  fase (antes do `buildScene`) e usa o MESMO caminho no
  `SceneLoader.loadSceneFile(...)`.
- **`attachEditor`** semeia o overlay de `game.sceneDataUrl` e escuta a
  mudança: recarrega a base do caminho novo (arquivo ausente = base vazia) e
  recria o writer. Edições feitas ANTES da troca não são migradas (janela
  irrelevante na prática: a troca acontece no boot, com a cena vazia).
- **`HttpSceneFileWriter`** ganha `path` opcional → POST com
  `?path=<encodado>`; **`autoDetectSceneFileWriter({ path })`** propaga (no
  Tauri, `tauriPath` tem precedência).
- **`createSceneSavePlugin`**: o endpoint de save aceita `?path=`, validado
  por **`sanitizeScenePath`** (exportado, testado): relativo, sem `..`/
  absoluto/drive, terminando `.json`; inválido → 400; ausente → `target`.

## Consequências

- Jogos multi-fase dão um arquivo por fase (`assets/scene-data-<fase>.json`)
  e o editor funciona por fase sem vazamento nem sobrescrita.
- Jogos de cena única não mudam nada (defaults idênticos ao comportamento
  anterior).
- O endpoint de save agora escreve em caminhos variáveis DENTRO da raiz do
  projeto — a superfície é maior, por isso a sanitização é função pura com
  teste (`tests/io/sceneDataPerPhase.test.ts`).
- Limitação conhecida: trocar `sceneDataUrl` NÃO reconstrói a cena — é
  responsabilidade do jogo (o fluxo esperado é escolher a fase antes do
  `buildScene`, ou recarregar a página ao trocar).
- **Correção pós-incidente (mesmo dia):** o seed do boot parte do caminho
  default e o jogo troca o `sceneDataUrl` logo depois — se o fetch antigo
  resolvesse por último, sobrescrevia a base em memória com o overlay de
  OUTRA fase e o auto-save gravava isso no arquivo da fase atual (perdeu as
  edições da fase 2 do teste4). Proteções: (1) cada seed confere se o caminho
  ainda é o vigente antes de aplicar; (2) `persist` encadeia atrás do
  `seedPromise` — nunca salva num arquivo que ainda não foi lido.
