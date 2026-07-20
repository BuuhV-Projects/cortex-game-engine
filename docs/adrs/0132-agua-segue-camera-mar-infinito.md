# 0132 - Água segue a câmera (mar "infinito")

**Data:** 2026-07-20
**Status:** aceito

## Contexto

O nó `water` (`src/scene/Water.ts`) é um **plano finito** (lado `size`, default
`400`) fixo no origin do mundo — o próprio nó nem lê `x/z`, sempre centra em
`(0,0)`. Serve como "mar" das cenas de ilha/plataforma (teste4). Como o plano é
finito e fixo, quando o jogador se afasta do centro a **borda quadrada** do plano
aparece no horizonte: uma linha reta onde a água termina abruptamente, quebrando a
ilusão que o skybox cria.

O fog escondia parcialmente (teste4: `far: 195`), mas com o plano parado a borda
(a `±size/2 = ±200` do origin) entra no campo de visão assim que o jogador anda o
suficiente para um lado — e `200 ≈ far`, então a linha reaparece.

## Decisão

A água passa a **seguir a câmera no XZ**: a cada `Water.update()` o plano
re-centra em `(camera.x, camera.y_da_água, camera.z)`. Assim a borda fica **sempre**
a `size/2` da câmera (≥ 200 com o default), constante, e some atrás do fog em todas
as direções — o mar parece infinito sendo finito. É a mesma técnica que o
`Background` (backdrop 2D) já usa.

- **Cáusticas ancoradas ao mundo:** seguir a câmera arrastaria a textura junto com o
  plano (as cáusticas "grudariam" na tela). A UV compensa a posição do plano medida
  em tiles: `offset += planoXZ / tileWorld` (com `tileWorld = size / repeat`), sinais
  deduzidos da rotação `-PI/2` em X do mesh (`world_x ← +u`, `world_z ← -v`). Some
  ao fluxo animado existente.
- **API:** `WaterOptions` ganha `camera?` e `follow?` (default `true` quando há
  câmera) e `size?`. O nó `water` do `level.json` ganha `size?` e `follow?`
  (data-driven — `follow: false` = água fixa pra lago/poça). O `SceneBuilder` passa
  `options.camera` (já disponível, usado pelo `background`) para a `Water`.
- **Compatibilidade:** construção direta `new Water(scene, {...})` sem `camera`
  continua idêntica (plano fixo). Só a água criada pelo `buildScene` (que tem a
  câmera) passa a seguir — e como o nó nunca teve `x/z`, sempre foi um mar de cena
  inteira, então seguir é estritamente melhor.

## Consequências

- A borda do plano d'água some do horizonte em qualquer cena com fog razoável, sem
  precisar aumentar `size` (mantém a escala das cáusticas de projetos como o teste4,
  que fixaram `repeat: 8` esperando `size 400`).
- `follow` é opcional e ligado por padrão: uma poça/lago fixo num ponto do mundo
  precisa de `follow: false` no nó (hoje nenhum projeto usa água assim).
- Custo por frame desprezível (duas atribuições de posição + um `offset.set`).
- Limitação: continua uma água plana barata (sem reflexão/refração/ondas reais) —
  ver Water 2.0 (shader TSL) no roadmap. Este ADR resolve só a borda visível.
