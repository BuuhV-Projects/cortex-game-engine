# SPEC-0333 — Desenho nativo dentro do passe da cena (etapa (b) do ADR-0330)

**Data:** 2026-10-09
**Status:** rascunho de desenho — nenhum código ainda

## Contexto

Depois da etapa (a) (SPEC-0332) o passe principal do DDD 61 ainda gasta
**~55 µs por draw** em JS no Hermes: `_nodes` 2,6–3,3 ms, `backend.draw`
1,0–1,4, `_objects.get` 0,9–1,1, `_pipelines` 0,6–0,8 (R2b). A SPEC-0331 mediu
que, para os 89% de render objects que reaproveitam o quadro anterior, quase
tudo isso é **verificação** — o `three` não tem dirty flag de material, então
descobrir que "nada mudou" custa comparar uniforms, ~30 campos de estado de
pipeline e reavaliar nós de objeto.

## As duas formas de desenhar em C++, e a escolhida

| | **(b1) shaders próprios** a partir da `MaterialDesc` (plano original do M5) | **(b2) reproduzir a receita do `three`** |
| --- | --- | --- |
| o que o C++ desenha | pipeline/WGSL escritos à mão a partir da descrição | o MESMO `GPURenderPipeline`, bind groups, vertex/index buffers e parâmetros que o `three` usou no último quadro em que desenhou o objeto |
| paridade visual | tem de reproduzir luzes, CSM, névoa, tone mapping, color space, contorno — semanas, e o modo de falha é imagem sutilmente errada | **por construção**: é o mesmo shader e o mesmo dado |
| o que precisa saber | material inteiro | só **se o objeto está limpo** (nada que o `three` refaria mudou) |
| risco principal | paridade | detecção de sujo incompleta → uniform velho na tela |

**Escolha: (b2).** O custo por draw de uma receita em C++ é o do spike do
ADR-0232 (2,2 µs com setPipeline/setBindGroup/draw), e a paridade deixa de ser
um projeto. O que sobra é um problema de **sujeira**, e esse problema a SPEC-0322
já resolveu uma vez para transform: gancho na escrita.

## Desenho

1. **Gravação.** Quando o `three` desenha um render object pelo caminho normal
   (`backend.draw`), o JS registra no host a receita: pipeline, bind groups
   (por índice), index buffer + formato, vertex buffers, `drawParams`. Uma
   travessia de ponte por objeto **só no quadro em que ele foi refeito** — o
   caso raro (`rpRefresh` ~15/quadro).
2. **Sujeira de material (o que falta hoje).** Ganchos de escrita, no padrão
   dos de `position` (acessores compartilhados, sem closure por objeto), nas
   propriedades que o `NodeMaterialObserver` vigia (`refreshUniforms`) e nas de
   estado de pipeline (`transparent`, `side`, blend, depth, stencil…), mais
   `material.version` (o `needsUpdate`). Escrita = material sujo → todos os
   render objects dele voltam ao caminho do `three` naquele quadro (e são
   regravados). `Color`/`Vector2` vigiados recebem gancho nos componentes.
3. **Elegibilidade (recusa por objeto, nunca aproximação).** Fica no `three`:
   material com nó de update por quadro/render (`monitor.hasNode`/`hasAnimation`
   — UV scroll, emissivo animado, tempo), nó `onObjectUpdate` que não seja
   derivado só da matriz, `InstancedMesh` com `instanceMatrix` mudando, skinned,
   morph, `BatchedMesh`, transparentes (até a ordem ser validada por imagem),
   objeto que se moveu no quadro (o espelho sabe: `changedThisFrame`), e
   qualquer coisa que a gravação não reconheça.
4. **Uniformes de objeto.** Para objeto parado com câmera andando, os uniforms
   dependentes da câmera estão nos grupos COMPARTILHADOS (render/frame), que o
   `three` continua atualizando uma vez por render. A gravação confere isso: se
   o bind group de objeto contiver nó dependente de câmera, recusa.
5. **Onde desenha.** Dentro do passe da cena do `three`, na ordem da RenderList:
   o `_renderObjects` envia ao host, numa chamada, a sequência de receitas
   limpas intercalada com os objetos que o `three` desenha — o host emite no
   MESMO `GPURenderPassEncoder` (o `currentPass` do contexto), preservando a
   ordem e a oclusão (lição da SPEC-0241: fora da pass não funciona).
6. **Estado do encoder.** O `currentSets` do `three` (pipeline/bind groups/
   buffers correntes) fica inválido depois de uma sequência nativa; o host
   devolve o estado final ou o JS zera o cache antes do próximo draw do `three`.

## Critérios de aceite

- `cpu.render` cai pelo menos 3 ms no setorO e no comercial (A/B intercalado,
  export release), sem regressão no hélio dirigindo.
- Captura A/B (`?nativeMainPass=0|1`) sem diferença acima do limiar nos três
  pontos, incluindo um material com UV scroll e um objeto que troca de material
  em runtime.
- Studio inalterado (sem ponte, sem gancho).

## Riscos

| risco | mitigação |
| --- | --- |
| propriedade vigiada sem gancho → uniform velho | lista derivada do `refreshUniforms` do `three` + teste que falha se o `three` ganhar propriedade nova |
| gancho custa leitura em todo acesso de material | acessores compartilhados (medido barato na SPEC-0322); só em materiais de objetos elegíveis |
| `currentSets` dessincronizado → bind group errado | invalidar o cache do `three` após cada sequência nativa; teste com intercalação |
| bump do `three` muda a forma da receita | instalação recusa (como `TransformOnlyRefresh`) se os internos não baterem |
