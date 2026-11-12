# SPEC-0726 - Efeito de tela embaixo d'água

**Data:** 2026-11-12
**Status:** em andamento (este PR traz o lado nativo: `__cortexUnderwater`, o uniform e o blit do host. Falta a
API TypeScript: `Renderer.setUnderwater`, o `UnderwaterPass`, o `PostFX` e a bancada `examples/underwater/`, no PR
empilhado)
**Decisão:** ADR-0727

## Contexto

Quando a câmera desce abaixo da lâmina d'água, o jogo quer o efeito de tela de mergulho, na linha do GTA San Andreas:
imagem tingida pela cor da água, mais escura com a profundidade (preta a uns 90 m) e ondulando em faixas
horizontais. A referência de mecânica é `fase = tempo_ms·0,0015 + y·0,04`, com amplitude de ~4 px numa tela de
640×448. A intensidade de 0 a 1 faz a entrada e a saída suaves. O efeito tem de rodar no navegador e no export
nativo, sem distorcer a HUD/UI e sem custo quando desligado.

## Decisão

### API pública (`cortex-game-engine`)

```ts
game.renderer.setUnderwater(state: UnderwaterState | null): void
game.renderer.underwater: Readonly<ResolvedUnderwater> | null   // o estado aplicado (null = desligado)

interface UnderwaterState {
  amount: number;              // 0..1: intensidade (0 desliga, custo zero)
  color?: number | string;     // cor da água em tela (sRGB): 0x5aaaaa ou '#5aaaaa'. Padrão 0x5aaaaa
  tint?: number;               // 0..1: quanto a cor da água cobre a imagem. Padrão 0.55
  depth?: number;              // metros da câmera abaixo da lâmina. Padrão 0
  blackDepth?: number;         // profundidade em que a tela fica preta. Padrão 90
  ripple?: UnderwaterRipple | false;  // false = sem ondulação
}
interface UnderwaterRipple {
  amplitude?: number;  // deslocamento horizontal máximo, em fração da largura da tela. Padrão 0.00625 (4/640: 4 px em 640)
  frequency?: number;  // radianos por altura de tela (fase por y). Padrão 17.92 (0,04 rad/px × 448 px)
  speed?: number;      // radianos por segundo (fase por tempo). Padrão 1.5 (0,0015 × 1000)
}
```

Também saem do índice: `resolveUnderwater(state)` (o estado resolvido, puro), `underwaterRippleOffset(resolved, y,
segundos)` (a fase é `segundos·speed + y·frequency`, calculada por dentro) e `applyUnderwaterColor(rgb, resolved)`, que são os espelhos em CPU da matemática do shader, para teste e
para quem quiser reproduzir o efeito. Também saem as constantes `UNDERWATER_DEFAULTS`.

### Semântica

- `resolveUnderwater` limita `amount` e `tint` a [0, 1], converte a cor para `[r, g, b]` em 0..1 (sRGB) e calcula
  `brightness = 1 − clamp(depth / blackDepth, 0, 1)`, quantizado em degraus de 1/256 (a saída é de 8 bits, o
  degrau não se vê). `blackDepth ≤ 0` vira o padrão. Sem ondulação, a amplitude é 0.
- `setUnderwater(null)`, ou um `amount ≤ 0`, desliga. `renderer.underwater` volta a `null`.
- Por pixel, nos dois alvos, com `uv` top-down (y = 0 no topo da tela):
  - `fase = tempo·speed + uv.y·frequency`;
  - `uv' = (uv.x + sin(fase)·amplitude·amount, uv.y)`, e a cena é amostrada em `uv'`. A UI é amostrada sem
    deslocamento;
  - em espaço de tela, depois do tone mapping: `tinta = mix(c, cor, tint)·brightness` e
    `saída = mix(c, tinta, amount)`.
- O jogo pode chamar `setUnderwater` em todo quadro. O nativo só atravessa a ponte quando o estado resolvido muda.
  Com o `brightness` quantizado, uma câmera descendo devagar muda o estado a cada ~0,35 m (90 m / 256), não a cada
  quadro; durante a rampa de entrada ou saída o `amount` muda e a ponte é chamada todo quadro, só por esses poucos
  quadros.
- A primeira chamada de um `UnderwaterPass` sempre atravessa a ponte, e o `Renderer.dispose` manda `null` ao host: o
  estado do C++ é global e sobreviveria a um `Renderer` novo (troca de jogo ou reload no mesmo contexto).
