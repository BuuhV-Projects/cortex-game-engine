# SPEC-0691 — Divisão do editor de código do Studio em módulos

**Data:** 2026-11-05
**Status:** aceito
**Relacionados:** ADR-0690, SPEC-0668, SPEC-0166

## Contexto

`electron/renderer/Editor.ts` acumulou **792 linhas**: além de orquestrar as abas e o ciclo de vida
do Monaco, carregava classificação de arquivo por extensão, conversão de path do SO em URI virtual,
configuração do serviço de TypeScript, pre-load de models, construção do DOM da casca, a view da
barra de abas e os overlays de preview de imagem e markdown.

O limite do repo é 500 linhas por arquivo de código e não existe registro de pendência: o gate do PR
(`.github/scripts/pr-rules.mjs`, `MAX_LINES = 500`) reprova qualquer arquivo **tocado** acima disso
(SPEC-0668). A troca dos workers do Monaco (ADR-0690) toca o `Editor.ts`, então a divisão entra na
mesma mudança.

## Decisão

Divisão por responsabilidade, sem mudança de comportamento — só movimentação de código, imports e
ajuste de assinatura onde necessário. Nenhuma abstração nova (sem interface de uma implementação,
sem factory, sem camada de configuração).

| Módulo (`electron/renderer/`) | Linhas | Responsabilidade |
|---|---|---|
| `Editor.ts` | 388 | orquestra abas, models e o ciclo de vida do Monaco |
| `PreviewOverlay.ts` | 170 | overlay de preview de imagem e markdown, e o `SpritePreview` |
| `monacoWorkspace.ts` | 102 | URI virtual ↔ path do SO e os defaults do serviço de TypeScript |
| `monacoModels.ts` | 104 | pre-load de arquivos do projeto, types do engine, aviso de models |
| `editorTabsView.ts` | 62 | view pura da barra de abas |
| `fileKinds.ts` | 53 | linguagem do Monaco e MIME por extensão |
| `monacoWorkers.ts` | 35 | registro dos workers no `MonacoEnvironment` (ADR-0690) |
| `vite-env.d.ts` | 9 | declarações de ambiente do Vite para o renderer |

Critério de corte: o que **não** depende de `this` saiu como função pura em módulo próprio; o que
depende só saiu quando o estado podia ir junto de forma coesa — caso do `PreviewOverlay`, que passou
a ser dono dos próprios `previewDocPath`/`previewImagePath`/`previewImageName`.

Os comentários que documentam armadilhas reais foram junto do código que explicam: drive letter na
URI do Monaco (o resolver do Node para no `/D:/` e não acha `/node_modules/`), o path-aware do
fechamento de documento, o model vazio único e a quebra por origem do aviso de models (SPEC-0166).

## Consequências

- Todo arquivo tocado fica dentro do limite de 500 linhas; o gate passa com 0 erros.
- O aviso de quantidade de models deixou de ser `console.warn` e passou a `debug('studio:monaco', …)`,
  que é o padrão do repo para diagnóstico. Os `console.error` de falha real continuam `console.error`
  — eles têm que aparecer sem depender de flag, como já é feito no `Chat.ts`.
- `PreviewOverlay` e `GlbPreview` empatam em `z-index: 6`, então a ordem no DOM decidiria o
  empilhamento entre os dois. Eles são mutuamente exclusivos por construção (abrir `.glb` chama
  `preview.hide()`; abrir imagem ou markdown chama `glbPreview.close()`), então o empate nunca
  aparece. Quem mexer nos overlays precisa manter essa exclusão ou dar `z-index` distintos.
- A divisão é de módulos de renderer do Studio, não de API pública do engine: nada entra no
  `src/index-runtime.ts` nem em `VENDOR_TYPE_MODULES`.
