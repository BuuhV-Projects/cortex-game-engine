# 0697 - Hot reload de script e de GLB sem recarregar a cena (fatia 1 do ADR-0696)

**Data:** 2026-11-05
**Status:** aceito

## Contexto

O ADR-0696 decide que o engine gera as fronteiras HMR por um plugin vite, com um
contrato por tipo de arquivo. Esta spec cobre a primeira fatia: **script de
comportamento** e **GLB de nó `model`**. São os dois casos que o engine já controla de
ponta a ponta, ou seja, o `ScriptRegistry`/`ScriptHostSystem` e o `loadGLB`/`instance`.

## Decisão

### 1. Plugin vite: `createHotReloadPlugin(options?)` (`src/vite/hotReloadPlugin.ts`)

Node-only, `apply: 'serve'`, autocontido: importa só `node:*` e tipos do `vite`, porque
é copiado arquivo a arquivo para `vendor/cortex-game-engine/vite/`. Opções:
`scriptsDir` (default `'scripts'`), `engineImport` (default `'cortex-game-engine'`).

- **`transform`** de todo `.ts`/`.js` sob `<root>/<scriptsDir>/`, exceto `.d.ts` e
  `*.test.*`/`*.spec.*`: acrescenta ao fim do módulo

  ```js
  import { hotReplaceScripts as __cortexHotReplaceScripts } from 'cortex-game-engine';
  if (import.meta.hot) import.meta.hot.accept((m) => {
    if (!m || !__cortexHotReplaceScripts('scripts/Girar.ts', m)) import.meta.hot.invalidate('cortex: módulo de script exporta algo que não é ScriptBehavior');
  });
  ```

  O caminho é relativo à raiz, com `/`. O módulo vira self-accepting, e a propagação
  para nele, sem chegar ao `main.ts`.
- **`transformIndexHtml`**: injeta no `<head>` um `<script type="module">` (cliente de
  hot reload) que chama `enableModelHotReload()` e escuta
  `import.meta.hot.on('cortex:model-changed', ({ url }) => hotReloadModel(url))`. Ele roda
  antes do `main.ts`, então o registro de raízes já está ligado quando o `buildScene` monta
  a cena.
- **`hotUpdate`**, só no ambiente `client`:
  - arquivo sob `.claude/`, `node_modules/` ou fora da raiz → `[]`. Isso corta o reload
    causado por edição em outra worktree;
  - `.glb`/`.gltf` sob a raiz → `this.environment.hot.send('cortex:model-changed', { url })`
    (URL relativa à raiz, com `/`) e `[]`;
  - o resto segue o fluxo normal do vite.

### 2. Script: `hotReplaceScripts(path, module): boolean` (`src/scripts/ScriptHotReload.ts`)

- Lê os scripts do módulo com a **mesma regra de nome** do `registerScripts`
  (`scriptName` > nome do arquivo > `class.name`). Essa regra é extraída para uma função
  compartilhada, para os dois não divergirem.
- Se o módulo exporta **qualquer valor** que não é subclasse de `ScriptBehavior`, devolve
  `false` sem mudar nada. O plugin então chama `invalidate()` → reload completo. Tipos não
  contam, porque somem na compilação.
- Para cada script do módulo:
  1. `registerScript(nome, NovaClasse)`. Instâncias criadas depois usam a classe nova.
  2. Para cada slot vivo com `type === nome` e `instance !== null`, em todo
     `ScriptHostSystem` vivo:
     - `Object.setPrototypeOf(instance, NovaClasse.prototype)`;
     - cria uma instância descartável `new NovaClasse()` e copia para a viva **só as
       propriedades próprias que ela não tem**;
     - para cada campo do schema novo que a instância não tinha antes da troca, aplica o
       valor do slot (`slot.fields[campo]`), se houver;
     - mantém `slot.started` (o `onStart` não roda de novo);
     - chama `instance.onHotReload?.()`, protegido por try/catch com `debug('script', …)`.
- Nomes que **este caminho** registrou antes e sumiram do módulo: os slots vivos desse
  tipo são derrubados (`restoreRaycasts` + `onDestroy`, `instance = null`,
  `started = false`), e o nome sai do registro.
- Fora do Play não há instância (ADR-0143). Basta o registro, e o próximo Play instancia a
  classe nova.
