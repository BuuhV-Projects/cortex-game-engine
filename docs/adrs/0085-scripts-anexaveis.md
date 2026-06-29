# 0085 - Scripts anexáveis (componente Script no Inspector, estilo MonoBehaviour)

**Data:** 2026-06-29
**Status:** aceito

## Contexto

A lógica de gameplay ficava **hardcoded** no `main.ts` do jogo (cola monolítica: carro,
spawn, interação, sol, câmera…). O usuário quer o modelo da Unity: **seleciona um objeto e
adiciona um componente do tipo Script no Inspector**, configurando campos ali — nada de cola
no boot. Isso estende ao *comportamento* a regra que o engine já aplica à física: **dado da
cena, editável no Inspector, não código** (ver CLAUDE.md, [[inspector-live-realtime]]).

## Decisão

Modelo **MonoBehaviour-lite**:

- **`ScriptBehavior`** (base): hooks `onStart()` / `onUpdate(dt)` (dt em **segundos**) /
  `onDestroy()`; recebe injetados `entity`, `object3d` e `ctx` (`world/input/gamepad/scene/
  camera`); declara campos editáveis em **`static fields`** (schema estático — escolhido em vez
  de decorators: simples, sem config de build, casa com o Inspector declarativo).
- **`ScriptComponent`**: componente ECS com N slots (`{ type, fields, instance, started }`) —
  um nó pode ter vários scripts (como vários componentes num GameObject).
- **`ScriptRegistry`** (singleton de módulo): `registerScript(nome, classe)`. O jogo registra
  no boot; o host instancia por nome; o Inspector lista os nomes.
- **`ScriptHostSystem`**: instancia, injeta deps, aplica os campos, chama os hooks. **Pausa no
  editor** (`isEditing`) → scripts só rodam no Play, como na Unity. Exceção num script é logada
  (`debug('script', …)`) e não derruba os demais. O jogo o adiciona com o contexto.
- **Cena (dado)**: `node.scripts: [{ type, fields }]` (SceneDefinition); `buildScene` cria uma
  entidade com `ScriptComponent` por nó com scripts (qualquer tipo de nó). Overlay
  `data.scripts[id]` **vence** o código/JSON; reaplica no reload.
- **Inspector**: seção **"Scripts"** — "+ Adicionar Script" (dropdown dos registrados),
  campos renderizados pelo schema (number/checkbox/select/vec3) e botão remover. **Tudo ao
  vivo** (muta a instância em execução) + persiste em `data.scripts[id]` (`ScriptApi`/
  `ScriptAuthoring`). Undo do add/delete de nó (ADR-0084) já cobre `scripts` (em CONCERN_KEYS).

## Consequências

- As **classes** de script continuam TS (lógica é código) — o que some é a cola hardcoded:
  viram modulares/reusáveis, anexadas por **dado** e configuradas no Inspector. O `main.ts`
  só **registra scripts + adiciona o ScriptHostSystem**.
- **Limitações conhecidas (v1):** campos `string`/`asset` ainda não têm widget no Inspector
  (sem input de texto/upload) — mostram nota "(editar no JSON)"; fica pra fase 2. `onDestroy`
  por destruição de entidade não é automático (o Inspector chama no remover).
- **Fora do engine:** o botão "Criar Script" (gera o arquivo `.ts` e auto-registra) é da IDE
  (app) — o engine entrega base + registry + host + Inspector.
