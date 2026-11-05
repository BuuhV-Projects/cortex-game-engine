# 0696 - Hot reload estilo Fast Refresh: fronteiras HMR geradas pelo plugin do engine

**Data:** 2026-11-05
**Status:** aceito

## Contexto

No editor do Studio (F2), salvar quase qualquer arquivo do jogo recarrega a página
inteira, e o jogo remonta do zero. Medimos no DDD 00 (`D:/jogos/port-hollow`, vite
7.3.5), com um servidor vite headless, um cliente HMR conectado e um "toque" em cada
tipo de arquivo:

| Mudança | Está no grafo de módulos? | O que o vite manda | Efeito hoje |
|---|---|---|---|
| `scripts/*.ts` (ScriptBehavior) | sim, importado pelo `main.ts` via `import.meta.glob` eager | `full-reload` | recarrega tudo |
| `systems/*.ts`, `game/*.ts`, `city/*.ts` | sim | `full-reload` | recarrega tudo |
| `scenes/level.json` (import do `main.ts`) | sim | `full-reload` | recarrega tudo |
| `main.ts`, `vendor/cortex-game-engine/index.dev.js` | sim (raiz / 81 importadores) | `full-reload` | recarrega tudo |
| `.glb`, textura, `public/*` | não (carregados por URL) | nada | **o jogo fica com o arquivo velho** |
| `assets/scene-data.json` (overlay do editor) | não (vem por `fetch`) | nada | nada |

São dois problemas opostos. Código e JSON importado **recarregam demais**: não há
nenhum `import.meta.hot.accept` no engine, no template nem no jogo, então toda mudança
sobe pelos importadores até o `main.ts`, que é a raiz e não aceita, e o vite cai no
`full-reload` (`propagateUpdate` sem importador → beco sem saída,
`vite/dist/node/chunks/config.js:26238`). Assets **não recarregam nada**: o vite só
conhece módulos, e arquivo fora do grafo cai em "no modules matched"
(`config.js:26130-26141`).

O custo do reload completo já caiu: a SPEC-0657 tirou o `game.precompile()` do editor
(36–41 s), e o reload no editor fica em ~13,5 s de carga + ~5 s até o 1º quadro (A/B da
SPEC-0657; antes, ~70 s). O que continua caro é **perder o estado**: o editor volta em
modo edição, o player volta ao spawn, e frota, multidão e clima são sorteados de novo.
Para iterar num comportamento é preciso dar Play e reproduzir a situação a cada save.

Outros motores tratam isso de formas diferentes (pesquisa em
`side-session-notes/.../01-pesquisa-hmr.md`):

- **React Fast Refresh**: cada módulo de componente vira uma fronteira HMR (`accept`
  injetado pelo plugin); a "família" é módulo + nome do export; o estado dos hooks é
  preservado e os efeitos re-rodam; um módulo que exporta algo que não é componente
  chama `invalidate()` e sobe na árvore.
- **Godot** (`GDScriptLanguage::reload_scripts`): guarda as propriedades de cada
  instância, troca o script e as restaura por nome. Não pede nada ao autor.
- **PlayCanvas**: cria uma instância nova, copia os atributos e chama `swap(old)` se o
  autor implementar; `initialize` não roda de novo.
- **Unity**: o domain reload serializa só os campos serializáveis e perde o resto.
- **Bevy**: o handle do asset é estável e o conteúdo troca embaixo, com `AssetEvent::Modified`.
- **three.js editor / Babylon playground**: recriam tudo, sem preservar nada.

## Decisão

**Fronteiras HMR geradas por um plugin vite do engine** (`createHotReloadPlugin`, em
`src/vite/hotReloadPlugin.ts`, vendorizado junto do `sceneSavePlugin`). O jogo não
escreve `import.meta.hot` à mão: o contrato que ele cumpre é **a forma dos arquivos**
de cada pasta. O que não cabe no contrato continua com reload completo, como hoje,
para não deixar o jogo num estado meio-novo e meio-velho.

