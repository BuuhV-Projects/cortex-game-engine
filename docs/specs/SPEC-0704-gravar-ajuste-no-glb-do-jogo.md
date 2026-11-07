# SPEC-0704 - Gravar o ajuste de pose no GLB do jogo (variantes clipe@ARMA)

**Data:** 2026-11-06
**Status:** aceito

Fase F2 do ADR-0702 (revisto). Grava no GLB do personagem que o jogo já usa as correções da aba
Animações (SPEC-0349 adendos 4–9) e as variantes por arma (SPEC-0703), sem reimportar fontes. Como
o arquivo é reescrito: ADR-0705.

Entrega em quatro PRs: o painel dividido com o modo só publicado; a cirurgia no GLB (`glbAnimations.ts`);
a conta (limite de junta e auxiliares, já valendo na prévia); e o botão Gravar com o IPC.

## Comportamento

### Botão "Gravar no GLB do jogo" (aba Animações)

- Grava no build **mostrado** (`staging` ou `published` do `rigs.json`): o GLB e o JSON do skin dele.
  Antes salva a config pendente (braços e pose), como o Gerar rig.
- Assa toda chave da config cujo desejado difere do gerado no build: clipe base com pose, ligações ou
  braços diferentes, e cada variante `clipe@ARMA` salva (pose ou ligações próprias, ou herdadas).
- Recusa (nada é gravado, mensagem com o clipe) quando o build tem uma ligação gerada que o desejado não
  tem: o assado não sabe desfazer uma ligação já gravada (use Gerar rig, se houver pipeline).
- Confirma antes ("Gravar N clipes em <arquivo>? Faz backup do par atual."). Depois recarrega o build:
  os selos "gere de novo" somem, porque o gerado passa a ser o desejado.

### Conta (por chave K, animação base A no GLB)

1. Tempos = os da faixa `.quaternion` de A (todas as rotações do Blender usam a mesma entrada).
2. Para cada chave i: copia os quatérnions de A no quadro i direto nos ossos (sem mixer: exato, e o laço
   não perde a última chave), aplica os braços (`armW − armG`), a pose (`poseDelta(poseW, poseG)`) e as
   ligações desejadas, como a prévia faz.
3. Limite de junta (`skinned.jointLimitsDeg`, ex. `ForeArm: 115`): b = R_rest⁻¹·q; acima do limite,
   b = slerp(I, b, limite/ângulo).
4. Auxiliares (`*ElbowHelper` do par Arm/ForeArm, `*KneeHelper` do par UpLeg/Leg, mesmo repouso do osso de
   baixo): b = R_rest_baixo⁻¹·q_baixo (w ≥ 0), q_aux = R_rest_baixo·slerp(I, b, 0,5).
5. Continuidade: se dot(q_i, q_{i−1}) < 0, troca o sinal de q_i.
6. Faixas: rotação LINEAR dos 26 ossos com os valores assados; translação/escala copiadas de A.
   Nome: o de A (corrige o clipe) ou `clipe@ARMA` (variante, a partir do clipe base).
7. Os passos 3 e 4 também valem na prévia (mesma função), para a prévia mostrar o que é assado.

### JSON do skin

`clips[nome]` grava o **desejado**: `armOffsets` (ausente se zero), `poseOffsets` (ausente se vazio) e
`follow` (ausente se vazio). A variante copia de A `loop`, `duration`, `stride`, `phase` e `marks`, e
ganha `clip` e `weapon`. `weaponGrips` = a pegada de cada arma com variante (a da config ou a padrão da
SPEC-0703). Os outros campos ficam iguais.

### Gravação

IPC `characterRig:writeBake(projectDir, glbRel, jsonRel, glbBase64, jsonText)`: só caminhos dentro do
projeto; grava os dois em `.tmp`, copia o par atual para `<arquivo>.bak` e troca por rename. Falha em
qualquer passo não deixa o par pela metade.

### Projeto só com o GLB publicado (ex. Port Hollow)

Sem `tools/prepare-character.sh` no projeto, o painel abre direto na aba Animações e esconde Marcadores,
Pasta, Gerar rig e Aprovar/Recusar (não há pipeline). A config mínima: `code`, `source` (o próprio GLB
publicado: as abas que usam a fonte ficam escondidas), `skinned.clips` com os clipes (nome → `{}`) e,
se quiser o limite de junta, `skinned.jointLimitsDeg`; o `rigs.json` só com `published`.
**A config tem que espelhar o GLB**: cada clipe com os ajustes que o JSON do skin já diz que estão
gravados (`armOffsets` → os campos do clipe, `poseOffsets` → `pose`, `follow` → `follow`). Clipe sem
ajuste na config com ajuste no GLB aparece como "ajuste não gerado", e gravar desfaria o que o jogo tem.

### Correção junto

O ajuste dos braços compara com o `armOffsets` da animação **mostrada** (a variante, quando o build a
tem), não sempre do clipe base.

## Código

- `electron/renderer/glbAnimations.ts` (puro): lê o GLB, lista animações e reescreve o bloco de
  animação (ADR-0705). Contrato:
  ```ts
  interface BakedChannel { node: string; path: 'rotation' | 'translation' | 'scale'; interpolation: 'LINEAR' | 'STEP'; times: Float32Array; values: Float32Array }
  interface BakedClip { name: string; channels: BakedChannel[] }
  function replaceAnimations(glb: Uint8Array, clips: readonly BakedClip[]): Uint8Array
  // mesmo nome substitui; nome novo vai no fim; as outras animações ficam como estavam
  ```
- `electron/renderer/characterRigBake.ts` (puro): limite de junta, auxiliares, sinal, chaves a assar e
  o JSON do skin novo.
- `electron/renderer/RigBake.ts`: amostra e aplica a conta da prévia sobre o modelo carregado.
- `electron/main/characterRigIpc.ts`: `characterRig:writeBake`.

## Aceite

1. Testes: `replaceAnimations` preserva o prefixo do BIN (mesmo hash) e o JSON fora de animação, troca
   e acrescenta clipes, divide o tempo por contagem, recusa nó desconhecido e layout intercalado; recarregar
   no `GLTFLoader` dá os clipes com 78 canais. Limite, auxiliares (gabarito do GLB do LUC-01: erro < 1e-6),
   sinal, chaves a assar e JSON do skin.
2. No Studio, num projeto de teste com o LUC-01: ajustar `pistolIdle` com o ARM-02, Gravar no GLB, e o GLB
   recarregado tem `pistolIdle@ARM-02`, a prévia sem diferença mostra a mesma pose, a malha e a textura
   ficam iguais (hash do prefixo) e o JSON tem a variante e `weaponGrips`.
3. Projeto sem `prepare-character.sh`: o painel abre só com Animações.
