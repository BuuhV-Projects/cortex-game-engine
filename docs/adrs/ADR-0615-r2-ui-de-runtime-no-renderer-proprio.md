# ADR-0615 — R2: a UI de runtime no renderer próprio lê a cena de UI do `RendererUiBackend` como dado

**Data:** 2026-10-26
**Status:** aceito (desenho da etapa R2.1 do PRD-0466). Base: ADR-0465 (renderer próprio), ADR-0102 (UI de
runtime), ADR-0105 (composição da UI em gama). Especificação: SPEC-0616.

## Contexto

No export do DDD 61 a UI de runtime (`UiLayer`) é desenhada pelo `three`: o `RendererUiBackend` monta uma
cena ortográfica (uma malha por caixa, imagem, texto e `<canvas>`, materiais TSL) e o
`Renderer.renderUiLayer` a desenha numa RT própria, que o host compõe sobre o jogo em gama
(`__cortexUiLayer`). É o último uso do `three` em todo quadro depois do R1 (o quadro 3D já é do renderer
próprio). A seção `ui` do perf-trace custa 2,0–2,4 ms por quadro no nativo a pé (`r1-accept3`); os ~33
`renderObject` do `three` fora da cena espelhada são da UI (SPEC-0585, passo 2).

O R2 do PRD-0466 pede um WGSL de UI (retângulo arredondado por SDF + gradiente + borda, imagem com máscara,
texto tingido do raster do host) atrás do `RendererUiBackend`.

## Decisão

**O renderer próprio desenha a mesma cena de UI que o `RendererUiBackend` já monta, lendo-a como dado.** O
backend continua dono do layout, do raster de texto, das texturas e da ordem (`renderOrder`); cada material
leva os seus parâmetros em `userData` (os mesmos uniforms do TSL). O `Renderer.renderUiLayer` (a fachada,
ADR-0465 §1) entrega a cena ao desenhista nativo em vez do `three` quando `?nativeUi=1`.

O desenho segue o canvas do Godot (SPEC-0616): um registro por quadrilátero num buffer de instâncias
gravado uma vez por quadro, lotes de quadriláteros consecutivos com a mesma textura e um draw instanciado
por lote. A fórmula de cada tipo é a do WGSL que o `three` 0.184 gera para aquele material (salvo pelo R0).

## Alternativas consideradas

- **Backend novo (`NativeUiBackend`) que emite quadriláteros direto dos widgets.** Sem cena intermediária,
  mas duplica o `_apply` do `RendererUiBackend` (layout, alinhamento do texto, sombra dura, "cover" da
  imagem, carga assíncrona, descarte adiado) — duas cópias do mesmo comportamento para manter em
  paridade. Rejeitada: o custo que importa é o desenho, não a cena (a cena só muda quando um widget
  fica sujo).
- **Manter o `three` só para a UI.** Não cumpre o critério do R2 (o `WebGPURenderer` não é instanciado no
  export do DDD 61) e mantém os ~2 ms. Rejeitada.
- **Polígonos na CPU para o canto arredondado (o `StyleBoxFlat` do Godot).** Mudaria a imagem (o SDF
  com `smoothstep` de 1,5 px é o que o Studio e o export mostram hoje). Rejeitada pela paridade.

## Consequências

- O `RendererUiBackend` ganha marcação de dados nos materiais, sem mudar o que o `three` desenha (o
  braço `three` continua para `?nativeUi=0` e para a paridade `?parityTarget=ui`).
- Enquanto o `WebGPURenderer` existir (até o fim do R2), as texturas da UI continuam subidas pelo upload
  do `three` (como no `NativeRenderer`); o desenhista recebe só "textura → (vista, sampler)" e troca de
  fonte quando o renderer próprio tiver upload próprio.
- Critério (1) do R2 (o `WebGPURenderer` não é instanciado) exige o renderer próprio como dono do quadro
  inteiro (pass, alvo, saída, texturas, device). Isso **não** está decidido aqui: as alternativas e o
  custo ficam na SPEC-0616 ("O que falta para o critério (1)").
