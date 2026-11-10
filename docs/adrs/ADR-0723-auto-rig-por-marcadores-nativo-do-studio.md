# ADR-0723 - Auto-rig por marcadores nativo do Studio, com ganchos do projeto

**Data:** 2026-11-10
**Status:** aceito
**Contexto da SPEC:** SPEC-0724

## Contexto

O painel **Auto-rig de personagem** do Studio (SPEC-0349) só marca o corpo: grava
`tools/characters/<CODE>.markers.json` e roda o `tools/prepare-character.sh` do jogo. Quem transforma os
marcadores num esqueleto é o pipeline do DDD 61 (`tools/character.mjs` + `scripts/blender/character_*.py`, cerca de
2.400 linhas). Sem esse script, o painel fica só com a aba Animações (SPEC-0704).

O Port Hollow não tem o pipeline. Os NPCs dele usam um esqueleto modelo fixo, igual para todos e escalado para
1,80 m: as juntas não batem com o corpo de cada NPC, e os ossos dos braços, das mãos e das pernas ficam girados 180°
no próprio eixo em relação aos do player (LUC-01). Por isso a pegada da arma e as poses do Studio saem invertidas nos
NPCs. O usuário quer marcar cada NPC como marcou o Lucas, e marcar e gerar o rig é trabalho do Studio, não de um
script copiado para cada jogo.

O pipeline do DDD 61 mistura duas partes:

- **genérica**: marcadores → esqueleto Mixamo de 26 ossos (22 do Mixamo + 4 auxiliares de meia-rotação), bone heat
  com as faixas do cotovelo e do joelho, retarget de FBX do Mixamo com os ajustes da aba Animações, GLB skinned e
  prévia (`character_markers.py`, `character_skin.py`, `character_skin_preview.py`, `character_common.py`);
- **do jogo**: atlas e lote instanciado, catálogo de pivôs, regiões por cor da textura, e os clipes do GTA San
  Andreas (`character_gta.py`), que são dados de terceiros e não podem ir para a engine, que é pública.

## Alternativas

1. **Manter no jogo e copiar o pipeline para o Port Hollow.** Zero mudança na engine, mas duplica 2.400 linhas
   de Python e Node que já divergiram uma vez. Cada correção teria de ser feita duas vezes, e o painel continuaria
   dependendo de um script que o Studio não conhece.
2. **Reescrever o rig em TypeScript (three.js) no Studio**, sem Blender. Não depende de instalar nada, mas o bone
   heat do Blender (`ARMATURE_AUTO`) não tem equivalente pronto. Recriar os pesos à mão mudaria a deformação
   aprovada do LUC-01, e a saída deixaria de ser comparável à do player.
3. **O Studio traz a parte genérica (Python do Blender + orquestrador em Node no processo principal), o Blender
   vem da configuração do Studio, e o que é do jogo entra por gancho.** O painel ganha o Gerar rig sem
   `prepare-character.sh`, e o projeto que já tem o script continua usando o dele.

## Decisão

Alternativa 3.

- Os scripts do Blender vão para `native/scripts/autorig/` (empacotados pelo `extraResources` que já leva
  `native/scripts`). Eles são a parte genérica do DDD 61 portada **sem mudar a conta** do esqueleto: as mesmas
  frações dos marcadores, o mesmo `align_roll((0, −1, 0))` e a mesma hierarquia. Assim o NPC sai com os mesmos 26
  ossos e os mesmos eixos de osso do LUC-01. Sai o que é do jogo: catálogo de pivôs, atlas, lote, regiões e GTA.
- O orquestrador (`electron/main/autoRig/`) faz o que o `character.mjs` fazia para a parte `skin`: etapas com hash
  das entradas, `<work>/state.json`, staging, `--approve` com backup, `--revert`, o registro `tools/characters/rigs.json`
  e os mesmos códigos de saída. O renderer não muda o IPC (`characterRig:run`).
- **Precedência:** se o projeto tem `tools/prepare-character.sh`, o Studio roda o script do projeto, como hoje.
  Sem ele, a config que declara `work` e `skinned.publish` usa o pipeline do Studio. Sem nenhum dos dois, o painel
  fica no modo só publicado (SPEC-0704).
- **Blender:** preferência do Studio `blenderPath` (escolhida no painel), depois `BLENDER_PATH`, depois a busca nas
  instalações comuns. Não vai para a config do projeto: seria um caminho de uma máquina gravado no repositório.
- **Gancho do projeto:** `skinned.hooks` lista arquivos Python do projeto que rodam dentro da etapa `skin`, depois
  dos clipes e antes de exportar (`before_export(ctx)`). É ali que o jogo põe o que é dele (atributo de região,
  clipes de outra fonte, campos a mais no JSON). Os ganchos entram no hash da etapa.

## Consequências

- O Port Hollow (e qualquer projeto) gera rig por marcadores sem copiar pipeline. O DDD 61 não muda: continua no
  `prepare-character.sh` dele.
- O Studio passa a depender do Blender (≥ 4.4, por causa dos *action slots*) para gerar rig. Sem ele, o Gerar
  rig sai com código 2 e o painel explica onde escolher o executável.
- Há duas cópias da conta enquanto o DDD 61 não migrar para o pipeline do Studio. A do Studio é a referência
  daqui em diante, e o DDD 61 pode trocar o `skin` dele pelo do Studio (com um gancho para o GTA e as regiões)
  num PR do jogo.
- A engine pública não leva nada do GTA nem dados do jogo. Clipes de terceiros só entram pela pasta de FBX do
  projeto ou pelo gancho, nunca pela engine.