- Desligado, o uniform `amount` do navegador vai a 0, porque o grafo do `PostFX` lê os uniforms direto. No host
  nativo os uniforms ficam sempre zerados (nascem com `amount` 0 mesmo depois de `setUnderwater`): o efeito é do blit
  do host, e o grafo de um `PostFX` não aplica a água uma segunda vez.

### Navegador (`src/core/UnderwaterPass.ts`)

- O `Renderer.render` pergunta ao `UnderwaterPass` se o efeito está ligado. Se não está, segue o render direto (nem
  o pipeline existe). Se está, cria na primeira vez um `RenderPipeline` com `pass(cena, câmera)`, a amostra deslocada,
  o `renderOutput` e a tinta, com `outputColorTransform = false`, e renderiza por ele. A cena e a câmera do pass são
  trocadas a cada chamada.
- O `PostFX` monta o mesmo deslocamento e a mesma tinta no grafo dele, com os uniforms do `Renderer`. A tinta entra
  depois da vinheta (e antes do FXAA), na ordem do composite do host (vinheta → tone map → tinta): a cor da água cobre
  a imagem já vinhetada nos dois alvos. A opção
  `underwater` vem **ligada por padrão**: no nativo o blit aplica o efeito com ou sem `PostFX`, e o Studio tem de
  mostrar o mesmo que o export. Com `amount` 0 a saída é idêntica, ao custo de um `sin` e um `mix` por pixel num
  passe que já é de tela cheia; `underwater: false` tira os nós do grafo (e o efeito do navegador). Com o `PostFX`
  dono do quadro, o `Renderer.render` não entra no caminho.
- O `Renderer.dispose` libera o pipeline e a RT do pass e, no host, desliga o efeito.

### Nativo

- `__cortexUnderwater(params | null)` (`native/src/webgpu/underwater.cpp`) recebe o estado resolvido em campos
  planos (`amount`, `tint`, `brightness`, `amplitude`, `frequency`, `speed`, `r`, `g`, `b`). `null` desliga.
- `underwater_params.{h,cpp}` (puro, testado no `cortex_host_tests`) empacota o uniform de 48 B. A fase vem do
  relógio do host (`fmod(segundos·speed, 2π)`), e `amount` fica limitado a [0, 1].
- O `blitToSwapchain` liga o uniform nos dois pipelines (binding 5 nos dois, LDR e HDR). O shader desloca a UV da
  cena (e do bloom no HDR), aplica a tinta depois do OETF e compõe a UI com a UV original. O uniform só é escrito
  quando o efeito está ligado, ou uma vez ao desligar.
- O efeito só aparece onde o blit final roda: com o compositor de UI (todo jogo com UI de runtime), SSAA ou o
  composite HDR. Um jogo sem nenhum dos três desenha direto na swapchain e não recebe o efeito (ver ADR-0727).
- Os shaders do blit saem do `supersample.cpp` (541 linhas) para `blit_shaders.cpp`.

### Aquecimento

No navegador, o caminho embaixo d'água é outro caminho de render. O jogo o força no carregamento:

```ts
await game.precompile();                     // caminho normal
game.renderer.setUnderwater({ amount: 1 });  // força o caminho do efeito
await game.precompile();
game.renderer.setUnderwater(null);
```

No nativo é o mesmo pipeline do blit, sem aquecimento extra.

### Controles

Não há ação nova do jogador: o efeito é ligado pelo jogo a partir da câmera.

## Consequências

- O jogo calcula `amount` e `depth` pela câmera (por exemplo, `camera.y < nível da água`, com uma rampa para a
  entrada) e chama `setUnderwater` no update. Névoa curta e física da água continuam no jogo.
- O `renderViewport` (split-screen) não aplica o efeito.
- Testes: `tests/core/underwater.test.ts` (resolução, matemática e ponte nativa) e
  `tests/core/RendererUnderwater.test.ts` (roteamento do `Renderer` com o `UnderwaterPass` real) e
  `tests/core/UnderwaterPass.test.ts` (uniforms ao desligar, pipeline do navegador, ponte na primeira chamada e no
  `dispose`, quantização e a opção `underwater` do `PostFX`). No nativo, `native/tests/underwater_test.cpp`.
