# SPEC-0724 - Auto-rig por marcadores no Studio: gerar o rig sem `prepare-character.sh`

**Data:** 2026-11-10
**Status:** implementado
**Decisão:** ADR-0723
**Base:** SPEC-0349 (painel e marcadores), SPEC-0704 (modo só publicado)

## Contexto

O painel Auto-rig (SPEC-0349) grava os marcadores e roda o `tools/prepare-character.sh` do jogo. Só o DDD 61 tem
esse script. A ADR-0723 traz a parte genérica do pipeline dele (marcadores → esqueleto Mixamo, pesos, clipes do
Mixamo, GLB e prévia) para o Studio, para que qualquer projeto gere o rig de um personagem pelos marcadores.

## Quando o Studio gera

| projeto / config | Gerar rig |
|---|---|
| tem `tools/prepare-character.sh` | roda o script do projeto (SPEC-0349, sem mudança) |
| sem o script, config com `work` e `skinned.publish.{glb,clips}` | **pipeline do Studio** (esta SPEC) |
| sem o script nem esses campos | modo só publicado: só a aba Animações (SPEC-0704) |

O modo é decidido por config. Ao trocar de config no seletor do painel para uma de outro modo, o painel reabre
naquela config, com as abas do modo novo.

## Config (`tools/characters/<nome>.json`)

```json
{
 "code": "npc-110",
 "source": "D:/assets/npc-110/model.glb",
 "work": ".cortex/auto-rig/npc-110",
 "transform": { "rotateZDeg": 0, "height": 1.8, "weld": 0.00001, "sharpAngleDeg": 60 },
 "budget": { "minTriangles": 1000, "maxTriangles": 6000 },
 "skinned": {
  "markers": "tools/characters/npc-110.markers.json",
  "fbx": "assets/animations/mixamo",
  "clips": { "walk": { "file": "walking.fbx", "loop": true, "rootMotion": true, "armSpace": -16 } },
  "jointLimitsDeg": { "ForeArm": 115 },
  "jointBands": { "ElbowHelper": { "band": 0.07, "reach": 0.15, "membership": 0.9 },
                  "KneeHelper": { "band": 0.08, "reach": 0.18, "membership": 0.9 } },
  "preview": [ { "label": "andar", "clip": "walk" } ],
  "hooks": [ "tools/rig-hooks/regions.py" ],
  "publish": { "glb": "assets/personagens/npc/npc-110-skinned.glb", "clips": "assets/personagens/npc/npc-110-skinned.json" }
 }
}
```

| campo | obrigatório | padrão | regra |
|---|---|---|---|
| `code` | sim | | `[A-Za-z0-9._-]+`; nomeia a malha e os arquivos de staging |
| `source` | sim | | GLB do corpo (absoluto ou relativo ao projeto); as malhas são juntadas numa só |
| `work` | sim | | pasta de trabalho (absoluta ou relativa ao projeto) |
| `transform.rotateZDeg` | não | 0 | o giro da SPEC-0349 (frente para a câmera) |
| `transform.height` | não | 1,8 | altura do personagem em metros, dos pés ao topo |
| `transform.weld` | não | 0,00001 | `remove_doubles` antes do bone heat (m) |
| `transform.sharpAngleDeg` | não | ausente | se presente, refaz as normais (suave com quina acima do ângulo); senão mantém as da fonte |
| `budget` | não | ausente | se presente, reprova o GLB com triângulos fora de `[min, max]` |
| `skinned.markers` | não | `<config>.markers.json` | o arquivo que o painel grava |
| `skinned.fbx` | se algum clipe tem `file` | | pasta dos FBX do Mixamo |
| `skinned.clips` | não | `{}` | clipes do Mixamo com os ajustes da aba Animações (SPEC-0349, adendos 4 a 10) |
| `skinned.jointLimitsDeg` | não | `{ "ForeArm": 115 }` | limite de giro por osso (sem o lado), em graus |
| `skinned.jointBands` | não | os do LUC-01 (acima) | faixas do auxiliar de meia-rotação (m) |
| `skinned.preview` | não | `[]` | poses da folha (`label`, `clip`, `mark` opcional) além do repouso |
| `skinned.hooks` | não | `[]` | ganchos do projeto (ver abaixo), relativos ao projeto |
| `skinned.publish.glb`, `.clips` | sim | | destino no projeto do `--approve`; **relativos ao projeto**, sem `..` |

