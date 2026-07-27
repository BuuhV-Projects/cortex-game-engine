# SPEC-0157 - Kit platformer-obstacles: pistas modulares + ventilador de ar

**Data:** 2026-07-27
**Status:** aceito

## Contexto

Na revisão do kit `platformer-obstacles` (percurso aquático ithappy, merge 96203e7)
o usuário corrigiu duas semânticas que o `kit.json` registrava errado:

1. **`platform_001..027` não são peças soltas** — são o sistema MODULAR de pista:
   se conectam borda-a-borda pra formar o percurso. O `kit.json` as descrevia
   como "piso flutuante" genérico, sem dizer que encaixam nem qual lado encaixa.
   Pelas medidas + thumbnails, o conjunto é **9 formas × 3 variantes de cor**
   (borda rosa/deck violeta, borda laranja/deck azul, borda vermelha/deck verde).
2. **`propeller_trampoline_1_001` não é trampolim** — é um **ventilador sob uma
   grade**: pisando em cima, o vento joga o player pra cima dando sensação de
   voo, e o vento **pulsa** (para e ativa toda hora). Estava anotado como
   `launcher`/`Trampolim`, e não existia animação nem script pra isso.

## Decisão

### Pistas modulares (platform_001..027)

Cada peça ganha anotação por FORMA (não mais uma nota única da família), com
`gameplayRole: path`, tag `modular` + tag de forma + largura + cor da borda, e
nota dizendo explicitamente que **não se usa solta** e **qual lado é o encaixe**
(o lado SEM borda inflável):

| Forma | Medidas (u) | Encaixe |
| --- | --- | --- |
| `end-cap` estreita/larga | 6.5/12.5 × 7.3 | borda em 3 lados; o lado aberto conecta |
| `straight` estreita/larga | 6.5/12.5 × 6 | 2 lados abertos (segue reto) |
| `ramp` estreita/larga | 6.5/12.5 × 12, sobe ~5 | aberta no pé e no topo (liga pista baixa ↔ elevada) |
| `funnel` (transição) | 12.5 × 12 | lado largo 12.5 ↔ lado estreito 6.5 |
| `corner-l` | 32.5 × 24 | seção grande em L — curva de 90° |
| `corner-arrow` | 37.5 × 24 | seção grande em seta — muda a direção em diagonal |

`platform_028..030` (empilhado inflável 15×6×19, 3 cores) ficam FORA do sistema
modular — bloco-ilha solto.

### Ventilador (`propeller_trampoline_1_001` → mechanic `fan-updraft`)

Novo script anexável do kit, **`Ventilador`** (`scripts/FanUpdraftScript.ts`,
ADR-0085), que implementa o comportamento completo:

- **Animação da hélice**: o `.glb` tem a hélice como nó separado
  (`propeller_trampoline_2_001`); o script gira esse nó por transform, com
  aceleração/desaceleração suave — a hélice PARA visivelmente quando o vento
  desliga (peça de gameplay parada = errada, regra de animação do kit).
- **Ciclo de vento**: alterna `ligado`/`desligado` (segundos, editáveis no
  Inspector). A fase vem de função pura `windIsOn(elapsed, on, off)`.
- **Corrente de ar**: enquanto ligado, quem está na coluna de ar acima da grade
  (raio da peça + `alturaVento`) ganha empuxo no `CharacterBodyComponent.velocityY`
  (acelera `forca` m/s² até `subidaMax` m/s — a gravidade briga de volta, o que
  dá o flutuar). Desligado, o player cai de volta na grade e o ciclo recomeça —
  o sobe-e-desce é a sensação de voo pedida.

Campos: `forca`, `subidaMax`, `alturaVento`, `ligado`, `desligado`, `giroHelice`.
O script entra em `_kit.scripts.provides` (junto de Esteira/PenduloEspetos/
Prensa/PlataformaGiratoria) e o asset aponta `mechanic.script: 'Ventilador'`.

Fonte durável: tudo anotado no `gen-overrides.mjs` do stage
(`D:/jogos/assets/3d-models/kits/_stage/obstacles/`), regenerando
`overrides.json` → `kit.json` (SPEC-0151) — sobrevive a reprocesso.

## Consequências

- A IA level-designer passa a saber montar percurso conectando as platform_N
  pelo lado certo (e a não espalhá-las soltas como ilhas).
- O ventilador funciona out-of-the-box ao importar o kit (script no próprio
  kit, sem depender de script de jogo como o `Trampolim`).
- O empuxo usa o mesmo acesso ao player dos outros scripts do kit
  (query `CharacterBodyComponent`) — vale a mesma limitação: 1 player.
- Sem teste unitário do script no repo do engine: `cortex-game-engine` não é
  resolvível nos testes (sem `exports`/alias — precedente dos 4 scripts já
  existentes); a integridade do kit.json segue coberta por
  `tests/scene/kitsRepo.test.ts`.
