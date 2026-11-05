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
  **Desvio na implementação:** módulo que declara membro `#privado` nativo
  (`#nome` que não vem depois de `.`, letra ou aspas: o `PRIVATE_MEMBER_RE` do plugin)
  **não** ganha o `accept` → reload completo. O nome privado nasce a cada avaliação da
  classe; a instância viva trocada de protótipo não o tem e todo acesso lançaria
  `TypeError`. O README pede `private` do TS.
- **`transformIndexHtml`**: injeta no `<head>` um `<script type="module">` (cliente de
  hot reload) que chama `enableModelHotReload()` e escuta
  `import.meta.hot.on('cortex:model-changed', ({ url }) => hotReloadModel(url))`. Ele roda
  antes do `main.ts`, então o registro de raízes já está ligado quando o `buildScene` monta
  a cena.
- **`hotUpdate`**, só no ambiente `client`:
  - arquivo sob `.claude/` ou `node_modules/` → `[]`. Isso corta o reload causado por
    edição em outra worktree. Arquivo fora da raiz (pacote irmão por alias) segue o fluxo
    normal do vite, sem evento de modelo;
  - `.glb`/`.gltf` sob a raiz → `this.environment.hot.send('cortex:model-changed', { url })`
    (URL relativa à raiz, com `/`) e `[]`;
  - o resto segue o fluxo normal do vite.

### 2. Script: `hotReplaceScripts(path, module): boolean` (`src/scripts/ScriptHotReload.ts`)

- Lê os scripts do módulo com a **mesma regra de nome** do `registerScripts`
  (`scriptName` > nome do arquivo > `class.name`). Essa regra é extraída para uma função
  compartilhada, para os dois não divergirem. O "um script por arquivo" conta **exports**,
  não classes: `export class X` + `export default X` segue com `class.name` (o nome que
  as cenas já persistem); a classe só é registrada uma vez.
- Se o módulo exporta **qualquer valor** que não é subclasse de `ScriptBehavior`, devolve
  `false` sem mudar nada. O plugin então chama `invalidate()` → reload completo. Tipos não
  contam, porque somem na compilação.
- **Desvio na implementação:** também devolve `false` se a classe registrada hoje sob um
  nome do módulo está na cadeia de protótipos de um script registrado por **outro**
  módulo (`Old.prototype.isPrototypeOf(Outro.prototype)`). O módulo base é
  self-accepting, então o vite não reexecutaria a derivada, que seguiria herdando a base
  velha. O `invalidate()` sobe aos importadores, e como o glob do `main.ts` importa todo
  script, vira reload completo.
- Para cada script do módulo:
  1. `registerScript(nome, NovaClasse)`. Instâncias criadas depois usam a classe nova.
  2. Para cada slot vivo com `type === nome` e `instance !== null`, em todo
     `ScriptHostSystem` vivo:
     - `Object.setPrototypeOf(instance, NovaClasse.prototype)`;
     - cria uma instância descartável `new NovaClasse()` e copia para a viva **só as
       propriedades próprias que ela não tem**;
     - para cada campo do schema novo que a instância não tinha antes da troca, aplica o
       valor do slot (`slot.fields[campo]`) ou, sem ele, o `default` do schema — a mesma
       regra do `applyScriptFields` na criação (desvio registrado: o inicializador só vale
       para campo fora do schema);
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
   - senão: remove os filhos velhos **que vieram do GLB** (`instance` os marca com o
     registro ligado; o que o jogo ou um script prendeu na raiz, como luz ou arma, fica),
     move para a raiz os filhos de `instance(novoGltf)` e repete o `cortexLook` gravado
     na raiz, na ordem;
   - scripts anexados à raiz que tinham raycast desligado: `restoreRaycasts()` e
     `disableRaycast(raiz)` de novo.
4. **Desvio na implementação:** o GLTF antigo **não** é liberado na troca. Ele pode ter
   usuário que o registro não vê (a `source` da vegetação, que nunca entra na cena; o
   personagem modular, que clona sem `instance`; `gltf.scene` direto). O `evictGLB` o põe
   numa lista de órfãos que o `clearSceneAssetCaches` libera junto dos cacheados.
5. Chama os callbacks de `onModelHotReload(cb)` com `{ url, root, oldChildren }`, para o
   jogo religar referências a filhos (rig de carro, rodas). `onModelHotReload` devolve a
   função de cancelamento.
6. Devolve `{ url, swapped, skipped: [{ reason }] }`. Raiz pulada gera `console.warn`
   dizendo qual nó e que um Reiniciar resolve. É código só de dev, e sem o aviso o usuário
   acharia que trocou e veria o modelo velho.

### 4. Template e vendoring

- `templates/new-project/vite.config.ts`: `createHotReloadPlugin()` nos `plugins` e
  `watch.ignored: ['**/src-tauri/**', isClaudePath]`. **Desvio na implementação:**
  `isClaudePath` compara com a `.claude/` **desta** raiz por caminho absoluto (como o
  port-hollow, SPEC-0148). O glob `**/.claude/**` casa o caminho absoluto no chokidar, e
  um jogo rodando de `.claude/worktrees/w` deixaria de observar todos os próprios arquivos.
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
- Vegetação e personagem modular usam o GLTF fora do registro: seguem com o modelo velho
  até o Reiniciar (o GLTF velho fica vivo até o `clearSceneAssetCaches`).
- Script com `#privado` nativo ou que é base de script de outro arquivo: reload completo.
- Seleção do editor num **filho** de um GLB trocado fica apontando para o objeto velho
  (destacado da cena). Selecionar de novo resolve; a raiz não é afetada.
- Raiz trocada no Play compila o pipeline no 1º draw (travada de dev aceitável; no editor
  o `precompile` já é no-op).

## Medição

Medida no DDD 00 (`BuuhV-Projects/ddd00-game`, SPEC-0149 do jogo) em 2026-11-05, com vite 7.3.5 em dev e
navegador embutido com o painel visível. Cada tempo vai do `Date.now()` do processo que grava o arquivo até o efeito na
página, com o mesmo relógio dos dois lados. Para medir, o script `Girar` foi anexado a um carro e passou a publicar
`{ versão, quadros }`.

| mudança | antes (engine 0.107.0) | depois (esta spec) |
| --- | --- | --- |
| script, no editor | `full-reload` 44 ms depois do save; jogo pronto em **12,9 s** e **14,6 s** | **sem reload** (`hmr update`) |
| script, em Play (`?play=1`) | `full-reload`; jogo pronto em **56,4 s**; contador do script reinicia e o jogo volta ao começo | código novo rodando em **149, 198 e 227 ms** com o jogo a 30 fps (623–1441 ms com ele engasgando); sem reload; contador contínuo |
| `.glb` de nó `model` sem física | nada: fica o modelo velho até o Reiniciar (reload completo) | evento 5 ms depois do save; filhos trocados em **27, 29 e 316 ms**; sem reload; mesma raiz |

- Com o jogo engasgando, o tempo da troca de script fica preso ao próximo quadro do jogo: o `onUpdate` só roda nele.
- **Os 116 veículos do DDD 00 são pulados** ("presa a ECS"). São os únicos nós `model` do `buildScene` naquele
  jogo; cidade, vegetação e kits o jogo monta por conta própria. A medição de GLB usou um prop sem física posto ao lado.
  Carro com física é o primeiro item da próxima fatia.