Config inválida sai com código **64** e a lista dos problemas. Clipe sem `file` (de outra fonte, como o `gta` do
DDD 61) não é do Studio: fica de fora, com um aviso, para um gancho tratar.

## Blender

Ordem: preferência do Studio `blenderPath` (`<userData>/preferences.json`, botão **Blender…** do painel), variável
`BLENDER_PATH`, e a busca: no Windows `%ProgramFiles%\Blender Foundation\Blender <versão>\blender.exe` (a maior
versão); no macOS `/Applications/Blender.app/Contents/MacOS/Blender`; no Linux, `blender` do PATH. Sem Blender o
Gerar rig sai com código 2 e explica onde escolher. Precisa do Blender 4.4 ou mais novo (*action slots*).

## Etapas

Rodam com `blender -b --factory-startup --python native/scripts/autorig/<script> -- <config resolvida> <resultado>`.
A config resolvida (`<work>/config.resolved.json`) tem os caminhos absolutos e os padrões preenchidos. Cada etapa
grava `{ ok, metrics, failures, infra }` no resultado. O log completo vai para `<work>/logs/<etapa>.log`, e o painel
mostra só as linhas `[autorig]` e o fim do log quando a etapa falha.

### `skin` (`autorig_skin.py`)

1. Importa a fonte, junta as malhas, gira `rotateZDeg` em Z, escala para `height`, centraliza em x e y com os pés
   em z = 0 (o `import_body` do DDD 61), solda (`weld`) e acerta o enrolamento das faces.
2. Marcadores → juntas no plano frontal (`autorig_markers.py`, as frações calibradas no LUC-01) e a profundidade
   de cada junta pelo centro da fatia da malha. Ordem anatômica errada reprova a etapa, sem gerar esqueleto.
3. Esqueleto `SkinRig` com os **26 ossos** do LUC-01: `Hips, Spine, Spine1, Spine2, Neck, Head` e, de cada lado
   (`Left`/`Right`), `Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase, ElbowHelper, KneeHelper`. Cada osso tem
   `align_roll((0, −1, 0))`: o Z local aponta para a frente do personagem (+Z do glTF), como no player. O auxiliar
   tem o repouso do osso de baixo e é filho do de cima.
4. Pesos: bone heat do Blender sem os auxiliares, sem peso do lado oposto (folga de 2 cm) nem de perna em braço,
   até 4 influências, e depois as faixas do cotovelo e do joelho (`jointBands`).
5. Clipes do Mixamo (`skinned.clips` com `file`), retargetados como no DDD 61: alinhamento à T-pose, deriva do
   `rootMotion` vira passada, `jump` tira a subida, ajustes de braço, pose por junta e ligações "seguir", limites
   de junta e auxiliares pela metade do giro do osso de baixo.
6. Ganchos (`skinned.hooks`): cada arquivo é carregado e a função `before_export(ctx)` é chamada, na ordem da lista.
   `ctx` tem `cfg` (config resolvida), `armature`, `mesh`, `layout` (cabeça, cauda e pai de cada osso), `result`
   (medidas e falhas da etapa) e `sidecar` (dict mesclado no JSON do skin). Exceção no gancho = falha de
   infraestrutura.
7. Exporta `<work>/staging/<code>-skinned.glb` (skins, animações pelas trilhas NLA, Y para cima, 4 influências) e
   `<work>/staging/<code>-skinned.json` (`bones`, `pivots` no formato do catálogo do DDD 61, `armReach`, `clips`
   com `loop`, `duration`, `stride`, `marks`, `phase`, `armOffsets`, `poseOffsets`, `follow`, e o que os ganchos
   puseram em `sidecar`), e grava `<work>/skinned/rig-skinned.blend` para a prévia.
