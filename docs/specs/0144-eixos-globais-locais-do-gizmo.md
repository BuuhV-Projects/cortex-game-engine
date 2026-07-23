# 0144 - Eixos globais ↔ locais do gizmo (tecla `X`)

**Data:** 2026-07-23
**Status:** aceito

## Contexto

O gizmo de transform do editor (`TransformControls`) sempre usou o default do
three.js, `space: 'world'` — o `ObjectEditSystem` nunca chamava `setSpace`. Isso
passou anos sem incomodar porque as cenas eram autoradas com os objetos **alinhados
aos eixos do mundo**: com rotação zero, eixos globais e locais coincidem.

O problema apareceu quando uma fase passou a **rotacionar as peças** pra acompanhar
um percurso diagonal (`space-1` do `teste4` gira cada plataforma com `rotY` pra
alinhar o lado curto do asteroide ao traçado). Aí os eixos do gizmo deixaram de
seguir o objeto: pra empurrar uma plataforma "pra frente dela mesma" era preciso
girar a peça, mover e desgirar — o relato foi "os eixos estão tortos, não movem em
linha reta".

Não é um bug de quem girou a cena: qualquer editor 3D oferece os dois espaços
(Unity: Global/Local; Blender: Global/Local/Normal). Faltava a opção.

## Decisão

`ObjectEditSystem` ganhou `gizmoSpace` (getter) e **`setGizmoSpace('world' | 'local')`**,
com a tecla **`X`** alternando entre os dois — vizinha das teclas de modo já
existentes (`1` mover, `2` girar, `3` escalar) e o mesmo atalho da Unity. Um toast
confirma o estado ("Eixos: globais (mundo)" / "locais (do objeto)"). O atalho está
listado no popover "Atalhos" do viewport (`electron/renderer/Preview.ts`).

O default é **local** (o three.js começa em `world`, então o sistema chama
`setSpace` na criação do gizmo). A escolha reflete o uso real: as cenas daqui são
autoradas com peças rotacionadas, e é nelas que o espaço importa — em objeto sem
rotação os dois espaços coincidem, então o default não atrapalha ninguém.

A ponte com a IDE (`EditorBridge`) aceita a mensagem `{ type: 'gizmoSpace', space }`
e o `attachEditor` liga o callback `onGizmoSpace`, então a IDE pode expor o toggle
como botão junto dos de ferramenta.

## Consequências

- **`scale` continua sempre local** — limitação do `TransformControls` do three.js
  (`space = 'local'` forçado no modo escala); o toggle afeta mover e girar.
- Cena com peças rotacionadas passa a ser editável sem gambiarra. Vale pra qualquer
  fase autorada em "coordenadas de traçado" (percurso diagonal), que é o padrão novo
  das fases espaciais do `teste4`.
- A tecla `X` entra no conjunto de atalhos do viewport; como os demais, é ignorada
  quando o foco está num campo de texto do Inspector.
