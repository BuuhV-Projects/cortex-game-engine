# SPEC-0653 - O aquecimento passa pelo renderer próprio no host (espelho na carga, mapa de sombra antes)

**Data:** 2026-11-01
**Status:** aceito

## Contexto

Depois da SPEC-0652, o export do Port Hollow parava de responder logo depois da carga: ~1 núcleo ocupado, janela sem
resposta e o processo crescendo de 1,7 para 5,7 GB em 5 min, sem erro. A última linha do log era o clima; o próximo
passo do `main.ts` é o `game.precompile()`. Um perfilador temporário de métodos no quadro de aquecimento mostrou:

- `device.createRenderPipeline`: **53,5 s em 182 chamadas (~290 ms cada)** em ~60 s de quadro, com só 565 dos ~12 mil
  objetos projetados desenhados — o aquecimento levaria muitos minutos;
- quem desenhava era o three em JS; o renderer próprio (ADR-0605) **não recebeu nenhum objeto** (`taken: 0`,
  `refused: 0`). O `InstancedMesh` do three gera um shader por contagem de instâncias, então os 744 nós da mata viram
  centenas de pipelines.

Causa: `Game._installSceneMirror` não instala o espelho enquanto `setLoading(true)`, e sem espelho não há projeção em
C++ nem renderer próprio. O template e o Port Hollow chamam `game.precompile()` DENTRO do `setLoading(true)` (é o que a
doc do `precompile` pede: aquecer sob a tela de carregamento). Então o quadro de aquecimento sempre passava pelo three.

## Decisão

- `_installSceneMirror(warmup)` decide por `canInstallSceneMirror` (`src/core/sceneMirrorGate.ts`, puro): no quadro de aquecimento (`precompile`, pelo tick ou antes do `start()`), o
  `_loading` não impede a instalação. A cena já está montada (`isSceneBuilding` continua barrando) — é a premissa do
  `precompile`. Fora do aquecimento nada muda: a carga segue sem espelho, como na SPEC-0219.
- No tick, a instalação do quadro de aquecimento acontece antes do `update` do espelho, na mesma ordem de sempre
  (instala, atualiza, desenha).
- Objetos criados depois do aquecimento entram pelo `appendNodes` do espelho, como os criados depois do `start()`.

- **Mapa de sombra antes do quadro revelado.** Com o espelho, o renderer próprio passou a receber a cena (2632
  objetos, 30 pipelines em 3,4 s), mas o three ainda criava ~230 pipelines (~64 s) no passe de SOMBRA: o
  `NativeSunShadowPass` devolve o quadro ao three com `motivo=sem-mapa` quando o mapa do sol ainda não existe — e o
  three só cria o mapa (e a textura na GPU) no seu primeiro passe de sombra, que no aquecimento pegava a cena inteira
  revelada (744 `InstancedMesh` da mata, um shader por contagem de instâncias). No host, o aquecimento desenha antes um
  **quadro de preparo com todo `castShadow` desligado** (`withoutShadowCasters`, `src/core/WarmupFrame.ts`): o three
  cria o mapa vazio, sem caster e sem pipeline; no quadro revelado o C++ já assume a sombra. Fora do host nada muda.

## Consequências

- O aquecimento passa a desenhar pelo renderer próprio no export, como o primeiro quadro do jogo — e aquece os
  pipelines que o jogo vai usar de fato (os do three que sobram são só os objetos que o C++ recusa).
- Testes: `tests/core/sceneMirrorGate.test.ts` — durante a carga só o aquecimento instala; nunca no meio da
  montagem. `tests/core/WarmupFrame.test.ts` — o preparo roda sem casters e devolve cada `castShadow`.
- Prova no export do Port Hollow na seção de validação.