8. Confere e reprova: 26 ossos; nenhum osso (fora pé e dedão, que apontam para a frente) com o Z local para trás;
   todo vértice com peso, soma 1, até 4 influências, nenhum do lado errado; clipe com osso fora da direção do mocap
   (> 1°) ou laço aberto (> 5°); no GLB relido, uma malha skinada, os 26 ossos, os clipes e o `budget`.

### `preview` (`autorig_preview.py`)

Abre o `rig-skinned.blend` e renderiza (Workbench) o repouso e cada pose de `skinned.preview` de frente, de lado e
de 3/4 de costas. Por cima de cada imagem vai o **esqueleto**: um octaedro fino por osso e uma esfera em cada
junta, presos ao osso (seguem a pose), numa segunda passada sem o corpo, com cor chapada por cadeia, aplicada por
cima do corpo para aparecer através dele. O rótulo vai no canto da imagem. A folha `<work>/skinned/previa/folha.png`
junta as imagens, três por linha, e `shots.json` lista os rótulos. Só roda com a `skin` aprovada; quando a `skin`
roda de novo, a `preview` roda junto (o `.blend` mudou).

### Hash e reaproveitamento

`<work>/state.json` guarda por etapa o hash das entradas, a situação, a duração e as falhas. Etapa com o mesmo hash
e aprovada é reaproveitada. Hash da `skin`: as seções da config que ela lê, o SHA-256 da fonte, dos marcadores, de
cada FBX e de cada gancho, e o dos scripts `native/scripts/autorig/*.py`. Hash da `preview`: `skinned.preview`, o
script dela e o hash da `skin`.

## Códigos de saída e ações (os mesmos do `prepare-character.sh`)

- **Gerar**: `3` com as duas etapas aprovadas (aguardando revisão; o painel mostra a folha), `1` reprovado, `2`
  infraestrutura (sem Blender, Blender caiu, etapa sem resultado), `64` config inválida.
- **Aprovar** (`--approve`): exige as duas etapas aprovadas com os hashes de agora (senão `1`). Copia o GLB e o JSON
  de staging para `skinned.publish` com cópia segura (grava ao lado, confere o hash, troca), guardando o que existia
  em `<work>/backup/<data>/` com `manifest.json`. O backup e o manifest são gravados **antes** de tocar no projeto; se
  uma cópia falha no meio, o que já foi copiado volta ao backup, a pasta do backup é apagada e sai com `2`. Senão, `0`.
- **Desfazer** (`--revert`): restaura a última publicação do `backup` (sem backup = o arquivo não existia antes e é
  apagado; o `published` sai do registro) e apaga a pasta desse backup, para o próximo Desfazer voltar à publicação
  anterior. `1` se não há publicação para desfazer.

## Registro `tools/characters/rigs.json`

Mesmo formato da SPEC-0349 (adendo 1). A `skin` aprovada grava `staging`; o Aprovar grava `published`. `animations`
= `skinned.fbx` ou, sem ele, a pasta do `publish.glb`. `clips` = os clipes do Studio com a duração do JSON do skin.
O arquivo existente mantém a indentação dele (1 ou 2 espaços); arquivo novo usa 2. Registro existente ilegível (JSON
quebrado ou sem `rigs`) não é sobrescrito: a etapa segue e o painel mostra o aviso para corrigir o arquivo.

## Painel

- `rigPanelMode({ hasPipeline, builtinRig })`: Marcadores, Animações e Pasta com Gerar rig quando há o script **ou**
  a config é do Studio.
- Botão **Blender…** nas ações da aba Marcadores, só no pipeline do Studio: abre o seletor de arquivo, grava a
  preferência e mostra o caminho em uso na dica. IPCs `characterRig:blenderInfo` e `characterRig:pickBlender`.
