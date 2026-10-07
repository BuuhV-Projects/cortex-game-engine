# SPEC-0325 — Refresh por `renderId`: só o que é por render

**Data:** 2026-10-07
**Status:** aceito

Estende o padrão do ADR-0290 (`TransformOnlyRefresh`). Frente R2-B2 do ciclo
"75 fps no export nativo do DDD 61".

## Contexto

Medição R1b (engine `1143723d`, DDD 61, export release): ~99 render objects por
quadro refazem o refresh completo (~5,6 ms: `bindings.updateForRender` 2,76 +
`nodes.updateForRender` 1,60 + `geometries.updateForRender` 1,26). **72,6** deles
por quadro têm o motivo `renderId`.

No `three` 0.184, `NodeMaterialObserver.needsRefresh`:

```js
if (hasNode || hasAnimation || firstInitialization || needsVelocity) return true;
if (this.renderId !== nodeFrame.renderId) { this.renderId = nodeFrame.renderId; return true; }
if (static || bundle) return false;
return !equals(...);
```

O monitor é o do `NodeBuilderState` (um por material + luzes + contexto). O
**primeiro** render object de cada monitor em cada `render()` refaz tudo, e o
teste vem antes do `equals()`. Os objetos 2..N do mesmo monitor só refazem se o
`equals()` ver mudança. Com material exclusivo (o caso do DDD 61) **todo** objeto é
"primeiro", então todos refazem em todo quadro, mesmo sem nada ter mudado.

### O que o refresh do primeiro objeto realmente garante

Lendo o fluxo (`_renderObjectDirect` → `updateBefore` → `geometries` → `nodes` →
`bindings` → draw → `updateAfter`):

1. **Trabalho por render, compartilhado:** nós de update `RENDER`/`FRAME` (câmera,
   luzes, `shadowMatrix`, exposição; deduplicados por `renderId`/`frameId` no
   `NodeFrame`), os bind groups **compartilhados** (`render`/`frame`, cacheados
   por contexto + conjunto de uniforms; reescritos quando a versão do
   `UniformGroupNode` sobe) e os `updateBefore` do passe (mapa de sombra, PMREM;
   deduplicados por `renderId`).
2. **Trabalho do objeto:** nós `OBJECT` reavaliados (matriz, normal, referências
   de material, matriz de UV de `TextureNode`, `onObjectUpdate` como
   `materialEnvIntensity`), UBO do objeto comparado e escrito, texturas e
   samplers rechecados e geometria rechecada.

O `equals()` vigia a matriz, as propriedades de `refreshUniforms` (texturas por
`id` + `version`), atributos/índice/drawRange, morph e luzes com mapa. Ele **não**
vigia a matriz de UV da textura (`offset`/`repeat` animados), nem os
`onObjectUpdate` que leem cena/câmera.

## Decisão

Novo wrapper `src/render/RenderIdRefresh.ts` sobre `renderer._nodes.needsRefresh`,
instalado **por fora** do `TransformOnlyRefresh`. Padrão: só no host nativo;
`?renderIdRefresh=0|1` sobrepõe (A/B).

Quando o render object é o primeiro do monitor neste `render()`
(`monitor.renderId !== frame.renderId`) e passa nos portões, o wrapper:

1. roda `nodes.updateBefore(renderObject)`, igual ao three (deduplicado);
2. busca o `NodeFrame` de novo, porque o `updateBefore` de sombra faz um
   `render()` aninhado que troca câmera/objeto do frame (o `renderId` é
   restaurado, os campos não);
3. atualiza os nós de update que **não** são `OBJECT` (deduplicados);
4. roda `bindings._update` só nos bind groups **compartilhados** do objeto;
5. marca `monitor.renderId = renderId` (o que o three faria) e chama o
   `needsRefresh` de dentro, que agora vai direto ao `static`/`equals()`:
   - `true` → refresh completo de sempre;
   - `false` com o objeto **andando** → o `TransformOnlyRefresh` já tratou;
   - `false` com o objeto **parado** → aplica o plano do ADR-0290
     (`buildTransformOnlyPlan`): reavalia os nós `OBJECT` exceto as referências
     de material vigiadas, compara os UBOs não compartilhados e escreve só o que
     mudou (um `writeBuffer` por UBO alterado; normalmente zero).

