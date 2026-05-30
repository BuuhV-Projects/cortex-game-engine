# Primeiro jogo

Roteiro mínimo: do projeto vazio a uma cena 3D rodando.

## Estrutura do projeto

Cada projeto criado pela IDE segue o padrão arquitetural ECS:

```
meu-jogo/
├── components/   Só dados — classes extends Component
├── systems/      Só lógica — classes extends System
├── entities/     Factories — funções que montam entities
├── scenes/       Setup de cena/level
├── assets/       .glb, texturas, sons
├── utils/        Helpers genéricos
├── main.ts       Bootstrap (World + GameLoop + Renderer)
└── vendor/cortex-game-engine/
```

## Bootstrap

O `main.ts` recém-criado já liga `World`, `GameLoop`, `Renderer` e
chama a cena inicial. Você não precisa mexer ali pra começar.

## Adicionar uma entity

Em `entities/cube.ts`:

```ts
import { Mesh, BoxGeometry, MeshStandardMaterial } from 'cortex-game-engine'
import type { Entity, World } from 'cortex-game-engine'

export function createCube(world: World): Entity {
  const entity = world.createEntity()
  const mesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0x44aaff }),
  )
  // ...adicionar componentes que carregam o mesh + posição
  return entity
}
```

Imports vêm sempre de `'cortex-game-engine'` — nunca de `'three'`
direto. O alias do Vite resolve pro bundle vendoriado.

## Conversar com a IA

Abre o chat na sidebar direita e descreve o que quer. O agente lê o
projeto inteiro (sandbox), e pode escrever arquivos novos, editar
existentes e rodar comandos no terminal embutido — sempre pedindo
aprovação antes (modo `ask`) ou agindo direto (modo `auto`).

Exemplos de pedidos que funcionam bem:

- "Crie um sistema que faz o cubo rotacionar no eixo Y."
- "Adicione uma luz direcional na cena com sombras ativas."
- "Substitua o cubo por uma esfera azul-claro."

## Gerar instalador

Quando o jogo estiver pronto para distribuir:

1. Menu → Projeto → **Gerar instalador...** (atalho `Ctrl+Shift+B`).
2. Na primeira vez, a IDE configura Tauri no projeto (cria
   `src-tauri/`, gera ícones placeholder, roda `yarn install`).
3. Clicar de novo — o `.exe` sai em
   `src-tauri/target/release/bundle/nsis/`.

Detalhes em [Instalação](#instalacao).