- Chaves novas (`electron/renderer/i18n/{pt,en}.json`): `characterRig.blender`, `characterRig.blender_current`,
  `characterRig.blender_none`.

## Código

| arquivo | papel |
|---|---|
| `native/scripts/autorig/autorig_common.py` | argumentos, resultado da etapa, importação e preparo do corpo |
| `native/scripts/autorig/autorig_markers.py` | marcadores → juntas (Python puro, `--selftest`) |
| `native/scripts/autorig/autorig_skeleton.py` | juntas → layout dos 26 ossos, armature, pivôs, conferência dos eixos |
| `native/scripts/autorig/autorig_weights.py` | bone heat, faixas do cotovelo e do joelho, conferência dos pesos |
| `native/scripts/autorig/autorig_offsets.py` | ajustes de braço, pose por junta e ligação "seguir" (a conta da prévia do Studio) |
| `native/scripts/autorig/autorig_retarget.py` | retarget dos FBX do Mixamo |
| `native/scripts/autorig/autorig_skin.py` | etapa `skin` (orquestra, ganchos, exporta, confere o GLB) |
| `native/scripts/autorig/autorig_preview.py` | etapa `preview` (render, esqueleto por cima, folha) |
| `electron/main/autoRig/autoRigConfig.ts` | puro: validar e resolver a config, padrões |
| `electron/main/autoRig/autoRigState.ts` | hash das entradas, `state.json`, quais etapas rodam |
| `electron/main/autoRig/autoRigPublish.ts` | aprovar, desfazer, registro de rigs |
| `electron/main/autoRig/autoRigRunner.ts` | roda as etapas no Blender, resumo e código de saída |
| `electron/main/autoRig/blenderLocate.ts` | acha o Blender (preferência, `BLENDER_PATH`, instalações) |
| `electron/main/characterRigIpc.ts` | escolhe entre o script do projeto e o pipeline do Studio |

Logs do Studio com `debug('characterRig', …)` no renderer; o processo principal manda a saída pelo
`characterRig:output`.

## Testes

`tests/electron/autoRigConfig.test.ts`, `autoRigState.test.ts`, `autoRigPublish.test.ts`, `blenderLocate.test.ts` e
`autoRigMarkersPy.test.ts` (roda o `--selftest` do `autorig_markers.py` com o Python do sistema e confere que os
scripts não citam GTA). O `characterRigProject.test.ts` ganha o modo do pipeline do Studio.

## Verificação

2026-11-10, Blender 5.1.2, numa worktree do Port Hollow (sem `prepare-character.sh`), com
`tools/characters/npc-110.json` (fonte do Tripo do npc-110, 14.379 triângulos, `rotateZDeg` −90, 1,80 m) e os 10
marcadores. O Gerar foi rodado pelo `runAutoRig` (a função que o IPC `characterRig:run` chama), porque o controle da
janela do Studio não foi liberado nesta sessão:

- `skin` + `preview` em 6 s, código 3; rodar de novo sem mudar nada reaproveita as duas etapas.
- 26 ossos com os nomes do LUC-01; nenhum osso com o Z para trás; pesos: nenhum vértice vazio, soma 1, até 4
  influências, nenhum do lado errado.
- Eixos de repouso contra o `LUC-01-skinned.glb` do Port Hollow: o Z de cada osso fica a até 7° do do player (o
  pescoço a 32°, porque segue a postura deste corpo); nenhum osso girado 180°.
- Com o `walking.fbx` do Mixamo e os ajustes de braço do `walk` do LUC-01: 32 quadros, erro de direção 0°, laço
  fechado, passada 1,57 m; a folha mostra o repouso e o andar com o esqueleto sobre o corpo nas três vistas.
- `tools/characters/rigs.json` ganhou o `staging` do npc-110; os outros personagens e a indentação ficaram.
- Aprovar e Desfazer foram exercitados nos testes (`autoRigPublish.test.ts`, `autoRigRunner.test.ts`), não no Port
  Hollow.
