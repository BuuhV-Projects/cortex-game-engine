# SPEC-0246 — Contrato do `three` para o caminho de render nativo

**Data:** 2026-09-22
**Status:** aceito

## Contexto

O passe de sombra nativo (SPEC-0245) e o espelho de cena (SPEC-0234) não são
código independente do `three`: eles **substituem partes do `three` por dentro**
e, para isso, dependem de **premissas sobre o comportamento interno dele**.
Todas foram descobertas medindo ou lendo o código do `three` 0.184 ao longo dos
marcos M5/M6 — nenhuma está documentada como API pública, e nenhuma é garantida
pelo semver do `three`.

O problema é o **modo de falha**. Se o `three` for atualizado e uma dessas
premissas mudar, o sintoma é um **artefato visual**, não uma exceção:

- a sombra fica presa ao mundo de um frame antigo,
- aparece acne/peter-panning,
- o passe desenha na textura errada,
- o espelho perde um nó e o gate recusa (ou pior: aceita e desenha errado),
- as cascatas congelam sem que ninguém peça.

Artefato visual passa despercebido. Já passou nesta série: **as bandas da
SPEC-0234 passaram por uma captura** antes de alguém notar. E a SPEC-0240
registra o modo de falha irmão — um instrumento que responde "tudo igual" sem
olhar para a cena.

O dono do projeto resumiu o que falta: *"mudou o three, valida o nativo"*.

## Decisão

Um **contrato executável** em duas camadas, ambas na suíte normal
(`yarn vitest run`, que o pre-commit já roda). **Nenhum hook de git novo.**

### Camada 1 — testes de comportamento das premissas

`tests/native/three-contract.test.ts`. Cada premissa vira um teste que a
verifica **por comportamento** sempre que dá: monta o mínimo (um `Object3D`,
uma luz, um material, um `renderList` falso), executa o código do `three` e
observa o que ele fez. Só quando não há como observar de fora é que a premissa
é conferida por inspeção do módulo.

**A mensagem de erro é o produto.** Um `expect` que falha dizendo
`expected false to be true` não ajuda ninguém seis meses depois. Cada teste
falha dizendo três coisas: **qual premissa caiu**, **o que ela protege** e
**onde está o código nativo que depende dela**. Isso é feito com um helper
(`premissa(...)`) que formata a mensagem a partir de um registro único das
premissas — o mesmo registro que a camada 2 imprime.

### Camada 2 — trava de versão

O mesmo arquivo registra a versão do `three` **validada** contra estas
premissas. Um teste lê `node_modules/three/package.json` e falha quando a
versão instalada é diferente, listando as premissas a revalidar e como
atualizar a trava depois de conferir.

Consequência desejada: **atualizar o `three` obriga a passar por aqui**. A suíte
fica vermelha até alguém ler a lista, conferir o que mudou no `three` e mover a
trava conscientemente.

### Onde mora o número validado (e por quê)

O número fica numa **constante no topo do próprio arquivo de teste**
(`VERSAO_DO_THREE_VALIDADA`), não num arquivo de dados separado nem só na spec.

- **Não num arquivo de dados** (`.json`/`.lock`): um número solto num JSON é
  fácil demais de bumpar sem abrir o que ele protege. O que se quer é o
  contrário — que quem mexe na trava tenha as dez premissas na mesma tela.
- **Não só na spec:** a spec não executa. Uma trava que depende de alguém
  lembrar de ler um `.md` é a mesma falha silenciosa que esta spec existe para
  matar.
- **No teste:** o diff do commit que sobe o `three` mostra a trava mudando
  **no mesmo arquivo** que lista as premissas, e o revisor vê na hora se a
  lista foi revisitada ou se só o número andou.

## As premissas travadas

Para cada uma: o que ela é, o que quebra se deixar de valer, e quem depende.