Contrato por tipo de mudança:

| Tipo | Contrato do arquivo | O que acontece | Fatia |
|---|---|---|---|
| **Script de comportamento** (`scripts/**/*.ts`) | o módulo **só exporta** subclasses de `ScriptBehavior`; o topo do módulo não tem efeito colateral | o plugin injeta um `accept` no módulo; as instâncias vivas trocam de classe e **preservam o estado**; `onStart` não roda de novo; hook opcional `onHotReload()` | **1** |
| **GLB** de nó `model` (`assets/**/*.glb`/`.gltf`) | o GLB foi carregado por `loadGLB` + `instance` (o caminho do `buildScene`) | o plugin manda um evento `cortex:model-changed`; o engine recarrega o arquivo e troca **os filhos** de cada raiz viva, mantendo a raiz e reaplicando a aparência | **1** |
| Classes e sistemas do jogo (`systems/`, `game/`) | módulo que só exporta classes (como o script) | mesma troca de protótipo + `World.replaceSystem` | 2 |
| Textura (`.png/.jpg/.ktx2`) | carregada por `loadTexture` | troca o `map` dos materiais que usam a URL | 2 |
| Criar/apagar script | — | hoje o `import.meta.glob` invalida o `main.ts` (reload). Mover o registro para um módulo que aceita | 2 |
| Dado de cena (`scenes/*.json`) | — | o jogo **muta** o JSON no boot (o DDD 00 injeta terreno, água, vegetação). Reconstruir a partir do JSON novo perderia isso. O dado editável já tem canal próprio, o overlay `scene-data.json` | 3 |
| Bootstrap (`main.ts`) e engine vendorizado | — | **reload completo, sempre.** O `main.ts` é dono de todo o estado (top-level await, `let` de handles) e o engine é um módulo só | — |

### Por que trocar o protótipo da instância

Para scripts, a troca escolhida é a da instância viva:
`Object.setPrototypeOf(instância, NovaClasse.prototype)`. Depois disso, as propriedades
próprias que a classe nova inicializa e a instância ainda não tem são copiadas de uma
instância descartável `new NovaClasse()`. O registro passa a apontar para a classe nova,
então instâncias criadas depois rodam o construtor novo.

Isso preserva **a identidade do objeto**: outro script que guardou uma referência a esta
instância continua apontando para ela. Preserva também todo o estado próprio (timers,
refs, `entity`/`object3d`/`ctx`, a lista privada `disabledRaycasts` da base) e os
valores que o Inspector mudou ao vivo.

### Por que trocar os filhos e manter a raiz do GLB

O Object3D raiz de um nó `model` é referenciado por muita gente: `byId` do jogo,
`ScriptComponent.object`, o registro de ids do editor e os `userData.cortex*`. Trocar
só os filhos mantém essas referências válidas sem religar nada.

A aparência (matte, material, sombra, névoa) é reaplicada pelos **mesmos helpers** do
boot: cada helper grava na raiz a operação que aplicou (`userData.cortexLook`), e a troca
repete as operações na mesma ordem. Assim o `SceneBuilder` não precisa saber de hot
reload.

O que depende da geometria e está preso a ECS (Collider2D, Character, Rapier) ou a
animação (`SceneAnimator`) fica **fora** da fatia 1: a raiz é pulada com aviso, como
hoje. O jogo que guarda referência a filhos do GLB (rig de carro, rodas) se religa pelo
callback `onModelHotReload(cb)`.

## Alternativas consideradas

1. **O jogo escreve as fronteiras à mão** (`import.meta.hot.accept` + `dispose/hydrate`
   exportados por cada sistema). Seria o mais flexível. Mas é código que todo jogo
   repete, que a IA do Chat esquece, e que quebra em silêncio: um `accept` sem `dispose`
   duplica listeners. Descartado como padrão. O jogo pode adicionar um `accept` próprio
   onde quiser, e o plugin não atrapalha.
