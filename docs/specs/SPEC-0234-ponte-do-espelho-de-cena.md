# 0234 - Ponte do espelho de cena (fase 3 do ADR-0232)

**Data:** 2026-09-20
**Status:** aceito — medido, ganho parcial

## Contexto

A SPEC-0233 pôs a hierarquia em C++ e mediu: travessia + culling de 1.300 nós
custam **0,023 ms**, contra **8,5 ms** do mesmo trabalho em JS
(`cpu.rpMatrix` 4,5 + `cpu.rpProject` 4,0, ambos dentro de `cpu.render`). Falta
ligar os dois lados — e é aqui que as tentativas anteriores morreram.

Três armadilhas conhecidas, todas já pagas em medição:

1. **Ponte por objeto**: 15 us por travessia (SPEC-0225). Com 1.300 nós,
   qualquer API do tipo `getMatrix(i)` custa mais do que o trabalho inteiro.
2. **Laço de aplicação em JS**: mesmo com uma chamada só, copiar as matrizes
   para os objetos custa ≥1,4 ms no Hermes (1,103 us por objeto, medido hoje).
   Trocar "N travessias de ponte" por "N iterações em JS" não resolve.
3. **Instancing**: descartado por medição (SPEC-0012 do jogo) — cada
   `InstancedMesh` paga um `writeBuffer` por frame mesmo parada.

## Decisão

**Memória compartilhada sem cópia, e o `three` lendo dela direto.**

- O C++ expõe as matrizes de mundo por `napi_create_external_arraybuffer`: o
  JS enxerga a memória do `SceneMirror` como um `Float32Array`, sem cópia.
- No setup, cada `Object3D` espelhado tem seu **`matrixWorld.elements`
  apontado para o subarray correspondente** (`buffer.subarray(i*16, i*16+16)`).
  O `three` só **indexa** `elements`, então ele passa a ler a matriz que o C++
  escreveu — sem laço de aplicação, sem cópia, **zero custo por frame no JS**.
- `matrixWorldAutoUpdate = false` na raiz espelhada, senão o `three` recalcula
  por cima e o ganho some em silêncio.

Por frame, o JS faz **duas** coisas: escreve o transform dos nós **dinâmicos**
num buffer (também externo, também sem cópia) e chama **uma** função NAPI.

### Quem é dinâmico

Medido no `kart-racer`: **63 nós de ~1.300 mudam de transform por frame** — as
raízes dos carros e os pivôs de roda. O resto é cenário que já foi fundido pelo
`mergeStaticScene`. Por isso o buffer de sincronização é pequeno e o laço em JS
que o preenche é de 63 iterações, não de 1.300 — abaixo de 0,1 ms.

A lista de dinâmicos é declarada por quem monta a cena, não adivinhada: descobrir
por comparação exigiria justamente o laço de 1.300 que esta spec evita.

## Critério de aceitação (fixado antes de medir)

| medida | sucesso | fracasso |
| --- | --- | --- |
| `cpu.rpMatrix + cpu.rpProject` | ≤ 2,5 ms (de 8,5) | > 4 ms |
| `cpu.render` | ≤ 15 ms (de 21) | > 18 ms |
| frame total | ≤ 32 ms (de 38) | > 35 ms |

Se falhar, esta spec vira **rejeitada — medida**, no mesmo padrão da SPEC-0229 e
da SPEC-0012 do jogo, e o motivo fica registrado em vez de virar tentativa
repetida.

## O que NÃO entra

- Submissão de draw e materiais (fases 3b e 4 do ADR-0232).
- Skinning: a matriz de um osso muda por frame e quebra a premissa dos 63.
- O Studio, que segue no `three`/browser — divergência aceita pelo usuário.

## Resultado (20/09/2026)

Corrida do kart-racer, export `--debug`, 144 amostras, já com a correção de
precisão descrita no fim desta spec:

| medida | antes | depois | critério |
| --- | --- | --- | --- |
| `rpMatrix` | 4,5 ms | **0,205 ms** | — |
| `rpProject` | 4,0 ms | 2,92 ms | — |
| soma das duas | 8,5 ms | **3,11 ms** | sucesso ≤2,5 · fracasso >4 |
| `render` | 21 ms | 18,5 ms | sucesso ≤15 · **fracasso >18** |
| frame | 38 ms | **31,7 ms** | sucesso ≤32 · fracasso >35 |
| fps | 26,3 | **31,5** | — |

**A travessia de matriz praticamente sumiu do JS** (4,5 → 0,205 ms), e o culling
caiu junto porque o `three` deixou de recompor matriz durante ele. O visual foi
conferido por captura do jogo: pista, carro, túnel e HUD corretos, com o
`matrixWorld` vindo do C++.

**Mas o critério de `render` não foi atingido**, e o motivo é claro no próprio
trace: `rpObjects` custa **15,7 ms dos 18,5** — 85% do render. É o
`renderObject` do `three`, que esta fase não toca. Enquanto a submissão e os
materiais continuarem em JS, o teto do render é esse.

Ou seja: a fase 3 entregou o que prometia na fatia dela (matriz e culling) e
provou que a ponte sem cópia funciona — mas o frame só chega a 60 fps quando a
fase 4 tirar o `renderObject` do JS.

## Bug encontrado e corrigido: precisão

A primeira versão expôs as matrizes como `Float32Array`. O jogo rodou, o fps
subiu — e **as sombras da pista saíram em bandas**, reportado pelo usuário a
partir de uma captura.

Causa: o `matrixWorld` do `three` é **dupla precisão**. Numa cidade, com
coordenadas na casa das centenas de metros, o float32 tem dígitos de menos, e o
erro acumulado na matriz aparece no shadow map como faixas — o clássico shadow
acne, só que nascido do lado da CPU e não do viés do depth.

O espelho passou a guardar e expor **`double`**: matriz local, matriz de mundo e
o buffer de sincronização. O custo é 166 KB a mais de memória, e o `rpMatrix`
ficou igual (0,205 ms). As bandas sumiram, conferido por nova captura do jogo.

Fica a regra, que vale para qualquer coisa que atravesse essa fronteira: **o que
espelha estado do `three` usa a mesma precisão que ele**. A diferença não
aparece como erro nem como exceção — aparece como artefato visual, que é o tipo
de defeito mais caro de rastrear.