| # | premissa | quebra se mudar | depende dela |
| --- | --- | --- | --- |
| 1 | `shadow.map.depthTexture` existe e tem `name === 'ShadowDepthTexture'` | A asserção do alvo para de valer. O alvo é obtido por **identidade** (`backend.get(...)`), e o rótulo é a conferência de que é o objeto certo. Sem ela, um dia o passe nativo escreve numa textura que não é o shadow map — corrompe outra coisa, sem erro. | `src/scene/OutdoorLighting.ts` (`ROTULO_DA_TEXTURA_DE_SOMBRA`, recusa `rotulo-inesperado:`) |
| 2 | o gate `shadow.needsUpdate \|\| shadow.autoUpdate` controla se o `three` renderiza a sombra | É **como o nativo desliga o passe do `three`**. Se o `three` passar a decidir por outro caminho, os dois passes desenham no mesmo alvo no mesmo frame (custo dobrado, e a imagem depende de quem escreveu por último) — ou nenhum desenha e a sombra some. | `OutdoorLighting._desenharPasseDeSombraNativo` (`cascata.shadow.autoUpdate = !assumiu`) |
| 3 | `LightShadow.copy` copia `autoUpdate` **no momento do clone** | O CSM clona a `shadow` da luz **por cascata** (`light.shadow.clone()` no `_init`). Mexer no original depois **não chega nas cópias**. Se o clone virar referência compartilhada — ou parar de copiar o campo — desligar o passe por cascata deixa de funcionar e volta a premissa 2. | mesmo ponto da premissa 2, e a medição de congelamento em `updateBefore` |
| 4 | o `three` desenha a sombra com o lado da face **invertido** (`material.shadowSide ?? _shadowSide[material.side]`, `FrontSide → BackSide`) | É o que justifica `cullMode = Front` no passe nativo. Se o `three` parar de inverter, o nativo passa a cortar a face errada: a profundidade sai da face de trás e aparece **acne e peter-panning** — artefato puro, sem erro. | `native/src/render/shadow_pass.cpp` (`pd.primitive.cullMode = WGPUCullMode_Front`) e o cabeçalho de `shadow_pass.h` |
| 5 | `castShadow` é filtrado **depois** da RenderList, em `getShadowRenderObjectFunction` — não em `_projectObject` | É a base da conta do M6: a maioria dos itens é percorrida, enfileirada e **descartada depois**, e é essa travessia que o passe nativo substitui (SPEC-0243/0245). Se o `three` passar a podar em `_projectObject`, o ganho do marco evapora e o enumerador do C++ passa a divergir da lista do `three`. | `NativeSceneMirror` (enumeração de casters), gate/`drawShadowPass` |
| 6 | `CSMShadowNode` só popula `this.lights` no `_init`, que roda no primeiro `setup` | Aplicar qualquer coisa nas cascatas antes disso **congela zero cascatas em silêncio** — foi exatamente o que aconteceu ao tentar congelar o passe na criação do nó. Todo acesso a `lights` tem de ser depois do primeiro `setup`, e é por isso que o código vive em `updateBefore`. | `CameraFollowingCSM.updateBefore` (congelamento, gate, passe nativo) |
| 7 | `lightShadowMatrix` só chama `updateMatrices` sozinho quando `castShadow !== true` **ou** `shadowMap.enabled === false` | Com o passe do `three` desligado, **ninguém mais chama `shadow.updateMatrices(luz)`** — e o uniforme que **amostra** o mapa congela, prendendo a sombra ao mundo de um frame antigo. Por isso o preparo nativo **tem** de chamar `updateMatrices` por cascata. Se o `three` passar a atualizar sozinho, a chamada vira redundante (aceitável); se o caminho mudar de forma, a sombra congela em silêncio. | `_desenharPasseDeSombraNativo` e `_relatarCastersNativos` (`cascata.shadow.updateMatrices(cascata)`) |
| 8 | `childadded`/`childremoved` são disparados em `add`/`remove`, e `attach`/`clear`/`copy`/`removeFromParent` desembocam neles | É **como o espelho acompanha a cena**. Um caminho de mutação que não dispare o evento deixa o espelho defasado: o gate recusa por divergência (melhor caso) ou aceita e o passe nativo desenha uma cena que não existe mais. | `NativeSceneMirror` (`addEventListener('childadded'/'childremoved')`) |
| 9 | `_projectObject` poda a subárvore em `visible === false` | O espelho replica essa poda. Se o `three` parar de podar (ou podar em outro ponto), o nativo e o `three` passam a desenhar conjuntos diferentes de casters — sombra a mais ou a menos, sem erro. | `NativeSceneMirror` (flag `SYNC_VISIBLE`, poda da travessia) |
| 10 | `PCFSoftShadowMap` **não** entra no ramo VSM | O passe nativo é depth-only e **só vale fora do VSM**: no VSM o `three` não inverte o lado da face (premissa 4) e passa a desenhar também os `receiveShadow`. O gate recusa quando `shadowMap.type === VSMShadowMap`; se `PCFSoftShadowMap` passasse a cair no ramo VSM, o gate aceitaria um caso que o passe nativo desenha errado. | gate (`vsmShadowMap`), `shadow_pass.cpp` |

## Consequências

- **Atualizar o `three` fica mais caro, de propósito.** A suíte quebra na
  trava, e a lista acima tem de ser percorrida. É o preço de substituir o
  `three` por dentro.
- **O contrato falha ruidosamente.** A prova de que ele pega uma quebra está na
  própria suíte: há um teste que **simula** a premissa 4 deixando de valer
  (monkey-patch do material) e exige que a verificação acuse — um contrato que
  nunca falha não protege nada, que é a lição da SPEC-0240.
- **O que ele NÃO cobre.** O contrato verifica o comportamento do `three`, não a
  imagem. Continuam valendo o harness de paridade (SPEC-0240) e a inspeção da
  volta inteira exigida pela SPEC-0245 — o contrato diz que as premissas valem,
  não que a sombra está bonita.

### Revisão manual obrigatória ao subir o `three`

Estas não têm como ser verificadas por teste automatizado, e por isso viram
**item de checklist** de quem mover a trava:

1. **Conferir a imagem.** Nenhum teste aqui olha para pixel. Rodar o harness da
   SPEC-0240 e a inspeção da volta inteira (SPEC-0245).
2. **Conferir o comportamento do `backend.get(depthTexture)`** — a obtenção do
   `GPUTexture` por identidade depende do backend WebGPU do `three`, que não
   existe em teste sem placa.
3. **Conferir se o `three` ganhou novos caminhos de mutação de cena** que não
   passem por `add`/`remove` (premissa 8 é testada nos caminhos conhecidos; um
   caminho **novo** é, por definição, desconhecido pelo teste).
4. **Reler o bug do `_cameraFrameId`** (`WeakMap` acessado com colchete em
   `ShadowNode.js`, registrado na SPEC-0245): se o `three` consertar, a
   amortização por frame passa a valer e muda a conta do marco.

## Como atualizar a trava

1. Rodar `yarn vitest run tests/native/three-contract.test.ts`. A falha da
   trava lista as dez premissas.
2. Conferir cada premissa contra o novo `three` — os testes de comportamento
   respondem 1 a 10 sozinhos assim que a trava for movida; as quatro da revisão
   manual acima, não.
3. Mover `VERSAO_DO_THREE_VALIDADA` no topo de
   `tests/native/three-contract.test.ts`.
4. Registrar a rodada (versão antiga → nova, o que mudou) **nesta spec**.

## Histórico de validação

| versão do `three` | data | observação |
| --- | --- | --- |
| 0.184.0 | 2026-09-22 | trava inicial; as dez premissas valem, verificadas por teste |
