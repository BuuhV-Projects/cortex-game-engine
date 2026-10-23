# ADR-0415 - Autopiloto de medição injeta no `navigator.getGamepads`

**Data:** 2026-10-23
**Status:** aceito
**Relacionados:** SPEC-0414 (formato e comportamento), ADR-0164 (ações nomeadas), SPEC-0382 (kit de medição), PRD-0009

## Contexto

As rodadas de perf do PRD-0009 medem o jogador parado num ponto (`?spawn=`) ou dirigindo pelo
recurso do próprio jogo (`&drive=1`). Parado não mostra as quedas de fps de quem joga: streaming ao
andar, câmera girando por conteúdo novo, efeitos de tiro, pulo, troca a pé ↔ carro. Precisamos de um
jogador automático que faça isso, em qualquer jogo, sem mudar o jogo.

Todo jogo da casa é 100% jogável no controle do Xbox, então um **controle virtual** que entra pelo
mesmo caminho do controle real exercita o mesmo código do jogador. A dúvida é **onde** injetar.

## Alternativas

1. **Embrulhar `navigator.getGamepads`** (escolhida). É o ponto onde o controle real entra, tanto no
   browser/Studio quanto no host nativo (o shim `native/js/src/shims/input-bridge.js` atribui a
   função). Vale para o `GamepadManager`, para o `InputActions` e para qualquer código que leia o
   pad cru (o caminho legado da UI fazia isso).
2. **Fonte virtual no `GamepadManager`** (`poll()` leria um pad falso). Pega quase tudo, mas não pega
   quem chama `navigator.getGamepads()` direto, e mexe numa classe quente (roda todo quadro).
3. **Forçar ações no `InputActions`** (`isDown('jump') = true`). Pula o mapeamento de bindings, então
   não mede o caminho real (um binding errado passaria despercebido) e depende do nome da ação que
   cada jogo inventou (`aim`, `fire`, `vehicle` do DDD 61): perfil deixaria de ser genérico.
4. **Injetar no C++ do host** (SDL virtual). Só valeria no export, não no Studio, e exige rebuild.

## Decisão

Opção 1. Um módulo `src/input/InputAutopilot.ts` monta um objeto com a forma do `Gamepad` da W3C
(layout `standard`, `padLayout.ts`) e troca `navigator.getGamepads` por uma função que devolve
`[padVirtual, null, null, null]`. O `Game` só cria o autopiloto quando a query tem `?autopilot=`.
Sem a query, nada é instalado: custo zero.

## Consequências

- Com o autopiloto ligado o controle real fica escondido (o slot 0 é do virtual): é instrumento de
  medição, não modo de jogo.
- No Studio o gate de foco do `GamepadManager` (SPEC-0067) continua valendo: sem foco, o pad
  virtual também não é lido. No host nativo não há gate.
- O roteiro é por botões e eixos do Xbox, não por ação: o mesmo perfil serve a qualquer jogo, e o
  que o jogo faz com o botão é problema dele. Se o jogo não responder a um botão pelo pad virtual, é
  porque também não responde ao controle real (achado da regra do controle Xbox).
