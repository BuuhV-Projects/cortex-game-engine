# 0148 - Bloom nativo: contrato, passadas e como ajustar

**Data:** 2026-07-23
**Status:** aceito

Especifica **como funciona** o pós-processamento no host nativo. A *decisão* (por
que saiu do JS, alternativas pesadas, armadilha do formato) está no ADR-0147.

## Contrato (`__cortexBloom`)

Exposto pelo host em `native/src/webgpu/bloom.cpp` (`registerBloom`), consumido
pelo engine em `src/core/nativePostFX.ts`:

```js
__cortexBloom({
  strength, threshold, radius,   // bloom
  exposure,                      // informativo (o tone mapping fica no JS)
  vignette, vignetteIntensity, vignetteInner, vignetteOuter,
})
__cortexBloom(null)              // desliga
```

Chamado **uma vez por fase**, nunca por frame — quem chama é o `PostFX` (ao ser
construído) e o `Game.setPostFX(null)` (ao limpar). No browser a função não existe
e o `PostFX` monta a cadeia TSL de sempre; **o jogo escreve o mesmo código nos
dois** (`new PostFX(renderer, scene, camera, { bloom, vignette, … })`).

## As passadas (por frame, tudo encodado em C++)

Pirâmide a partir da **metade** do offscreen, até 5 níveis (para em lados < 8 px):

| # | Passada | Origem → destino | Blend |
|---|---|---|---|
| 1 | `fsBright` | offscreen → nível 0 | substitui |
| 2..n | `fsDown` (13-tap) | nível i → i+1 | substitui |
| n+1.. | `fsUp` (tent 9-tap) | nível i → i−1 | **aditivo** |
| final | composite | cena + bloom·strength → vinheta → UI | no blit que já existia |

O composite **não** é passada nova: é o mesmo blit de downscale+UI da ADR-0105,
com mais matemática. A soma do bloom acontece em **linear** (o shader decodifica o
sRGB da cena e reencoda no fim) — somar em gama escurece o halo e puxa as bordas
pro magenta.

## Onde mexer no visual

`native/shaders/bloom.wgsl` é a **fonte única** da aparência (ADR-0147). O CMake o
transforma em `bloom_wgsl.h` via `configure_file`, com `CMAKE_CONFIGURE_DEPENDS`
apontando pro `.wgsl` — editar o shader dispara reconfiguração sozinho, mas exige
**rebuild do host** (`cmake --build native/build`), não só re-exportar o jogo.

Parâmetros e o que fazem:
- `threshold` — luminância mínima pra brilhar. O corte tem **joelho suave** (rampa
  quadrática meia oitava abaixo): corte duro faz a borda do bloom piscar quando um
  pixel cruza o limiar com a câmera em movimento.
- `strength` — quanto do bloom entra na soma final.
- `radius` — raio do tent no upsample (espalhamento do halo).

## Build (pegadinha)

O `cmake` **precisa** rodar dentro do `vcvars64`: sem `VSINSTALLDIR` o subprojeto
Hermes não acha o DIA SDK e a reconfiguração falha com "DIA SDK not found" — o que
impede até adicionar arquivo novo ao build.

```bat
call "…\VC\Auxiliary\Build\vcvars64.bat"
cmake -S native -B native\build && cmake --build native\build
```

## Validação feita

- space-1/2/3, fase-1 e choco-1 no export: **sem erro**, todas a ~75 fps.
- Conferido por screenshot que o brilho aparece e que a fase renderiza inteira.
- ⚠️ Regressão pega no caminho: a 1ª versão chamava `threeRenderer.render()` cru e
  **pulava o `clear()`** que o `Renderer` do engine faz — o depth buffer do frame
  anterior ficava de pé e a cena renderizava **pela metade**, com peças sumindo.
  Sempre renderizar pelo `Renderer` do engine.
