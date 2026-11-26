# SPEC 0746 - Auto-rig controlável sem mouse (ponte, MCP e atalhos)

**Data:** 2026-11-25
**Status:** implementado

## Contexto

A pegada da arma (`skinned.weaponGrips[ARMA] = { offset, rotation }`, no espaço do osso `RightHand`, SPEC-0703) só se
ajusta arrastando o gizmo na aba Animações do painel "Auto-rig de personagem". Pelo computer-use não dá o arrasto fino,
e a SMG (ARM-04) do LUC-01 do Port Hollow continua com as mãos atravessando a arma. O usuário quer ajustar por
comando (outra sessão, pelo MCP `cortex`) e pelo teclado.

## Decisão

### 1. Ponte local (`electron/main/rigBridge.ts`, ADR-0747)

HTTP em `127.0.0.1`, porta livre, token em `~/.cortex-studio/rig-bridge.json` (`{ port, token, pid }`). `POST /rig`
com `{ cmd, args }` e `x-cortex-token`. O main manda `rigRemote:command { id, cmd, args, deadline }` à janela principal e espera
`rigRemote:reply { id, ok, result | error }` (tempo-limite de 15 s; 180 s no `save` do GLB). Respostas: 200 com
`{ ok, result | error }`, 403 sem token, 404 fora de `POST /rig`, 413 com corpo acima de 1 MB. O arquivo do token fica só
para o dono (`chmod 0o600` a cada gravação, também num arquivo que já existia); ao sair, o servidor fecha as conexões
keep-alive abertas e tira o listener da resposta.

### 2. Comandos do painel (`electron/renderer/RigRemote.ts`)

Respondem só com a aba Animações à mostra e um modelo carregado (senão: "abra o painel Auto-rig de personagem, aba
Animações"). Os comandos rodam um por vez, na ordem de chegada (`serialQueue.ts`): um `setGrip` não muda a pegada no
meio de um `save`, e a falha de um não trava os seguintes. O comando leva o prazo da ponte (`deadline`); se a vez dele chega depois do prazo
(a ponte já devolveu o erro de tempo), o painel não o executa: um `save` repetido depois de um tempo esgotado não roda
duas vezes. Um `save` do GLB demorado segura a fila até terminar (no máximo o prazo dele, 180 s): os comandos que
chegam nesse meio esperam e, se passarem do prazo deles, voltam com o erro de tempo sem rodar. É de propósito: nada
mexe na pegada enquanto o GLB é gravado. Cada mudança aparece na vista na hora (o laço de desenho já roda com a aba à mostra; a foto e a medida
desenham um quadro antes).

| cmd | args | faz |
| --- | --- | --- |
| `state` | — | personagem (`character`, `null` = player) e o player, arma e armas, clipe, animação, tempo, duração, tocando, pegada (`key`, `offsetCm`, `rotation` quaternion, `rotationDeg` Euler XYZ), osso selecionado, não salvo, a linha de estado |
| `setGrip` | `offsetCm?`, `rotationDeg?` ou `rotation?` | põe a pegada (empilha o desfazer, como o gizmo) |
| `nudgeGrip` | `moveCm?`, `rotateDeg?` (`[x, y, z]`) | soma à pegada no espaço do `RightHand`; o giro é em torno dos eixos do osso |
| `supportHand` | — | o botão "Mão esquerda no apoio" |
| `clip` | `name?`, `time?`, `weapon?` (`null` = sem arma), `playing?` | troca clipe e arma, pula para o tempo (pausa) ou toca |
| `camera` | `view?` (`front`/`back`/`left`/`right`/`top`/`bottom`), `focus?` (osso ou `weapon`), `distance?` (m, padrão 0,6) | põe a câmera em perspectiva no alvo, na direção da vista (sem vista: a direção atual) |
| `snapshot` | — | desenha um quadro e devolve o PNG da vista (base64, largura e altura) |
| `measure` | — | para cada mão, a palma (`PALM`, 8 cm no eixo dos dedos) e cada osso de dedo: a distância até a malha da arma (cm) e se está dentro dela (paridade de um raio); o menor de cada mão |
| `save` | `target`: `pose` ou `glb` (**`glb` sobrescreve sem diálogo**) | "Salvar pose" ou "Gravar no GLB do jogo". O `glb` sobrescreve o GLB e o JSON do skin **sem perguntar** (o comando já é a confirmação); o par anterior vai para o backup do gravar |

Conta pura em `rigRemoteGrip.ts` (pegada: soma, giro no espaço do osso, cm/graus) e `rigMeasure.ts` (distância de
ponto a triângulo e dentro/fora).

### 3. Ferramentas do MCP `cortex` (`mcp/tools/rig.ts`, `mcp/rigBridgeClient.ts`)

`rig_state`, `rig_set_grip`, `rig_nudge_grip`, `rig_support_hand`, `rig_clip`, `rig_camera`, `rig_snapshot`,
`rig_measure`, `rig_save`: cada uma manda o comando à ponte e devolve o JSON da resposta em texto. `rig_snapshot` grava o
PNG em `file` (padrão `<projeto>/.cortex/rig/snap-<carimbo>.png`) e devolve o caminho e a imagem. Sem a ponte: "Studio
não está aberto (sem ~/.cortex-studio/rig-bridge.json)".

### 4. Atalhos do painel (aba Animações, com arma na mão e a chave editável)

| tecla | faz |
| --- | --- |
| ← / → | arma −1 mm / +1 mm no X do `RightHand` |
| ↑ / ↓ | +1 mm / −1 mm no Y (os dedos) |
| PgUp / PgDn | +1 mm / −1 mm no Z |
| Alt + as mesmas | gira 1° em torno do mesmo eixo |
| F | foca a câmera no osso selecionado (na arma, se ela é a seleção; sem seleção, no `RightHand`) |

Ignoradas com foco em campo de texto ou seleção. Cada toque empilha o desfazer (Ctrl+Z volta).

## Consequências

- Outra sessão ajusta a pegada, vê a foto, mede e grava sem mouse. O Studio continua o dono da edição: a ponte só
  repassa.
- `runBake` ganha `confirm` opcional (o padrão continua o diálogo).
- `RigAnimationPreview` delega o quadro (`renderFrame`), a lista de clipes (`rigClipList.ts`) e libera o modelo por `rigDispose.ts` para caber no limite de
  linhas; `RigViewCamera.place` põe a câmera num alvo; `RigPlaybar` ganha `time`, `playing` e `seekTo`.

Testes: `tests/electron/rigRemoteGrip.test.ts`, `rigMeasure.test.ts`, `rigBridge.test.ts` (token, repasse,
tempo-limite, a fila) e `tests/mcp/rigTools.test.ts` (ferramentas contra uma ponte falsa).
