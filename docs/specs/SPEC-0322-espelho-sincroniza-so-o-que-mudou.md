# SPEC-0322 - Espelho de cena sincroniza só o que mudou

**Data:** 2026-10-07
**Status:** aceito — medido (frente R2-A do ciclo 75 fps do DDD 61)

## Contexto

Medição R1b (engine `1143723d`, export release do DDD 61): o render custa
~25 ms/quadro e **11,4 ms** são o laço JS de `NativeSceneMirror.update()`. Ele
escreve a linha de sincronização (posição, quaternion, escala, flags) dos
**10.125 nós** em todo quadro — 1,12 µs/nó — com ~10.100 deles parados. O lado
C++ (`api.update`) custa 0,41 ms. Além disso `ladoDaSombra()` aloca um array por
nó via `materiais()`: 10 mil alocações por quadro.

A SPEC-0234 já previa reduzir o laço "à lista de dinâmicos", mas pedia que ela
fosse **declarada** por quem monta a cena. No DDD 61 isso não se sustenta: o
jogo move objeto direto (`position.set/copy`) em dezenas de arquivos (carros,
NPCs, metrô, missões), e esquecer uma declaração vira objeto congelado na tela.
Descobrir por comparação, por outro lado, é justamente o laço de 10 mil nós.

O contrato do C++ já comporta linhas parciais: `applyTransforms` guarda o estado
por índice, e `updateAndCull` só recompõe a matriz de quem recebeu linha (ou tem
pai que recebeu). Mandar menos linhas não exige mudar o host.

## Decisão

Cada parte da linha é sincronizada pelo mecanismo que custa zero quando nada
muda:

1. **Transform por evento (latência zero).** Ao entrar no espelho (`install` ou
   append), o nó ganha ganchos que marcam o slot como **sujo**:
   - `position` e `scale`: os **mesmos** objetos `Vector3` (quem guardou a
     referência continua mexendo no objeto certo) recebem acessores próprios em
     `x`/`y`/`z`. Todo método do `Vector3` escreve por `this.x = …`, então
     `set`, `copy`, `fromArray` (o `AnimationMixer`), `decompose`
     (`applyMatrix4`) passam pelo gancho.
   - `quaternion` e `rotation`: o `three` já tem `_onChangeCallback` nos dois; o
     espelho embrulha o original (que mantém os dois sincronizados) e marca.
     Os dois são necessários: a mudança de `rotation` atualiza o quaternion com
     `setFromEuler(…, false)`, que **não** dispara o callback do quaternion.
   O setter ignora a escrita do MESMO valor: o jogo reescreve transform parado
   todo quadro (`copy` de alvo que não andou), e isso virava linha à toa.
   Ao sair do espelho (remoção, estouro de capacidade) os ganchos são desfeitos e
   o objeto volta a ter propriedades de dado.
2. **Flags do quadro (`visible`, `material.visible`, lado da sombra) por
   varredura em rodízio.** São campos crus do `three`; pôr acessor neles colocaria
   um getter no caminho quente do `_projectObject` (que lê `visible` de todo nó).
   A cada quadro o espelho recalcula as flags de uma fatia de `max(256, ⌈n/8⌉)`
   slots e compara com a última enviada (`Uint8Array` por slot); se mudou, o slot
   vira sujo. Cena pequena (≤ 256 nós) é varrida inteira todo quadro; o DDD 61
   (10 mil nós) fecha a volta em **8 quadros**. Esses campos só alimentam o passe
   de sombra nativo (o desenho principal é do `three`), então o atraso máximo é
   de sombra, não da imagem do objeto. Nó sujo por transform leva as flags
   recalculadas junto.
3. **Linhas compactas só dos sujos.** O laço por quadro percorre a lista de
   sujos, não `_nodes`. Lápide continua sem linha.
4. **`ladoDaSombra` sem alocação.** O caso comum (material único) é resolvido
   sem montar lista; o array é percorrido no lugar.
5. **Contador.** `NativeSceneMirror.syncedNodes` (linhas do último quadro) e a
   média por amostra no perf-trace (`cpu.mirrorSynced`), mais a seção
   `cpu.mirror` do profiler em volta do `update`. É o instrumento que denuncia
   gancho faltando: cena parada com contador alto, ou carro andando com contador
   zero.

