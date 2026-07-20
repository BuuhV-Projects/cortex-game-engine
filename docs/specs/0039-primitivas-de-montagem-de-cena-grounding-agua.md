# SPEC-0039 - Primitivas de montagem de cena: grounding, água e disciplina de validação

**Data:** 2026-06-05
**Status:** aceito (API de `placeOnGround` e `Water` refinada pelo SPEC-0040)

> **Atualização (SPEC-0040):** validando o fluxo num projeto real, a API evoluiu.
> `placeOnGround(obj, groundY)` (só Y) virou `placeOnGround(obj, { x, y, z, rotY,
> scale })` — centra horizontalmente e aplica rotação/escala, retornando `Bounds`
> (com `topY`); o módulo `Placement.ts` foi absorvido em `SceneAssets.ts` (que
> agrega `loadGLB`/`instance`/`setShadows`/`scatter`). O `Water` passou a usar
> `emissiveMap` + fluxo em 2 eixos. A disciplina de grounding/validação deste ADR
> segue valendo.

## Contexto

Uma sessão real do Chat IA montando a "fase 1" de um platformer (a partir de um
pacote de `.glb`) expôs um padrão caro: ~22 min e ~$8 gastos quase todos num loop
de tentativa-e-erro visual, dominado por **um único tipo de bug repetido ~8
vezes** — objeto flutuando/afundado ou conexão desalinhada (ponte, finish,
stepping stones, chevron, checkpoint, signboard...).

Causa raiz: a IA posicionava por `position.y` (e X/Z) **chutado**, e o pivô de
cada `.glb` é arbitrário. O `inspect_assets` (SPEC-0037) deu as dimensões, mas
saber a dimensão ≠ assentar no chão. O que finalmente resolveu foi a IA
**reinventar** no projeto um `placeOnGround` (mede bbox, encaixa a base no Y) que
também passou a retornar as bordas reais (`minX/maxX/...`) pra posicionar pontes
pelo gap medido entre ilhas.

Outros atritos da mesma sessão: a IA declarou "pronto" 3-4 vezes cedo demais
(fotos wide escondiam os bugs; só top-down/laterais/close-ups revelavam, e o
*usuário* teve que pedir esses ângulos); o engine não re-exportava
`Texture`/`RepeatWrapping` (cast `1000` na água); e o projeto não tinha
`tsconfig`, deixando `tsc --noEmit` inútil.

## Decisão

Absorver os aprendizados como primitivas do engine + disciplina no prompt, pra
não depender da IA reinventar a cada projeto:

1. **Helpers de grounding/bordas no engine** (`src/scene/Placement.ts`,
   exportados): `getWorldBounds(obj)` mede o bounding box em world space
   (`min/max/size/center` + escalares `minX/maxX/...`); `placeOnGround(obj,
   groundY)` desloca o objeto até a base da geometria ficar em `groundY`
   (independente do pivô) e retorna o `WorldBounds` reposicionado. Conectar peças
   passa a ser "medir bordas e derivar do gap real", não chutar coordenadas.

2. **Água experimental** (`src/scene/Water.ts`, classe `Water`): plano cartoon
   com cáusticas opcionais (textura tiled + offset animado via `update(dt)`).
   Generaliza a `utils/water.ts` que a IA fez no projeto. Aproximação visual
   barata — sem reflexão/refração/foam/ondas reais (esses exigiriam shader
   custom WebGPU/TSL).

3. **Re-exports de textura** no `index-runtime.ts`: `Texture`, `TextureLoader`,
   `RepeatWrapping`, `ClampToEdgeWrapping`, `MirroredRepeatWrapping` — elimina o
   cast do literal `1000` e o import direto de `three`.

4. **`tsconfig.json` + script `typecheck`** no template de projeto novo (espelha
   o dos exemplos: `paths` apontando pro vendor), pra `tsc --noEmit` funcionar.

5. **Disciplina no `AGENT_SYSTEM_PROMPT`**: (a) assentar SEMPRE por bbox
   (`placeOnGround`/`getWorldBounds`), nunca por `y` chutado, e conectar por
   bordas medidas; (b) **protocolo de validação obrigatório** antes de declarar
   "pronto" — top-down + 4 vistas laterais (360) + close-ups de cada conexão/
   objeto, porque foto wide/hero esconde flutuação e interseção.

A doc curada `engine-api.md` ganhou as receitas "Posicionar e conectar assets" e
"Água (experimental)", e a doc gerada (`docs/cortex-game-engine/api/`) foi
regenerada com `yarn docs:engine` (regra do CLAUDE.md ao mudar API pública).

## Consequências

- Toda cena nova pode assentar/conectar assets sem flutuação com uma chamada,
  em vez de iterar visualmente — ataca o bug mais caro do fluxo na origem.
- O `Water` é assumidamente básico/experimental; fica como ponto de partida, não
  como água final. Se ganhar tração, evolui pra shader TSL próprio.
- Mais superfície pública de API pra manter (Placement, Water, texturas) e doc
  pra regenerar a cada mudança.
- O protocolo de validação é instrução de prompt — reduz, mas não elimina, o
  risco de "pronto" precoce; depende de o modelo seguir. Caso persista, o passo
  seguinte é uma tool dedicada que capture o conjunto top-down/4-lados/close-ups
  num passe só.
- Relaciona-se com SPEC-0037 (inspect_assets dá os thumbnails+dimensões; estes
  helpers usam as dimensões pra assentar/conectar) e ADR-0033 (loop de playtest).
