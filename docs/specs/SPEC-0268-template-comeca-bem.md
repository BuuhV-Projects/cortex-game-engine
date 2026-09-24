# SPEC-0268 — Projeto novo já nasce com o carregamento e as regras de performance

**Data:** 2026-09-24
**Status:** aceito
**Relacionado:** ADR-0262 (quadro de aquecimento), SPEC-0264 (coleta no fim), ADR-0265 (regras nas duas cabeças)

## Contexto

A campanha de performance do kart-racer deixou lições que valem para qualquer
jogo, e o template de projeto novo (`templates/new-project/`) ia contra elas:

- `game.start()` rodava ANTES de montar a cena, sem `setLoading`: o jogador via a
  montagem pela metade e os shaders compilavam nos primeiros quadros.
- Nenhum `game.precompile()`. Só o `compileAsync` do `buildScene`, que compila a
  variante errada dos transparentes de duas faces e, no host, leva segundos
  (um objeto por quadro) — o defeito do ADR-0262.
- O `AGENTS.md` do projeto, lido pelas duas cabeças do Chat IA e por qualquer
  agente fora do Studio, não trazia nenhuma regra de performance.

Todo jogo novo começa copiando o template; corrigir aqui é corrigir na origem.

## Decisão

### `main.ts`

```
game.start()
game.setLoading(true)                 // o Game desenha cena vazia + UI
loading = createLoadingScreen(game.ui) // opaca: esconde o quadro de aquecimento
try {
  buildScene(..., { precompile: false, onProgress → barra })
  // ← aqui: criar o que o jogo só cria no uso (efeitos, projéteis, pools)
  await game.precompile()             // quadro real + coleta (ADR-0262, SPEC-0264)
} finally {
  loading.destroy(); game.setLoading(false)
}
```

- `precompile: false` no `buildScene`: o `game.precompile()` do fim cobre a cena
  inteira do jeito certo; o `compileAsync` do build seria segundos de trabalho
  errado em segundo plano.
- No editor (F2) a tela não aparece: editar um script recarrega a página, e um
  overlay a cada reload atrapalha (mesma regra do `runWithLoadingScreen`).
- `game.maxFps` fica como linha comentada com a explicação — o teto é escolha
  do jogo (ADR-0257), não do template.

### `AGENTS.md`

Seção nova **"7. Performance: regras medidas"**, com as mesmas regras de
`electron/agent/performanceRules.ts`: material e não triângulo; aquecer depois
de criar; pool em vez de criar no uso (e `InstancedMesh`); segundo caminho de
render é outro aquecimento; teto de fps do jogo.

## Consequências

- Teste: o `main.ts` do template monta a cena sob `setLoading`, com
  `precompile: false`, chama `game.precompile()` depois do `buildScene` e libera
  o carregamento num `finally`; o `AGENTS.md` traz cada regra de performance —
  checado contra os mesmos conceitos da fonte do Chat IA, para as duas não
  divergirem.
- Projetos criados antes desta spec não recebem nada automaticamente (a mesma
  dívida já registrada no ADR-0191 para o `AGENTS.md`).
