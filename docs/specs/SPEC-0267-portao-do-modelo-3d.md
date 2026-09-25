# SPEC-0267 — Portão de aprovação do modelo 3D, com volta ao Astra

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0265 (item 3). **Estende:** SPEC-0231

## Contexto

A SPEC-0231 refina e inspeciona todo modelo gerado, mas não reprova nada: o
resultado vira texto para o chat e o modelo é entregue igual.

## Decisão

### Critérios (`src/ai/modelGate.ts`, função pura `judgeModel`)

Avaliados DEPOIS do refino (o atlas de paleta já reduziu o que dava):

| critério | limite | por quê |
| --- | --- | --- |
| materiais, peça pequena (maior lado < 2 m) | ≤ 4 | custo por draw call (SPEC-0224) |
| materiais, objeto grande | ≤ 8 | idem |
| maior lado | entre 0,02 m e 500 m | escala em metros: fora disso é unidade errada (cm/mm) |
| geometria | ≥ 1 triângulo | modelo vazio |

**Plano fino fica fora do teto de 500 m** (revisão de 2026-09-25): oceano,
chão e terreno têm quilômetros de verdade. Se a altura (Z do Blender) é no
máximo 10% do maior lado horizontal, o teto não se aplica; o piso de 0,02 m
continua. Caso real: `oceano.glb` de 16 000 m reprovado, e a correção
encolheria o oceano para caber. Objeto com volume segue barrado — é onde o
erro de cm/mm aparece. Limite conhecido: um piso fino modelado em mm passa.
Alternativas vistas: exceção por nome do arquivo (depende do Astra nomear
certo) e escala só como aviso (deixaria cm/mm chegar ao jogo).

Sem inspeção (Blender ausente, script do refino ausente) o portão **não
julga**: é falta de ferramenta, não defeito do modelo, e repetir não resolve.
O resultado é `{ approved, reasons[], judged }`.

### Volta ao Astra

- **`generate_blender_model`** (cabeça Codificar): o `BlenderModelGenerator`
  repete a geração com o script anterior e os motivos, até
  `MAX_MODEL_ATTEMPTS = 3` tentativas no total.
- **Turno do Modelagem:** antes do turno, o Studio anota tamanho e data de todo
  `.glb` do projeto; depois, julga os novos ou alterados. Com reprovação, abre
  de novo a MESMA sessão do Astra (`codex exec resume`) com os motivos, até
  `MAX_MODEL_ATTEMPTS` rodadas. O chat vê as correções acontecendo.
- Esgotado o limite, o modelo fica como está e o chat lista o que não passou.

## Consequências

- Testes: `tests/ai/modelGate.test.ts` (cada critério, borda de 2 m, sem
  inspeção = não julgado) e o laço do gerador com Codex e Blender falsos
  (reprova, corrige, aprova; esgota o limite).
- Um modelo pode custar até 3 gerações. É o preço de não entregar o problema
  medido no kart-racer.