### Alternativas descartadas

- **Lista declarada de dinâmicos** (SPEC-0234 original): depende de cada jogo
  marcar tudo que se move; o erro é objeto congelado sem exceção.
- **Comparação total por quadro**: lê os mesmos 10 campos aninhados que o laço
  atual; troca escrita por leitura, ganho pequeno.
- **Detecção por varredura com histerese** (acordar o nó quando a varredura
  vê mudança): objeto que começa a se mover fica até 8 quadros parado e pula —
  defeito visível no desenho principal, não só na sombra.
- **Acessor também em `visible`/`material`**: o `three` lê `object.visible` de
  todo nó em toda travessia; o acessor custaria ~1 ms nos 10 mil nós.

## Paridade (o risco da SPEC-0245)

Sombra/visibilidade errada não dá erro, só imagem errada — já aconteceu 3×. A
suíte `NativeSceneMirror.test.ts` ganha um host falso que **guarda o estado do
C++ por índice** aplicando as linhas como o `applyTransforms`, e compara com o
estado verdadeiro da cena (o que o espelho completo mandaria) depois de: mover
(position/rotation/quaternion/scale, `set`/`copy`/`lookAt`/`applyMatrix4`),
esconder, trocar material, mudar `material.visible`/`side`/`shadowSide`,
add/remove, objeto dentro de grupo que se move, e cena grande (varredura em
mais de um quadro). Transform tem de bater no **mesmo** quadro; flags em até
`SWEEP_PERIOD_FRAMES` quadros.

## Consequências

- Escrever em `position.x`/`scale.x` de nó espelhado passa por um setter
  (como o `quaternion` do `three` já fazia). Custo só para quem escreve/lê
  transform de nó espelhado — os 10 mil parados não pagam nada.
- `visible`/`material.visible`/`side` mudados em runtime chegam à **sombra
  nativa** com até 8 quadros de atraso numa cena de 10 mil nós.
- Instalar o espelho fica um pouco mais caro (6 `defineProperty` + 2 closures
  por nó, uma vez).
- O host C++ não muda: o contrato de linha parcial já existia.

## Resultado (2026-10-07)

Export **release** do DDD 61 (base = engine `1143723d`; novo = esta branch),
rodadas de 120 s intercaladas, análise com t ≥ 30 s, mediana das amostras.

Bateria 1 (sem HUD — só tempo de quadro):

| ponto | quadro base → novo (med / p95) | fps base → novo |
| --- | --- | --- |
| setorO | 37,3 / 45,2 → **26,2 / 32,2 ms** | 26,8 → **38,2** |
| comercial | 40,6 / 47,1 → **28,0 / 33,1 ms** | 24,6 → **35,7** |

Bateria 2 (`cortexHud=1` nos dois lados, para ter as seções do profiler):

| ponto | quadro med | `render` med (p99) | `mirror` med (p99) | nós sincronizados/quadro |
| --- | --- | --- | --- | --- |
| setorO | 36,7 → **25,8** | 25,1 (29,0) → **14,5** (18,4) | — → 1,1 (2,9) | 10.131 → **258** |
| comercial | 38,6 → **27,4** | 24,5 (28,7) → **13,8** (17,4) | — → 1,4 (3,7) | 10.125 → **368** |
| helio + piloto | 32,9 → **22,2** | 21,4 (25,6) → **11,7** (15,2) | — → 1,1 (3,0) | 10.131 → **219** |

O `render` caiu **9,7 a 10,7 ms** (meta: −9 a −10,5). Também caiu a latência
de GPU (`gpu-latency` ~23 → ~11 ms na bateria 1): com menos linhas o C++
recompõe e sobe só as matrizes dos nós sujos (`changed_`, M3 do ADR-0237).

Os 220–370 nós por quadro são o que de fato se mexe (ossos dos NPCs animados,
carros, rodas); ignorar a escrita do mesmo valor não os reduziu. Os quadros de
~100 ms nas rodadas coincidem com os screenshots (`PrintWindow`) nos dois
lados. Captura base × novo em setorO, comercial e dirigindo: mesma imagem,
inclusive sombras (`.cortex/r2-a/runs/*/shot*.png`).
