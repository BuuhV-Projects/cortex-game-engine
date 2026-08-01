# SPEC-0179 - Rebrand: "Cortex Game Engine Studio" vira "TS Cortex Studio"

**Data:** 2026-08-01
**Status:** aceito

## Contexto

A marca **TS Cortex Studio** já existe no repositório desde o trabalho de
branding: o lockup está em `brand/ts-cortex-studio.svg`, o monograma em
`brand/ts-cortex-mark.svg`, e a splash obrigatória do host nativo já exibe esse
nome (ADR-0109, `native/src/webgpu/splash.h`). O **aplicativo**, porém, continuava
se chamando "Cortex Game Engine Studio" em todas as superfícies visíveis ao
usuário — instalador, atalho, splash de boot, tela inicial e boas-vindas.

O nome antigo estava **espalhado como literal** em seis pontos independentes, sem
fonte única: `electron-builder.json`, a splash HTML embutida no `main.ts`, o
`Launcher.ts`, o `Welcome.ts` (duplicado em pt e en, hardcoded fora do i18n) e os
dois arquivos de i18n. Renomear exigia caçar string, e qualquer rename futuro
repetiria a caçada.

Há ainda um efeito colateral não óbvio no Electron: o diretório `userData` deriva
do **nome do app**, que no build empacotado vem do `productName` do
electron-builder. Trocar o `productName` moveria `%APPDATA%\Cortex Game Engine
Studio` para `%APPDATA%\TS Cortex Studio` — e ali moram `preferences.json`
(idioma, welcome, último projeto), `chats/` e `sessions/` (histórico do Chat IA).
Um rebrand puramente cosmético apagaria, na prática, o estado de quem já usa o
Studio instalado.

## Decisão

### 1. Fonte única do nome: `electron/appIdentity.ts`

Um módulo novo, sem dependência do `electron` (só constantes), importável tanto
pelo processo main quanto pelo renderer:

- `APP_DISPLAY_NAME = 'TS Cortex Studio'` — o nome **exibido**. Único lugar a
  mudar num rebrand futuro.
- `APP_WORDMARK = 'ts cortex'` — a marca curta das faixas de 30px, onde o nome
  completo não cabe: a marca da menubar (`Shell`) e a titlebar da tela inicial
  (`Launcher`). Antes era `'cortex'`, literal e duplicado nos dois arquivos.
- `APP_DATA_NAME = 'Cortex Game Engine Studio'` — a identidade **de dados**,
  congelada de propósito (ver item 3). Não é nome de exibição e não deve ser
  usada em UI.

Todos os pontos de exibição passam a ler `APP_DISPLAY_NAME`: a splash de boot
(`main.ts`), o título da tela inicial (`Launcher.ts`) e o título das boas-vindas
(`Welcome.ts`, nas duas trocas de idioma). O `productName` do
`electron-builder.json` e as chaves `welcome.title` dos i18n (pt/en) carregam o
nome novo como literal — são arquivos de dados, não podem importar o módulo.

### 2. Título da janela

`electron/renderer/index.html` tinha `<title>cortex-game-engine</title>` — o nome
do **repositório**, não do produto, herdado do scaffold. Passa a
`TS Cortex Studio`, alinhado ao resto.

### 3. `userData` desacoplado do nome de exibição

`main.ts` fixa o diretório de dados **antes** de qualquer uso de
`app.getPath('userData')` — na prática, antes do `requestSingleInstanceLock()` e
da higiene de cache, que são as primeiras coisas que o módulo faz no import:

```ts
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), APP_DATA_NAME))
}
```

Com isso o diretório fica preso em `%APPDATA%\Cortex Game Engine Studio`,
**independente** do nome de exibição e do `productName`: nada se perde neste
rebrand nem em renames futuros.

A guarda do `--user-data-dir` não é decorativa: `setPath` **sobrescreve** o
switch de linha de comando. Sem ela, quem pede um perfil alternativo — validar UI
sem tocar no perfil real, abrir uma segunda instância — cai calado no diretório
fixo. Foi observado na prática: uma instância de teste com
`--user-data-dir=<temp>` escreveu em `%APPDATA%\Cortex Game Engine Studio`.

É `setPath` e **não** `app.setName(APP_DATA_NAME)`. As duas travam o `userData`,
mas o nome do app é também o **título default** de qualquer janela sem `<title>`
próprio — com `setName`, a splash de boot aparecia no Alt+Tab e na barra de
tarefas como "Cortex Game Engine Studio" (verificado rodando o Studio buildado:
a splash desenhava o nome novo, o título da janela vinha com o antigo).
`setPath` mexe só no disco e deixa `app.getName()` seguir o `productName`.

Alternativas descartadas:

- **Migrar a pasta no primeiro boot** (copiar antiga → nova). Resolve uma vez, mas
  deixa código de migração permanente e volta a quebrar no próximo rename.
- **Deixar resetar.** Custo direto para quem já tem o Studio instalado: perde
  idioma, projetos recentes e todo o histórico do Chat IA, sem aviso.

O `appId` (`com.cortex.studio`) **não muda**: ele é a identidade do app para o
SO/instalador (upgrades reconhecem a instalação anterior por ele). Trocá-lo faria
a nova versão instalar lado a lado com a antiga em vez de atualizar.

### 4. Escopo: o Studio, não a engine

A **engine** continua "Cortex Game Engine". Ficam intocados: a splash do jogo
gerado (`templates/new-project/index.html`), o `README.md`, o catálogo
`docs/cortex-game-engine/engine-api.md`, o `name` do `package.json`
(`cortex-game-engine`) e o host nativo `CortexNative`. O rebrand é do
**aplicativo** que o usuário abre, não do runtime que ele embarca no jogo.

ADRs históricos que citam o nome antigo (ex.: ADR-0024) **não** são reescritos —
registro é datado, não se reescreve o passado.

## Consequências

- Rebrand futuro do Studio = editar `APP_DISPLAY_NAME` + `productName` + as duas
  chaves `welcome.title`. Os quatro pontos de UI seguem sozinhos.
- O diretório `%APPDATA%\Cortex Game Engine Studio` sobrevive ao rename e agora é
  **permanente**: quem inspecionar a pasta de dados vai ver o nome antigo. É o
  preço de não perder o estado do usuário; o comentário no `appIdentity.ts`
  explica isso para quem tropeçar.
- O instalador NSIS passa a gerar `TS Cortex Studio Setup <versão>.exe` e o atalho
  com o nome novo. Como o `appId` é o mesmo, o instalador **atualiza** a
  instalação existente — o usuário vê o atalho antigo virar o novo, não dois apps.
- O renderer passa a importar um módulo de fora do seu `root`
  (`electron/renderer` → `electron/appIdentity.ts`). É o primeiro import assim; o
  Vite resolve porque o arquivo está dentro da raiz do workspace.
- Testes cobrem o contrato: `APP_DISPLAY_NAME` é o nome novo, `APP_DATA_NAME`
  continua o antigo (regressão de perda de dados), o `productName` do
  electron-builder bate com o display name, e nenhuma superfície de UI do Studio
  ainda carrega o nome antigo (`tests/electron/appIdentity.test.ts`). O
  `tests/electron/userDataPath.test.ts` trava o boot: `setPath` com o nome legado
  antes do primeiro `getPath('userData')`, e **sem** `setName` — a armadilha que
  a validação visual pegou.