- O Inspector mostra o schema novo no próximo `publish`. Se o publish depender de diff e
  não perceber a mudança, a troca pede um publish.

`ScriptBehavior` ganha o hook opcional `onHotReload?(): void`. O `ScriptHostSystem` passa
a manter um registro de módulo dos sistemas vivos (entra no construtor, sai no `dispose`),
exposto internamente como `forEachLiveScriptSlot(cb)`.

### 3. GLB: `hotReloadModel(url)` (`src/scene/ModelHotReload.ts`)

Registro (`src/scene/modelHotRegistry.ts`), **desligado por padrão**: custo zero em
produção e no host nativo. `enableModelHotReload()` liga. Ligado:

- `loadGLB(url)` lembra `gltf → url`, e `instance(gltf)` guarda a raiz clonada num
  `Map<url, Set<Object3D>>` e em `userData.cortexModelUrl`;
- `setMatte`, `setShadows`, `setFog` e `applyMaterial` gravam a operação aplicada na raiz
  que receberam (`userData.cortexLook`: lista ordenada `{ kind, args }`; reaplicar o mesmo
  `kind` substitui o valor e mantém a posição; um "desfazer" do mesmo helper remove a
  entrada).

`hotReloadModel(url)`, com a URL normalizada (sem `./`, `/` inicial nem query):

1. Raízes vivas da URL. São podadas as que não estão mais ligadas a uma `Scene`.
2. Despeja a URL dos caches (`SceneAssets` e o `AssetLoader` interno dele, com
   `evict(url)` novo) e carrega de novo com `loadGLB`. O vite dev serve com etag e
   `no-cache`, então o arquivo novo chega sem cache-bust.
3. Cada raiz:
   - **pulada com aviso** se tiver animação (`userData.cortexAnim` ou clipes no GLB novo)
     ou se estiver presa a ECS (`Object3DComponent` aponta para ela: Character,
     Collider2D, Rapier). O motivo é que bbox, corpo e mixer dependem da geometria;
   - senão: remove os filhos velhos, move para a raiz os filhos de `instance(novoGltf)` e
     repete o `cortexLook` gravado na raiz, na ordem;
   - scripts anexados à raiz que tinham raycast desligado: `restoreRaycasts()` e
     `disableRaycast(raiz)` de novo.
4. Se nenhuma raiz da URL ficou com os filhos velhos, libera geometria, material e textura
   do GLTF antigo.
5. Chama os callbacks de `onModelHotReload(cb)` com `{ url, root, oldChildren }`, para o
   jogo religar referências a filhos (rig de carro, rodas). `onModelHotReload` devolve a
   função de cancelamento.
6. Devolve `{ url, swapped, skipped: [{ reason }] }`. Raiz pulada gera `console.warn`
   dizendo qual nó e que um Reiniciar resolve. É código só de dev, e sem o aviso o usuário
   acharia que trocou e veria o modelo velho.

### 4. Template e vendoring

- `templates/new-project/vite.config.ts`: `createHotReloadPlugin()` nos `plugins` e
  `watch.ignored: ['**/src-tauri/**', '**/.claude/**']`.
- `templates/new-project/scripts/README.md`: o contrato (só exporta `ScriptBehavior`,
  topo sem efeito, `onHotReload`).
- O comentário do `main.ts` do template que diz "editar um script recarrega a página" é
  atualizado.
- `electron/main/engineVendor.ts` copia também `hotReloadPlugin.{js,d.ts}`.
- Módulos públicos novos entram no `index-runtime.ts` e no `VENDOR_TYPE_MODULES`, e a doc
  é regenerada (`yarn docs:engine`, `engine-api.md`).

## Consequências

- Medição antes e depois num jogo real: ver a seção "Medição" no fim.
- Fora da fatia, e sem mudança em relação a hoje: GLB de `new AssetLoader()` próprio do
  jogo, kits fundidos pelo jogo, raízes animadas ou com física, textura avulsa, criar ou
  apagar script (o glob invalida o `main.ts`) e JSON de cena.
- Seleção do editor num **filho** de um GLB trocado fica apontando para o objeto velho
  (destacado da cena). Selecionar de novo resolve; a raiz não é afetada.
- Raiz trocada no Play compila o pipeline no 1º draw (travada de dev aceitável; no editor
  o `precompile` já é no-op).

## Medição

_Preenchida ao aplicar num jogo real._