2. **Snapshot do estado + reload completo** (o modelo do domain reload da Unity):
   serializar o mundo, recarregar e restaurar. Não remove os ~13–18 s do reload, e
   serializar o estado do DDD 00 (closures dos `setup*`, corpos Rapier, multidão em GPU)
   é inviável sem reescrever o jogo. Descartado.
3. **Recarga suave**: re-executar o `main.ts` com `game.dispose()` e reconstruir, sem
   recarregar a página. Economiza só o boot do vite e do Rapier e perde o estado do mesmo
   jeito. Descartado.
4. **Patch in-place do protótipo velho** (copiar os métodos novos para
   `ClasseVelha.prototype`, estilo "Hot Reload for Unity"). Mantém `instanceof` para quem
   segurou o binding velho, mas deixa duas classes vivas com metade do comportamento
   cada: as instâncias novas viriam do construtor novo, e os métodos estáticos e
   `static fields` ficariam divididos. Como o contrato proíbe exportar outra coisa do
   módulo de script, ninguém de fora segura o binding. Descartado em favor da troca
   do protótipo da instância.
5. **Instância nova + cópia do estado** (Godot, PlayCanvas `swap`). Quebra a
   identidade: outro script que guardou a referência fica com o objeto morto.
   Descartado; o hook `onHotReload()` cobre o caso do PlayCanvas.
6. **Recriar o nó `model` inteiro numa troca de GLB.** Teria de duplicar o laço de
   montagem do `buildScene` (matte → física → script → animação). Esse laço está inline
   num arquivo de 1572 linhas e não é reutilizável por nó. Descartado na fatia 1.

## Consequências

- **Script**: salvar troca o comportamento no próximo quadro, no Play ou fora dele, sem
  reload. O estado da instância é preservado; um campo novo nasce com o valor do
  inicializador e, se estiver no schema, com o valor da cena ou do Inspector. Mudança de
  forma de estado incompatível fica a cargo do `onHotReload()`, que pode, por exemplo,
  chamar `onDestroy()` e `onStart()`.
- **Módulo de script que exporta outra coisa** (função, const) cai em `invalidate()`, e
  o vite sobe a propagação até o `main.ts`: reload completo, como hoje. É a mesma regra do
  React Fast Refresh, e fica escrita no README de `scripts/` do template.
- **Efeitos no topo do módulo de script rodam de novo** a cada save. Exemplos: listener
  de `document`, `globalThis.__x`, cache de módulo. Coloque esses efeitos no `onStart`,
  e desfaça no `onDestroy`.
- **Erro de sintaxe**: o overlay do vite aparece, e o cliente do vite recarrega a página
  no primeiro update depois do erro (`client.mjs:831-833`). Corrigir um erro custa um
  reload. Fica aceito na fatia 1.
- **GLB**: só GLBs carregados por `loadGLB` + `instance`, que é o caminho do `buildScene`
  e de quem usa essa API. Ficam de fora, e continuam com o arquivo velho como hoje, os
  carregados por um `new AssetLoader()` próprio do jogo (o DDD 00 tem 11), os kits fundidos
  pelo jogo e as raízes com animação ou ECS.
- O canal de asset passa pelo WebSocket do próprio vite (`hot.send` de evento custom),
  que funciona no iframe do Studio e no navegador puro, sem mudar a ponte do editor.
- **O watcher do vite observava as worktrees aninhadas** (`.claude/worktrees/**`, ~70 mil
  arquivos no DDD 00): o 1º evento atrasava, e uma edição em **outra** worktree recarregava
  o jogo. O template passa a ignorar `**/.claude/**`, e o plugin descarta caminhos de lá.
- Jogos existentes precisam re-vendorizar e acrescentar `createHotReloadPlugin()` no
  `plugins` do `vite.config.ts`. Sem o plugin, tudo segue como antes.
- Implementação da fatia 1: SPEC-0697.
