# 0056 - Editor como chrome da IDE (ponte postMessage + modelo declarativo)

**Data:** 2026-06-08
**Status:** aceito

## Contexto

No fluxo atual o editor embutido (SPEC-0030/0041/0042/0046/0050) desenha **toda**
a sua UI — hierarquia (outliner), inspector, HUD, botão Play — como DOM **dentro
do runtime do jogo**, no `index.dev.js`. O Preview da IDE roda o jogo num
**iframe** (`Preview.ts` injeta `<iframe src=viteUrl>`) e **não conhece a cena**.

Consequência (a dor): pra ver hierarquia ou propriedades de um objeto o usuário
depende do modo edição do jogo, e os painéis ocupam a **tela do próprio jogo**,
amarrados a edit/play. É o oposto do Blender/Unity, onde Outliner e Properties são
**chrome da aplicação** em volta do viewport — sempre presentes, independentes do
play.

O ADR-0042 registrou o motivo de tudo estar no bundle do jogo: o iframe é
cross-origin, então a IDE **não injeta** o editor em runtime; o editor tem que ser
código do próprio jogo. Isso continua verdade — mas **passar dados** pela borda do
iframe (postMessage) sempre foi possível (o editor de Logic Bricks revertido,
ADR-0055, já tinha essa ponte).

## Decisão

Mover **a apresentação** da hierarquia e do inspector pra **chrome da IDE**, em
volta do iframe, mantendo o engine como **fonte da verdade** (dono do
`Three.Scene` + `World`). A ponte é **postMessage**; o contrato é um **modelo
declarativo** serializável.

**Princípio anti-fork (um modelo, dois renderizadores).** No meu aviso anterior
o risco era duplicar o editor. Pra evitar: a lógica de domínio (collider,
heightfield, animação, luz…) continua **só no engine**, nas `*Api` do
`attachEditor`. Um módulo novo **`EditorModel.ts`** descreve o estado como dado
(`describeOutliner` / `describeInspector`) + um registro de **handlers** por
`fieldId`. Dois renderizadores consomem o **mesmo** modelo:

1. **In-canvas (engine):** `EditorInspector`/`EditorOutliner` passam a renderizar
   o modelo via um renderizador DOM genérico. É o caminho de **projeto standalone**
   (jogo aberto fora da IDE) — exigido pelo ADR-0042. Comportamento preservado.
2. **Nativo da IDE:** `EditorPanels.ts` (renderer) desenha o mesmo modelo como
   painéis do shell, à direita do viewport (Outliner em cima, Inspector embaixo —
   layout Blender), e manda comandos de volta.

**Ponte (`EditorBridge.ts`, engine).**
- **Handshake:** se rodando em iframe (`window.parent !== window`), o engine
  emite `hello` ao parent e espera `ack`. Sem ack (jogo standalone em browser,
  ou `?play`), **não** faz bridge — segue 100% in-canvas. Só com ack vira
  **modo bridged**.
- **Modo bridged:** o engine **esconde os painéis in-canvas** (outliner, inspector,
  HUD, botão Play) — o gizmo, a câmera livre e a interação no viewport **continuam
  no canvas** (é o viewport, como no Blender) — e passa a **publicar** o modelo
  (`state`) ao parent a cada mudança (diff por igualdade de JSON), **em edição E em
  play** (resolve "preciso dar play pra ver"). Recebe `select`/`field`/`button`/
  `focus`/`play` e roteia pros handlers / `selection` / `editorState`.

**Protocolo (resumo).**
- engine → IDE: `{source:'cortex-editor', type:'hello'|'state', editorActive?, outliner?, inspector?}`
- IDE → engine: `{source:'cortex-ide', type:'ack'|'select'|'field'|'button'|'focus'|'play', ...}`

**Layout da IDE.** Os painéis ficam num strip à direita do `preview-viewport`
(flex), o iframe toma o resto. Ao ativar o bridge, a coluna direita auto-alarga
pra caber jogo + painéis; o resizer existente segue valendo.

## Consequências

- **Igual Blender:** hierarquia + propriedades viram chrome da IDE, sempre
  visíveis (inclusive durante o play, read-through), fora da tela do jogo.
- **Sem fork:** uma fonte (`EditorModel`) + dois renderizadores. Domínio só no
  engine. O modelo é dado puro → **testável** sem subir UI (cobre o gap de não dar
  pra verificar Electron+WebGPU aqui).
- **Standalone intacto:** jogo fora da IDE (sem ack) usa os painéis in-canvas como
  antes; produção (sem editor) não muda. ADR-0042 segue válido (o editor continua
  no bundle do jogo; a IDE não injeta — só troca dados).
- **Interação 3D fica no viewport:** desenhar heightfield, gizmo e câmera livre
  continuam no canvas (precisam de raycast na cena). O inspector da IDE dispara
  essas ações por **botão** (`button` → comando → engine inicia o modo no canvas).
- **Limites conhecidos:** o modelo cobre o que o inspector mostra hoje
  (transform, sombra, matte, animação, ações do player, collider, luz). Campos
  novos no inspector precisam entrar no `describeInspector` (um lugar só). Reparent/
  drag-and-drop na hierarquia segue fora de escopo (SPEC-0041).
- **Não verificável aqui:** o render nativo na IDE e o atach num projeto real
  dependem de rodar IDE+WebGPU. Cobertos: typecheck (engine+electron),
  `build:engine` (2 bundles), testes do `EditorModel` e os existentes, `docs:engine`.
- Relaciona-se com SPEC-0030/0041/0042/0046/0050 (editor) e 0044 (overlay/persistência).