O que **deixa** de ser refeito para esse objeto são só as partes que o `equals()`
vigia: referências de material de `refreshUniforms`, texturas/samplers e
geometria. Na prática, o primeiro objeto passa a ser tratado como o three já trata
os objetos 2..N do mesmo material, **mais** os uniforms de objeto atualizados.

### Portões (delega ao three sem tocar em nada)

- `bundle`, `hasNode` (material com nós: `time`, `cameraPosition` em nó, highp
  `modelViewMatrix` etc. continuam refazendo todo quadro), `hasAnimation`
  (skinned), primeira vez do objeto e MRT de velocidade;
- `BatchedMesh`;
- `InstancedMesh` **quando `instanceMatrix.version` ou `instanceColor.version`
  mudou** desde o último refresh (e na primeira vez). O `equals()` não vigia essas
  versões, e só o refresh sobe o atributo instanciado (muitas instâncias) ou o
  buffer de uniform das matrizes (poucas). Parado e sem mudança de versão, o
  `InstancedMesh` entra no caminho novo; é o único caso em que um buffer não-UBO
  no grupo do objeto é aceito;
- `updateAfter` de qualquer tipo (rodaria só depois do draw de um refresh);
- `updateBefore` de `OBJECT` (rejeitado pelo plano do ADR-0290);
- buffer que não é UBO num grupo não compartilhado (storage/array), fora o das
  instâncias.

## Alternativas consideradas

- **Pular tudo** (só a parte 1, sem a 2). É o que o pedido sugeria ("monitor sem
  nós RENDER/OBJECT além dos de transformação"), mas quase todo material com mapa
  tem a matriz de UV de `TextureNode` (`OBJECT`), e o `materialEnvIntensity`
  lê `scene.environmentIntensity`. Pular tudo congelaria o UV scroll de material
  exclusivo parado (regra de animação das mecânicas). Classificar nó a nó para
  permitir só os "seguros" deixaria quase nenhum objeto no caminho rápido.
- **Comparar o UBO inteiro sem excluir nada.** Errado pela mesma armadilha do
  ADR-0290: referências de material são instâncias compartilhadas e guardam o
  valor do último material, então comparar sem atualizar a fonte escreveria a cor
  de outro objeto.
- **Patch no `NodeMaterialObserver`** (mover o teste de `renderId` para depois do
  `equals`). Some no próximo `yarn install` e não separa o trabalho por render do
  trabalho do objeto.

## Consequências

- Mesma dependência de internos do three 0.184 do ADR-0290, mais
  `renderer._bindings._update`, `nodes.updateBefore` e `monitor.renderObjects.has`.
  A instalação confere a forma e não instala se faltar algo.
- Limitação residual, a mesma do three para os objetos 2..N de um material: uma
  textura fora de `refreshUniforms` trocada/realocada sem mudar o cache key do
  render object não é rebindada enquanto o objeto estiver parado.
- `InstancedMesh` com poucas instâncias: o three reenviava o buffer de matrizes
  INTEIRO a cada refresh (`Buffer.update()` sempre `true`), mesmo sem mudança.
  Agora ele só sobe quando a versão muda, ou seja, exige `instanceMatrix.needsUpdate`
  (o caminho de muitas instâncias, por atributo, já exigia). Engine
  (`Particles`, `Vegetation`) e DDD 61 já marcam `needsUpdate`; `pracaRelogio` e
  `feira` escrevem só na montagem, antes do primeiro render.
- Dois `InstancedMesh` com o MESMO monitor: o segundo do render continua só no
  `equals()`, como já era no three (não vê a versão de instância).
- `stats` (`skipped`, `full`) do handle ficam disponíveis para a sonda.

## Validação

- Vitest (`tests/render/RenderIdRefresh.test.ts`): o objeto parado com material
  exclusivo não refaz e não escreve UBO; o trabalho por render (updateBefore de
  sombra, nó de câmera, grupo compartilhado) roda, com o frame re-buscado depois
  do `updateBefore`; o nó `OBJECT` que mudou (UV) é escrito; `hasNode`/buffer não-UBO/
  `updateAfter` delegam; `InstancedMesh` refaz só na primeira vez e quando a versão
  da matriz de instância muda e continuam refazendo; mudança de material cai no refresh
  completo; o objeto que anda passa pelo `TransformOnlyRefresh` sem o plano
  aplicado duas vezes.
- A/B no export release do DDD 61 (`.cortex/r2-b2/`): ver "Resultado".
