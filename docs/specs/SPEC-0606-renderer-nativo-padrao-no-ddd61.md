# SPEC-0606 — Renderer próprio por padrão no export do DDD 61

**Data:** 2026-10-25
**Status:** implementado (engine). Decisão no ADR-0605; item 7 do "O que falta para fechar o R1" do PRD-0466.
**Pré-condição:** o conserto do `cull()` do jogo (SPEC-0197 do jogo, faixas dos `quebravel-*`) na main do DDD 61.
Com o nativo ligado e sem o conserto, as faixas crescem sem limpar (vazamento lento, SPEC-0597).

## Comportamento

- **Engine:** `GameOptions.nativeRenderer?: boolean` (padrão `false`). No construtor, o `Game` chama
  `setNativeRendererDefault(options.nativeRenderer ?? false)`, que passa a ser o padrão de
  `nativeRendererRequested()` e de `nativePrecompileRequested()`.
- **Precedência:** query > opção do jogo > `false`. `?nativeRenderer=0` volta ao `three` (até o R4);
  `?nativePrecompile=0` desliga só a pré-compilação; `?nativeRenderer=1` continua ligando em qualquer jogo
  (medição).
- **Modelos:** sem `?nativeRendererModels`, valem todos os registrados (`unlit`, `lambert`, `standard` e os
  `wgsl` do jogo), como hoje. A recusa por objeto continua caindo no `three`.
- **Onde vale:** só no host nativo, onde o b.1 instala o caminho (`CleanDrawFastPath`). No Studio a opção não
  tem efeito.
- **Jogo (DDD 61, spec própria no repo do jogo):** `new Game({ canvas, nativeRenderer: true })` no `main.ts`,
  depois do re-vendor da engine.

## Testes

- Vitest: precedência das flags (sem query e sem opção = `false`; opção `true` = `true`; `?nativeRenderer=0`
  com opção `true` = `false`; `?nativePrecompile=0` com opção `true` = renderer ligado e pré-compilação
  desligada).
- `check-stage` **sem nenhuma flag do nativo na query**, na cópia de medição com o jogo pedindo a opção: o
  export tem de usar o nativo (`[nativeRenderer] taken` > 0 no log; censo `covered` > 0), paridade PASS e
  tint FAIL (o tint precisa da flag `&nativeTint=1`, que continua sendo de query).
- `?nativeRenderer=0` no mesmo export: nenhuma linha `[nativeRenderer]` (volta ao `three`).

## Fora do escopo

- Ligar para outros jogos (cada um decide pela opção, depois da própria paridade).
- Remover o caminho do `three` (R4).

## Validação (2026-10-25, engine `eacaed8f`, cópia de teste do DDD 61 `468db13` com `nativeRenderer: true` no `main.ts`)

- `check-stage s606-on` **sem nenhuma flag na query:** Setor O e Comercial dia/noite PASS 0/0; fumaça PASS (render
  8,50 ms). O nativo desenha (`taken` 75–81 mil por ponto, `refused=0`) e o aquecimento passa por ele
  (`precompile frame=1 born=12–13`). A galeria não passa a opção, então fica no `three` (paridade sem conteúdo).
- `s606-tint` (`&nativeTint=1`): Setor O dia e noite FAIL (89% / 54%), como deve.
- `s606-off` (`&nativeRenderer=0`): nenhuma linha `[nativeRenderer]` no log (volta ao `three`); render 10,90 ms.
