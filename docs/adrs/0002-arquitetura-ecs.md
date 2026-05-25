# 0002 - Arquitetura Entity-Component-System (ECS)

**Data:** 2026-05-24
**Status:** aceito

## Contexto

O motor precisa de uma forma de organizar objetos de jogo (GameObjects) e comportamentos. As abordagens consideradas foram:

- **Herança profunda (OOP clássico)**: `GameObject → MovableObject → PhysicsObject → Player`. Difícil de compor comportamentos sem herança múltipla; cria acoplamento rígido.
- **Composition via mixins**: mais flexível, mas sem separação clara entre dados e lógica, dificultando otimizações futuras (ex: cache de componentes do mesmo tipo).
- **ECS (Entity-Component-System)**: entidades são IDs, componentes são dados puros, sistemas contêm a lógica. Padrão consolidado em engines modernos (Unity DOTS, Entt, Bevy).

## Decisão

Adotar **ECS** com três classes fundamentais:

- **`Entity`** (`src/ecs/Entity.js`): wrapper com UUID gerado por `crypto.randomUUID()`, armazena componentes num `Map<string, Component>`. Métodos: `addComponent`, `removeComponent`, `getComponent`, `hasComponent`.
- **`Component`** (`src/ecs/Component.js`): classe base com flag `enabled`. Subclasses carregam apenas dados (ex: `TransformComponent`, `MeshComponent`).
- **`System`** (`src/ecs/System.js`): classe base com método `update(entities, deltaTime)`. Cada sistema declara quais tipos de componentes consulta.
- **`World`** (`src/ecs/World.js`): registro central. Métodos: `createEntity`, `destroyEntity`, `addSystem`, `removeSystem`, `query(ComponentTypes[])`, `tick(deltaTime)`. Itera sistemas em ordem de prioridade.

O `World.tick()` é chamado pelo `GameLoop` a cada frame (variável) e a cada passo fixo de física.

## Consequências

- **Positivo**: comportamentos completamente compostos — sem herança; ideal para scripts gerados por IA que adicionam componentes/sistemas avulsos.
- **Positivo**: `World.query()` permite que a IA inspecione o estado da cena programaticamente.
- **Negativo**: para cenas muito simples, ECS é mais verboso que subclasses diretas.
- **Negativo**: sem SoA (Structure of Arrays) nesta versão — desempenho suficiente para o escopo atual, mas limitado para milhares de entidades.
