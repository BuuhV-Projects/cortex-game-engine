# ADR-0644 - `outdoorLighting` se adapta sozinho no host (ACES no composite, ambiente no hemisfério)

**Data:** 2026-10-31
**Status:** aceito

## Contexto

O preset `outdoorLighting` (`setupOutdoorLighting`, chamado pelo `buildScene`) liga três coisas que o renderer
próprio do export (ADR-0605) recusa, cada uma derrubando a cena INTEIRA para o three em JS:

- `renderer.toneMapping = ACESFilmicToneMapping` → recusa `toneMapping` (`NativeRenderer._take`);
- `AmbientLight` → recusa `lights:AmbientLight` (`frame/lights.ts`, o bloco só tem sol + hemisfério + spots);
- `scene.environment` (o degradê uniforme da cor do céu que o `buildScene` gera por padrão) → `lights:environment`.

O Port Hollow chegou a menos de 10 fps no export por isso e resolveu no próprio jogo (`game/nativeTone.ts`,
SPEC-0033 do jogo). Todo jogo novo herdaria o mesmo problema (o hook da SPEC-0643 o acusa como débito).

## Alternativas

1. **Ensinar o renderer próprio**: `toneMapping` no WGSL de cada modelo, um termo ambiente no `LightsBlock` e
   amostragem do environment (PMREM) nos modelos. Muda shader de todos os modelos, cria variante por tone mapping e
   exige o PMREM no host — e o ACES ficaria aplicado DUAS vezes no caminho com `PostFX` (o composite do host já faz).
2. **Adaptar no preset (escolhida)**: no host com o renderer próprio, o preset não liga nada disso:
   - ACES vai para o **composite do host** (o mesmo passe C++ do `PostFX` nativo, ADR-0147/0149), sem bloom;
   - ambient + environment uniforme viram uma **constante somada ao céu e ao chão do hemisfério**.

## Como o Godot faz

Godot 4 (`servers/rendering/renderer_rd/`, master):

- Tone mapping é **passe de pós separado**: `shaders/effects/tonemap.glsl:246` (`apply_tonemapping`), chamado por
  `renderer_scene_render_rd.cpp:455` (`_render_buffers_post_process_and_tonemap`, `tone_mapper->tonemapper` em :811).
  O shader de cena (`forward_clustered/scene_forward_clustered.glsl`) não tem tonemap: sai linear em HDR (:3183).
- Luz ambiente **não é luz** (o enum só tem directional/omni/spot, `rendering_server_enums.h:242`): é um uniform por
  cena no UBO (`scene_data_inc.glsl:62` `ambient_light_color_energy`), preenchido em
  `storage_rd/render_scene_data_rd.cpp:176-190`. Fonte Color/fundo de cor = **constante pura**; fonte Sky amostra o
  céu (`scene_forward_clustered.glsl:1762`).

Comparação: o nosso composite do host É o passe de tonemap separado (igual ao Godot); e o hemisfério do `LightsBlock`
já é um uniform por cena — uma constante somada às suas duas cores dá exatamente o ambiente de cor constante do
Godot, sem slot novo nem shader novo. A fonte Sky do Godot (amostrar o céu) é o caso que NÃO cobrimos: céu não
uniforme (HDRI, degradê, panorama com luz) continua recusado.

## Decisão

Alternativa 2, no JS da engine (`src/scene/NativeOutdoorLighting.ts` + `src/core/nativePostFX.ts`). Só vale com
`__cortexBloom` presente (host) **e** `nativeRendererRequested()` (`GameOptions.nativeRenderer` / `?nativeRenderer`).
`?nativeRenderer=0` volta tudo ao caminho do three, como antes. Detalhe em SPEC-0645.

## Consequências

- Difuso idêntico; perde-se o **especular** do céu uniforme (fraco nos materiais foscos que o preset mira).
- No host, `lights.ambient` volta fora da cena e `lights.hemisphere.intensity` passa a 1 com as cores já somadas:
  ajuste em runtime de `ambient.intensity` não tem efeito lá (documentado no TSDoc).
- Céu não uniforme segue como débito (o hook da SPEC-0643 mantém a regra só para esse caso).
- Se um dia o renderer próprio amostrar o environment (fonte Sky do Godot), este ADR é revisto.
