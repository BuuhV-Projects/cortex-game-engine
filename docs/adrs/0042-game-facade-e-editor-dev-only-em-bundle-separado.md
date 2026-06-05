# 0042 - Facade `Game` e editor dev-only em bundle separado

**Data:** 2026-06-05
**Status:** aceito

## Contexto

Ligar o editor (ADR-0038/0041) exigia ~50 linhas de boilerplate no `main.ts` de
cada projeto: criar `World`, `InputManager`, `EditorState`, `EditorSelection`,
HUD, câmera de editor, registrar `EditorCameraSystem`/`ObjectEditSystem`,
instanciar hierarquia/inspector e sincronizar a troca de câmera no loop. O
usuário queria que isso fosse **intrínseco à engine/IDE** (sem boilerplate, e o
dev não poder remover por engano), **reativo nos dois sentidos** e, em **build de
produção, removido pra não pesar**.

Restrições descobertas:
- O Preview da IDE roda o jogo num **iframe cross-origin** → a IDE **não consegue
  injetar** o editor em runtime.
- O engine é vendorizado como **bundle único minificado** (`build:engine` =
  `tsc + vite build`) → `import.meta.env.DEV` do projeto **não alcança** código
  pré-bundlado; não dá pra tree-shakar o editor de dentro do bundle.

Conclusão: a decisão dev/prod tem que escolher **qual bundle do engine** o projeto
usa, e o editor precisa ser código do próprio jogo (não injetado).

## Decisão

1. **Facade `Game`** (`src/core/Game.ts`): cria e conecta Renderer + Scene +
   Câmera + `World` + `InputManager` + loop. `start()` roda o loop e renderiza
   com a câmera ativa. Expõe um ponto de extensão `registerEditorAttacher(fn)`;
   se houver attacher registrado, o `Game` o liga no construtor e consulta
   `activeCamera()`/`update(dt)` por frame. O jogo vira
   `new Game({ canvas }); game.scene.add(...); game.onUpdate(...); game.start()`.

2. **Editor em bundle separado, dev-only.** Dois entries:
   - `src/index-runtime.ts` → `index.js` (runtime, **sem** editor).
   - `src/index-dev.ts` → `index.dev.js` (runtime + editor + `attachEditor`, que
     se auto-registra via `registerEditorAttacher`).
   `build:engine` gera os dois (`vite.engine.config.ts` + `vite.engine.dev.config.ts`,
   este com `emptyOutDir:false`). Diferença medida: ~21 kB (o editor) sobre ~2,2 MB.

3. **Seleção do bundle por `mode` no projeto.** O `vite.config.ts` do template
   resolve o alias `cortex-game-engine` para `index.dev.js` em
   `mode=development` e `index.js` no build de produção. Assim o editor existe em
   dev e é **100% removido** do build do jogo. A IDE vendoriza os dois bundles.

4. **`attachEditor(game)`** liga câmera livre + gizmo + HUD + hierarquia +
   inspector e implementa a **reatividade**: editor→cena (gizmo/inspector escrevem
   nos objetos) e cena→editor (diff dos filhos da cena por frame atualiza a
   hierarquia; `inspector.refresh()` relê a transform do selecionado sem pisar no
   input em foco). Cria um alvo editável "invisível" pra a câmera/teleporte/F2
   funcionarem sem avatar no jogo.

5. **Template** reescrito pra usar `Game` (zero linha de editor); a água do
   starter passou a usar a textura de cáusticas (incluída em
   `assets/textures/caustics.png`). Doc da API regenerada, `engine-api.md` e a
   regra do prompt do Chat IA atualizadas (editor é automático; não montar à mão).

6. **Correção de bug latente:** `VENDOR_TYPE_MODULES` não incluía
   `SceneAssets`/`OutdoorLighting`/`Water` (ADR-0039/0040) nem `Game` — projetos
   criados teriam tipos quebrados. Lista sincronizada com os exports do runtime;
   editor saiu dela (não é mais exportado pelo runtime).

7. **Testes** (vitest): `EditorSelection` (observable) e `SceneAssets`
   (`getWorldBounds`/`placeOnGround`/`setShadows`, incl. pivô deslocado).

## Consequências

- Jogo novo não tem boilerplate de editor e o dev não o remove sem querer; em
  prod o editor não entra no bundle.
- O editor **saiu da API pública gerada** (typedoc no `index-runtime`) — é detalhe
  interno, ligado pelo `Game`. Importar editor de `'cortex-game-engine'` não
  funciona mais (era o que o template/exemplos antigos faziam; migrados).
- Em dev, `index.dev.js` é um bundle à parte (duplica three em disco vs `index.js`),
  mas só um é carregado por vez — sem dupla-instância em runtime.
- **Não verificável aqui:** o build de produção do jogo de fato sem editor, o
  vendoring no app empacotado e o editor atachando num projeto real dependem de
  rodar a IDE + WebGPU. Engine/electron typecheck, `build:engine` (2 bundles),
  217 testes e `docs:engine` passam.
- Relaciona-se com ADR-0034 (extraResources/vendoring), 0038/0041 (editor) e
  0039/0040 (helpers de cena).
