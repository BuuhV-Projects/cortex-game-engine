# SPEC-0699 - Barra de progresso do export com o que está sendo feito

**Data:** 2026-11-06
**Status:** aceito

## Contexto

No export do port-hollow o modal ficou minutos em "Copiando assets e cenas" sem
mudar nada, e pareceu travado. O export estava vivo: era o cook das texturas
(GLB → KTX2, ADR-0108). Três coisas deixavam a tela muda:

1. `cookAssets` só avisava o progresso **depois** de terminar cada arquivo, e o
   `export-game.mjs` ainda filtrava 1 a cada 3. Um GLB grande sem cache segura a
   contagem por minutos.
2. Dentro de um GLB o encode é textura por textura, sem aviso nenhum.
3. A conversão é CPU entre `await`s de microtarefa. O `console.log` num pipe pode
   esperar o loop do Node respirar, e então a linha só chega depois.
4. Antes do cook, a busca dos materiais de pacote usados (`usedPackageMaterials`,
   SPEC-0641 §6) lia todo `.json/.ts/.js` do projeto, inclusive o `.claude/`, com
   as worktrees e caches das sessões. No port-hollow eram 15.748 arquivos (80 MB)
   e **63,6 s** com a barra parada em 22%.

## Decisão

**Protocolo (stdout do `export-game.mjs`).** Além do `[export:step] <key>`, o
script emite `[export:progress] <json>` com:

```json
{ "phase": "scan" }
{ "phase": "cook", "done": 45, "total": 118, "file": "vehicles/taxi.glb", "tex": [3, 12] }
{ "phase": "pack" }
```

- `scan`: procurando os materiais de pacote usados pelo jogo.
- `cook`: `done` = arquivos já processados, `total` = arquivos do cook, `file` =
  o arquivo em processamento, `tex` = `[textura atual, texturas do GLB]` quando
  há encode em curso.
- Emitido **antes** de cada GLB, antes de cada textura e ao fim. Cópia simples
  (PNG, áudio, JSON) não emite: é rápida e cobriria o canal de linhas.
- Depois de cada emissão o cook cede o loop (`setImmediate`), pra linha sair já.
- `pack`: gravando o `assets.pak`.

O `exportIpc.ts` repassa como `progress:<json>` no canal `export:progress` que já
existe. O antigo `[export:cook] n/m` sai.

**Modal.** Ganha uma barra (`<progress>`) com o percentual do export inteiro e
uma linha de detalhe com o que está sendo feito agora:

- "Comprimindo texturas 45/118 · textura 3/12" + nome do arquivo (com reticências
  se não couber);
- "Gravando assets.pak…";
- "Procurando materiais de textura usados pelo jogo…".

**Varredura de materiais.** `usedPackageMaterials` pula toda pasta oculta
(`.claude`, `.cortex`, `.git`…): elas guardam worktrees, caches e screenshots, não
autoria. No port-hollow a busca caiu de 63,6 s para 52 ms, com o mesmo resultado.

O percentual soma o peso das etapas já concluídas mais a fração da atual. Pesos
(`STEP_WEIGHT`): prepare 1, bundle 15, bytecode 5, runtime 1, assets 78. Dentro
de `assets`, a fração é `(done + tex_atual/tex_total) / total`. O pack conta como
fim do cook.

## Consequências

- A tela se mexe a cada textura, então um export longo não parece travado.
- O percentual é por **arquivo**, não por tempo: GLB com cache passa rápido e GLB
  novo demora, então a barra anda em ritmos diferentes. Se incomodar, ponderar
  pelo tamanho da textura.
- Os pesos das etapas são uma estimativa do port-hollow. Projeto sem asset pesado
  vê a barra pular de 22% para 100% no fim.
