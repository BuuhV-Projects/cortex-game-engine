# SPEC-0348 - SkinnedMesh no export nativo: funciona; a "trava" do spike era exceção no tick

**Data:** 2026-10-10
**Status:** aceito

## Contexto

No spike do ADR-0131 do jogo DDD 61 (`D:/jogos/detetive-brasilia`), a opção (d)
— um `SkinnedMesh` do GLB por pessoa (NPCs de `E:/Downloads/npcs/*/*_Rig.glb`,
20 ossos, 6–12 materiais) — foi descartada porque o export nativo "travava no
carregamento": 4 quadros e mais nenhum, com 20, 40 ou 120 pessoas, com e sem as
texturas de placa. A suspeita era o host (shim, formato da textura de ossos,
storage buffer). O jogo seguiu com o lote TSL, mas a engine deveria suportar
skinning no nativo.

## Investigação

Cena mínima em `D:/jogos/teste-skin` (fora do repo): os 32 GLBs rigados em
rodízio, `SkeletonUtils.clone` por pessoa, adicionados com o jogo já rodando (como
no spike), um `AnimationClip` girando `UpperArmR` no `AnimationMixer` de cada um.
`?n=N` define quantas pessoas; `?spike=1` repete a busca de ossos do spike.
Export de `main` (486ecebf), com cook KTX2 ligado, janela 1280×720.

| caso | resultado |
|---|---|
| `n=1`, `n=10`, `n=20` | roda; o braço muda de ângulo entre duas capturas a 450 ms (clipe animando) |
| `n=120`, 32 tipos (inclui POL-* com placa) | roda; todos renderizados, 3859 nós no espelho; lento (~1000 draws, custo previsto no ADR-0131), sem travar |
| `n=20&spike=1` | **para**: nenhum quadro depois da carga; `error_log.txt`: `[raf] excecao JS: TypeError: Cannot read property 'rotation' of undefined at spikeUpdate` |

O caminho do three r184 pro skinning no WebGPU (`SkinningNode`: `referenceBuffer`
de `mat4` dos ossos + atributos `skinIndex`/`skinWeight` em `uint16x4`/`float32x4`)
já é coberto pelo host — nada a portar.

## Causa

**Bug do código do spike, não do host.** O `spikeD` procurava os ossos pelo nome
cru do GLB (`'Thigh.R'`, `'UpperArm.L'`, `'Shin.R'`…). O `GLTFLoader` passa todo
nome de nó por `PropertyBinding.sanitizeNodeName`, que remove `.` (caractere
reservado do caminho de animação): no grafo o osso se chama `ThighR`. A busca não
achava nada (`ossosDoSpikeAchados=0` no log), e o update fazia
`p.bones[b]!.rotation.x = …` em `undefined` a cada quadro.

A exceção sobe do `game.onUpdate` até o callback do rAF e o tick morre — a mesma
assinatura do gotcha "API faltando no Rapier do host": tudo para, sem crash, e a
mensagem só aparece no `error_log.txt`. Os "4 quadros" são os desenhados enquanto
os GLBs ainda carregavam (antes do `await` devolver o update). O mesmo código
quebraria igual no navegador; o spike só foi rodado no export.

O comentário do spike ("no export a carga dos GLB com letras (KTX2) não volta")
também não se sustenta: a textura de placa dos POL-* tem 4,7 KB, abaixo do piso de
conversão do cook (`MIN_CONVERT_SOURCE_BYTES`, 16 KB), então segue PNG; os 32 tipos
carregaram no teste.

## Decisão

- Nenhuma mudança no host: `SkinnedMesh` com `AnimationMixer` roda no export
  nativo como está.
- Armadilha registrada em `docs/cortex-native/architecture.md`: "trava" com
  quadros parados = ler o `error_log.txt` antes de suspeitar do host; ossos de GLB
  se buscam pelo nome **sanitizado** (`ThighR`, não `Thigh.R`).

## Consequências

- O ADR-0131 do jogo continua válido pela razão de custo (6–12 draws por pessoa,
  skinned fora do caminho rápido em C++ e recusado no passe de sombra nativo), não
  pela trava. Vale corrigir a frase "o export trava no carregamento" lá.
- `D:/jogos/teste-skin` fica como reprodução manual (`?n=`, `?spike=1`).
- Não há teste automatizado novo: não há código novo na engine. A regressão de
  skinning no host seria um smoke do export, que hoje não existe para nenhuma
  feature de render.
