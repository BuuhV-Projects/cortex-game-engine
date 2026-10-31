# SPEC-0645 - `outdoorLighting` no host nativo: ACES no composite, ambiente no hemisfério

**Data:** 2026-10-31
**Status:** aceito

Decisão e alternativas: ADR-0644. Débito de origem: SPEC-0643 (hook do contrato do export nativo).

## Contexto

No host com o renderer próprio (ADR-0605), o `outdoorLighting` mandava a cena inteira para o three em JS (ACES no
renderer do three, `AmbientLight`, `scene.environment`). No navegador/Studio o visual tem de ficar igual a hoje.

## Decisão

### Quando adapta

`adaptsOutdoorLightingToNativeHost()` = host expõe o composite (`__cortexBloom`, `nativePostFXHost()`) **e**
`nativeRendererRequested()`. Fora disso (navegador, Studio, `?nativeRenderer=0`) o preset é o de sempre.

### O que muda no host

1. **ACES no composite.** `setupOutdoorLighting` não liga `ACESFilmicToneMapping` no three e chama
   `enableNativeToneMapping(exposure)` (`src/core/nativePostFX.ts`): configura o composite do host sem bloom e sem
   vinheta (`strength: 0`, `vignette: false`) e marca o "tone mapping do preset" ativo. Com ele ativo,
   `Renderer.render` desenha a cena na RT HDR (`renderSceneHDR`, já com tone mapping do three desligado) e entrega a
   textura ao host (`__cortexSceneHdr`) — o mesmo caminho do `PostFX` nativo. Sem textura (backend não pronto), cai
   no render normal. Vale para todo `renderer.render` do jogo, como o ACES do three valia.
   - Se um `PostFX` já é dono do composite (jogo o criou antes), o preset não mexe: o composite dele já faz ACES.
   - Um `PostFX` criado depois assume o composite (`configureNativePostFX`) e desliga a marca; `game.setPostFX(null)`
     / `game.reset()` (`resetNativePostFX`) também desligam. A fase seguinte religa no seu `buildScene`.
2. **Ambient no hemisfério.** O `AmbientLight` não entra na cena; `cor·intensidade` dele é somado ao céu e ao chão do
   hemisfério (`foldIntoHemisphere`: `cor = cor·I + fill`, `chão = chão·I + fill`, `I = 1`). O hemisfério dá
   `mix(chão, céu, w)`, então somar a mesma constante às duas pontas soma a constante em todo `w` — difuso idêntico.
3. **Environment uniforme no hemisfério.** No caso padrão do `buildScene` (sem `hdri`, `skyTop/Middle/Bottom`, nem
   `environment: false`), em vez do `Skybox.fromGradient` uniforme, soma `céu · k · π` ao hemisfério
   (`uniformEnvironmentFill`, `k = skyGradientIntensity ?? 0.5`). O π vem do three: o `EnvironmentNode` multiplica a
   irradiância por π e o modelo divide por π (`cosineWeightedIrradiance`), enquanto ambient/hemisfério entram como
   irradiância e passam por `BRDF_Lambert` (÷π) — no three e nos modelos nativos (`lambert.ts`/`standard.ts`). Perde-se
   só o especular do céu uniforme e o fator `1 − F` (~4 % em dielétrico).
4. Céu não uniforme (HDRI, degradê, `skybox` com `skyboxLighting`) segue igual: o environment fica e o renderer próprio
   recusa (débito; o hook da SPEC-0643 mantém a regra só para esses campos).

### Retorno

`setupOutdoorLighting` continua devolvendo `{ sun, hemisphere, ambient }`; no host `ambient` volta fora da cena (só
para não quebrar quem o lê) e o `hemisphere` já tem o ambiente somado.

O total somado (ambient + environment uniforme) fica em `hemisphere.userData['cortexAmbientFill']` (`Color`, RGB
linear, acumulado a cada `foldIntoHemisphere`; constante `AMBIENT_FILL_KEY`). Quem reescreve `color`/`groundColor`/
`intensity` do hemisfério em runtime (ex.: clima/dia-noite do jogo) deve reaplicar `cor·I + fill`, `chão·I + fill` e
`intensity = 1` — senão o ambiente some no host. Fora do host a chave não existe (o `AmbientLight` está na cena).

### Hook do template

Sai a regra "outdoorLighting sem adaptação no host" (`adapted`/`__cortexBloom`); entra "environment não uniforme"
(`hdri`, `skyTop`, `skyMiddle`, `skyBottom`, `skyboxLighting` no `outdoorLighting`). Template novo: 0 erros, 0 débitos.

### Teste

`tests/scene/NativeOutdoorLighting.test.ts`: com host falso (`__cortexBloom`/`__cortexSceneHdr`) e
`setNativeRendererDefault(true)`: sem ACES no three, composite chamado com `strength 0` e a exposição, nenhum
`AmbientLight` na cena, hemisfério com o fill; `Renderer.render` roteado para o sink; sem host = preset de sempre.

## Consequências

- O jogo não precisa mais adaptar no código (o `game/nativeTone.ts` do Port Hollow vira redundante; ele soma o
  environment sem o π, ~3× mais fraco que o three nesse termo).
- `ambient.intensity`/`hemisphere.intensity` ajustados em runtime têm outro efeito no host (ver ADR-0644).
