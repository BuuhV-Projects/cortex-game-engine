# SPEC-0292 - Caminho do transcoder KTX2 no Studio

**Data:** 2026-10-03
**Status:** aceito

## Contexto

No Studio (Vite dev), a fase 2 do crash-bandicoot-racer ficava em
"Cenário: 0/120 objetos · 13 modelos carregando" até o timeout de 120 s e
mostrava "Não foi possível carregar a fase". Os LODs do mapa são os primeiros
GLBs do jogo com textura KTX2 (`KHR_texture_basisu`).

`loadKtx2Browser` passava `new URL('./basis/', import.meta.url).href` ao
`KTX2Loader.setTranscoderPath`. O Vite reescreve esse `new URL` e devolve a
pasta **sem a barra final** (`.../cortex-game-engine/basis`). O three concatena
o nome do arquivo direto, então pedia `.../basisbasis_transcoder.js`. O
fallback de SPA do Vite responde esse caminho com o `index.html` (200), o worker
recebe HTML, quebra sem avisar e a promessa do `loadGLTF` nunca resolve.

O mesmo `debug('scene', 'outlineCull: …')` do `Game` imprimia `0/0` a cada
intervalo em cenas sem cascas de contorno (menu), poluindo o console do Studio.

## Decisão

- `loadKtx2Browser` garante a barra final no caminho do transcoder antes de
  passá-lo ao `KTX2Loader` (vale para Vite dev, build e caminho já correto).
- O log `outlineCull` só sai quando a varredura avaliou ao menos uma casca.

## Consequências

- Textura KTX2 volta a carregar no Studio; a fase 2 carrega normalmente.
- Host nativo não muda (usa o transcoder C++).
- Jogo que usa a engine vendorizada precisa re-vendorizar para receber a correção.
