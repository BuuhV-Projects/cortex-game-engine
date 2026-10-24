# SPEC-0475 — Dado global de luz e de cena para o renderer nativo (registro de desenho)

**Data:** 2026-10-24
**Status:** registro de desenho, **sem código** — insumo da sessão `renderer-nativo`
(renderer próprio em C++ sem o `three` no export, decisão do usuário em
2026-10-24). Item 2 da finalização do RenderingServer (ADR-0404).

## Por que este registro existe

O que sobrou do custo de render no export do DDD 61, depois do RS1, da
`DynamicLighting` (SPEC-0435) e do filtro de sombra compartilhado (SPEC-0445), é
**trabalho por estado de shader** que o `three` faz por desenho, e não por
quadro. Medido com a sonda de relógio (temporária), andando no Comercial:

| item | custo | causa no `three` 0.184 |
| --- | --- | --- |
| nós de render por estado | ~0,8–1,1 ms/quadro | cada `NodeBuilderState` tem as próprias instâncias de nós de câmera/luz/tempo, conferidas por estado a cada render |
| grupos compartilhados por estado | ~0,3 ms (depois da SPEC-0445; antes ~1,8) | o grupo "render" é por estado; só é reaproveitado quando a lista de nós é idêntica |
| luzes como uniformes por estado | ~1,4–1,7 ms (removido pela `DynamicLighting`) | um nó por luz por material |
| sombra: filtro com uniformes por material | ~1,6 ms (removido pela SPEC-0445) | `reference()` dentro do corpo de um `Fn` |

Nenhum desses custos existe num renderer que faz como o Godot. Este registro
descreve o formato para o renderer próprio nascer sem eles.

## Como o Godot faz (commit `c8256a8`)

| dado | onde | frequência |
| --- | --- | --- |
| luzes (omni/spot/área) | `renderer_rd/storage_rd/light_storage.cpp:712-720` (storage buffers), `:729` e `:1267-1279` (`update_light_buffers`) | 1 escrita por quadro, array por tipo |
| luz direcional (com sombra) | `light_storage.cpp:1279` (`directional_light_buffer`) | 1 por quadro |
| luzes ativas por região | `renderer_rd/cluster_builder_rd.cpp:415`/`:438` | cluster montado 1× por quadro |
| dados de cena (câmera, tempo, névoa, ambiente) | `renderer_rd/storage_rd/render_scene_data_rd.cpp:70-74` (`update_ubo`), névoa `:221-232` | 1 UBO por vista |
| dados por instância | `renderer_rd/forward_clustered/render_forward_clustered.cpp:817` (`_fill_instance_data`), `InstanceData` em `.h:346` | storage buffer, 1 upload por lista |
| variantes | `render_forward_clustered.cpp:429-432` (`ShaderSpecialization`) | constantes de especialização |

## Formato proposto para o renderer nativo

1. **Grupo 0 — vista (1 UBO por câmera por quadro):** `viewProj` (e
   `view`/`proj` se o shader precisar), posição da câmera, tempo, névoa (cor,
   near, far — o DDD 61 muda em degraus: entra aqui, nunca por objeto),
   exposição/tone mapping, parâmetros da direcional (direção, cor, intensidade) e
   da **sombra** (matriz da luz, `bias`, `normalBias`, `intensity`, `mapSize`,
   `radius`) e o hemisfério/ambiente. Uma escrita por vista por quadro.
2. **Grupo 1 — luzes pontuais/spot (storage buffer por quadro):** array
   `{posição, alcance, direção, cone/penumbra, cor, decaimento}` + contagem; o
   shader faz laço até a contagem (como o `DynamicLightsNode`). Acender/apagar
   muda a contagem, **nunca a variante** (resolve a recompilação de ~700 ms do
   pôr do sol da SPEC-0150 do jogo). Cluster só quando a contagem justificar (o
   DDD 61 tem 8 spots).
3. **Grupo 2 — material (por material, imutável enquanto o material não muda):**
   cor, mapas, emissivo; reescrito só com delta de material.
4. **Instâncias (storage buffer por lista):** matriz de mundo (e normal) por
   instância; o JS manda delta de quem se moveu (o espelho já tem as matrizes —
   SPEC-0234/0322).
5. **Variantes:** por tipo de material × "recebe sombra" × "tem mapa", com
   constantes de especialização (provadas no naga/D3D12 — memória do M2).

## Armadilhas a não repetir (medidas nesta frente)

- Uniforme criado **dentro** de função de shader executada por material
  (`Fn` do TSL) multiplica o estado — SPEC-0445.
- Parâmetro de cena (névoa, luz) **no bloco do objeto** faz todo objeto ficar
  "sujo" quando a cena muda — SPEC-0425 (RS1a).
- Desenho fora da ordem de profundidade do sort quebra geometria **coplanar** —
  ADR-0404/SPEC-0425 (o DDD 61 tem peças coplanares de propósito).
- Bind group recriado por quem é dono dele deixa receita gravada velha — SPEC-0425.
- Instrumento de teto tem de manter o trabalho por estado de **todo** estado que
  o renderer desenharia — correção do ADR-0404.
- Getter via `super` no bundle do Hermes — ADR-0465.
