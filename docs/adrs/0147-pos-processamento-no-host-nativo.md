# 0147 - Pós-processamento roda no host nativo (bloom em C++), com o WGSL como fonte única

**Data:** 2026-07-23
**Status:** aceito

## Contexto

No export nativo, ligar o PostFX custava **~17 fps** no `teste4` (space-1: 58 fps
com bloom, 75 sem). Medições que mostram *onde* estava o custo:

| Experimento | Resultado | Conclusão |
|---|---|---|
| `CORTEX_RENDER_SCALE` 2.0 → 1.0 (¼ dos pixels) | FPS **igual** | não é fill rate |
| FXAA on/off (1 passada) | FPS **igual** | passada isolada é barata |
| bloom on/off (~12 passadas) | **17 fps** | o custo é a CONTAGEM de passadas |

O `BloomNode` do three faz uma pirâmide de 5 mips × 2 blurs separáveis ≈ 12
passadas. Cada uma, vinda do JS, paga travessia **JS→NAPI** (`setPipeline`,
`setBindGroup`, `draw`, `writeBuffer`) — e o host já era conhecidamente CPU-bound
em *encoding*, não em GPU (ver `docs/cortex-native/architecture.md`).

Alternativas pesadas:

1. **Nó de bloom próprio no engine com menos mips (3 em vez de 5).** Vale nos dois
   ambientes e não duplica nada, mas rende só ~4 passadas a menos (~5-8 fps): não
   fecha a distância pro mundo sem PostFX.
2. **Desligar o bloom no export.** Recupera os 17 fps, mas o brilho dos cristais e
   o halo da estrela *são* a identidade do Mundo 3 (SPEC-0011).
3. **Mover o pós-processamento pro host (C++).** Elimina a travessia por passada —
   ataca exatamente a causa medida.

## Decisão

**(3): o bloom e a vinheta passam a rodar em C++** (`native/src/webgpu/bloom.cpp`),
sobre o mesmo alvo offscreen que o SSAA já usava, encadeados no blit que já
existia (`supersample.cpp`). Não é um caminho novo de render: é o passe de
composição da UI (ADR-0105) ganhando mais trabalho — que era o precedente
arquitetural pra isso.

**O contrato é o do host, e o browser é quem se adapta.** O engine expõe
`__cortexBloom(config | null)` (ponte em `src/core/nativePostFX.ts`); o `PostFX`
detecta o host e delega, e no browser monta a cadeia TSL como antes. O jogo chama
o **mesmo** `new PostFX(...)` nos dois ambientes — nada de three vaza pra API.

**O WGSL é a fonte única da aparência.** `native/shaders/bloom.wgsl` guarda a
matemática (bright pass com joelho suave, downsample 13-tap, upsample tent 9-tap);
o CMake o embute num header (`configure_file` + `CMAKE_CONFIGURE_DEPENDS`) e o
backend de browser pode ler o mesmo texto via `wgslFn` do TSL. A **orquestração**
(pipelines, mips, encoding) é necessariamente diferente nos dois — é justamente
ela que sai do JS —, mas orquestração não faz a imagem divergir; shader faz.

Algoritmo trocado de gaussiano separável para **dual filter** (Call of Duty AW /
Unity URP): uma passada por nível em vez de duas, halo mais macio.

## Consequências

- **space-1 no export: 58 → 75 fps com o bloom ligado** — o mesmo FPS de não ter
  bloom, e igual ao Mundo 1. O custo praticamente desapareceu.
- **O bloom nativo nasceu LDR** (operava sobre a imagem já tonemapeada pelo JS),
  enquanto o do browser é HDR (antes do ACES) — o que deixava o brilho do export
  **mais fraco** que o do Studio. ⚠️ **Armadilha:** o formato do offscreen é **do
  three**, não do host — ele monta os pipelines com o formato da canvas, e trocar
  o offscreen pra `RGBA16Float` dá `pipeline targets are incompatible with render
  pass` (o wgpu panica). **Resolvido no ADR-0149**, pela rota que este ADR já
  antecipava: o JS renderiza a cena numa RenderTarget HDR própria e entrega a
  textura ao host (como a UI faz na ADR-0105), que faz bloom + ACES em HDR. Agora
  o export bate com o Studio.
- **Duas implementações de orquestração** pra manter (C++ e TSL). Mitigado pela
  fonte única do shader; ainda assim, mexer no visual exige conferir os dois.
- O tone mapping **continua no JS**, então nenhuma cor mudou nos mundos que não
  usam bloom — a mudança é opt-in por fase (`postfx: true`).
- Ganhamos de graça: a vinheta virou matemática dentro do passe de composição que
  já rodava (zero passada extra).
- ⚠️ `Game.setPostFX(null)` agora **precisa** desligar o host: o estado vive no C++
  e sobreviveria à troca de fase.
- ⚠️ A ponte mora em `src/core/nativePostFX.ts`, **sem importar three**, de
  propósito: quando ela morava no `PostFX.ts`, o `Game` passou a arrastar
  `three/webgpu` e **os 113 arquivos de teste quebraram** ao importar em Node.
